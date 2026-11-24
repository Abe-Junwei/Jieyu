import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { withEditReceipt } from './editReceipts';
import { rememberSessionEdit } from './sessionEdit';
import { manuscriptIdOf } from './unitEdges';
import { readRemovedUnit } from './unitSpan';
import { createUnit, type Unit } from './units';

type SqliteDatabase = InstanceType<typeof Database>;

export interface TranscriptionTarget {
  id: string;
  name: Record<string, string>;
  tierType: string;
  host: boolean;
}

export interface TranscriptionTargetList {
  manuscriptId: string;
  hostLayerId: string;
  contentType: 'transcription' | 'translation';
  targets: TranscriptionTarget[];
}

export type TranscriptionPlan =
  | {
      action: 'write';
      unitId: string;
      textLayerId: string;
      longer: boolean;
      host: boolean;
      hasBody: boolean;
    }
  | {
      action: 'choose';
      textLayerId: string;
      units: { id: string; startMs: number; endMs: number; longer: boolean }[];
    }
  | {
      action: 'create';
      textLayerId: string;
      startMs: number;
      endMs: number;
      speakerId: string | null;
      empty: boolean;
    };

export interface TranscriptionChoice {
  targetUnitId?: string;
  createUnit?: boolean;
  confirmHost?: boolean;
  confirmLonger?: boolean;
}

export type TranscriptionPlacement =
  | { kind: 'write'; unitId: string; textLayerId: string }
  | {
      kind: 'create';
      textLayerId: string;
      startMs: number;
      endMs: number;
      speakerId: string | null;
    };

interface LayerRow {
  id: string;
  manuscript_id: string;
  name_json: string;
  tier_type: string;
  content_type: string;
  modality: string;
  deleted_at: string | null;
}

interface Span {
  start: number;
  end: number;
  speakerId: string | null;
}

/** Clears parent_id on text layers hanging off an audio layer. Not a format bump. */
export function detachRecordingTextParents(db: SqliteDatabase): void {
  db.prepare(
    `UPDATE layers
     SET parent_id = NULL, updated_at = ?
     WHERE id IN (
       SELECT child.id
       FROM layers AS child
       JOIN layers AS parent ON parent.id = child.parent_id
       WHERE child.modality = 'text' AND parent.modality = 'audio'
     )`,
  ).run(new Date().toISOString());
}

export function listTranscriptionTargets(
  db: SqliteDatabase,
  audioLayerId: string,
): TranscriptionTargetList {
  const audio = audioRow(db, audioLayerId);
  const hostId = preferredHost(db, audio.id);
  if (hostId === null) throw new Error('unit is not on the recording host');
  const layers = db
    .prepare(
      `SELECT id, manuscript_id, name_json, tier_type, content_type, modality, deleted_at
       FROM layers WHERE manuscript_id = ?`,
    )
    .all(audio.manuscript_id) as LayerRow[];
  const targets = layers.flatMap((layer) => {
    const hit = eligible(db, layer, audio.content_type, hostId);
    if (hit === null) return [];
    return [
      { id: layer.id, name: readName(layer.name_json), tierType: layer.tier_type, host: hit },
    ];
  });
  return {
    manuscriptId: audio.manuscript_id,
    hostLayerId: hostId,
    contentType: audio.content_type,
    targets,
  };
}

export function planTranscription(
  db: SqliteDatabase,
  input: { unitId: string; audioLayerId: string; targetLayerId: string },
): TranscriptionPlan {
  const listed = listTranscriptionTargets(db, input.audioLayerId);
  if (!listed.targets.some((target) => target.id === input.targetLayerId)) {
    throw new Error('transcription target is not allowed');
  }
  const target = listed.targets.find((item) => item.id === input.targetLayerId);
  if (target === undefined) throw new Error('transcription target is not allowed');
  if (target.host || target.tierType === 'symbolic-association') {
    const unit = db.prepare('SELECT layer_id FROM units WHERE id = ?').get(input.unitId) as
      { layer_id: string } | undefined;
    if (unit === undefined || unit.layer_id !== listed.hostLayerId) {
      throw new Error('unit is not on the recording host');
    }
    assertNoDraft(db, input.unitId, target.id);
    return {
      action: 'write',
      unitId: input.unitId,
      textLayerId: target.id,
      longer: false,
      host: target.host,
      hasBody: bodyOf(db, input.unitId, target.id).length > 0,
    };
  }
  const span = sourceSpan(db, input.unitId, listed.hostLayerId);
  const units = db
    .prepare('SELECT id, start_ms, end_ms FROM units WHERE layer_id = ?')
    .all(target.id) as { id: string; start_ms: number | null; end_ms: number | null }[];
  const containers = units.flatMap((unit) => {
    if (unit.start_ms === null || unit.end_ms === null) return [];
    if (unit.start_ms > span.start || unit.end_ms < span.end) return [];
    return [
      {
        id: unit.id,
        startMs: unit.start_ms,
        endMs: unit.end_ms,
        longer: unit.start_ms !== span.start || unit.end_ms !== span.end,
      },
    ];
  });
  if (containers.length > 1) return { action: 'choose', textLayerId: target.id, units: containers };
  if (containers.length === 1) {
    const chosen = containers[0];
    if (chosen === undefined) throw new Error('transcription target is not allowed');
    assertNoDraft(db, chosen.id, target.id);
    return {
      action: 'write',
      unitId: chosen.id,
      textLayerId: target.id,
      longer: chosen.longer,
      host: false,
      hasBody: bodyOf(db, chosen.id, target.id).length > 0,
    };
  }
  return {
    action: 'create',
    textLayerId: target.id,
    startMs: span.start,
    endMs: span.end,
    speakerId: span.speakerId,
    empty: units.length === 0,
  };
}

export function assertTranscriptionWrite(
  db: SqliteDatabase,
  input: {
    unitId: string;
    audioLayerId: string;
    targetLayerId: string;
  } & TranscriptionChoice,
): TranscriptionPlacement {
  const plan = planTranscription(db, input);
  if (plan.action === 'choose') {
    const picked = plan.units.find((unit) => unit.id === input.targetUnitId);
    if (picked === undefined) throw new Error('transcription target is ambiguous');
    assertNoDraft(db, picked.id, plan.textLayerId);
    if (picked.longer && input.confirmLonger !== true) {
      throw new Error('transcription target is longer');
    }
    return { kind: 'write', unitId: picked.id, textLayerId: plan.textLayerId };
  }
  if (plan.action === 'create') {
    if (!plan.empty && input.createUnit !== true) {
      throw new Error('transcription target needs a segment');
    }
    return {
      kind: 'create',
      textLayerId: plan.textLayerId,
      startMs: plan.startMs,
      endMs: plan.endMs,
      speakerId: plan.speakerId,
    };
  }
  if (plan.host && input.confirmHost !== true) throw new Error('transcription host overwrite');
  if (plan.longer && input.confirmLonger !== true)
    throw new Error('transcription target is longer');
  return { kind: 'write', unitId: plan.unitId, textLayerId: plan.textLayerId };
}

/** Same undo stack and edit receipt as a manual unit create. */
export function recordTranscriptionUnit(
  db: SqliteDatabase,
  sessionId: string,
  input: {
    layerId: string;
    startMs: number;
    endMs: number;
    speakerId: string | null;
    operationId?: string;
  },
  commitDraft?: (unitId: string) => void,
): Unit {
  const create = {
    layerId: input.layerId,
    startMs: input.startMs,
    endMs: input.endMs,
    text: '',
    ...(input.speakerId === null ? {} : { speakerId: input.speakerId }),
  };
  const operationId = input.operationId ?? randomUUID();
  let committed = false;
  let saved: { unit: Unit; tree: ReturnType<typeof readRemovedUnit> };
  try {
    saved = db.transaction(() => {
      const unit = withEditReceipt(
        db,
        {
          operationId,
          kind: 'create',
          payload: create,
          manuscriptId: (created) => manuscriptIdOf(db, created.id),
        },
        () => {
          const created = createUnit(db, create);
          commitDraft?.(created.id);
          committed = true;
          return created;
        },
      );
      return { unit, tree: readRemovedUnit(db, unit.id, true) };
    })();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('same speaker intervals overlap')) {
      throw new Error('speaker time overlaps');
    }
    throw error;
  }
  if (committed)
    rememberSessionEdit(sessionId, {
      kind: 'create',
      undo: { manuscriptId: manuscriptIdOf(db, saved.unit.id), tree: saved.tree },
    });
  return saved.unit;
}

function eligible(
  db: SqliteDatabase,
  layer: LayerRow,
  content: 'transcription' | 'translation',
  hostId: string,
): boolean | null {
  if (layer.deleted_at !== null || layer.modality !== 'text' || layer.content_type !== content) {
    return null;
  }
  if (layer.id === hostId) return layer.tier_type === 'time-aligned' ? true : null;
  if (layer.tier_type === 'symbolic-association' && preferredHost(db, layer.id) === hostId) {
    return false;
  }
  if (layer.tier_type === 'time-aligned' && content === 'transcription') return false;
  return null;
}

function audioRow(
  db: SqliteDatabase,
  layerId: string,
): LayerRow & { content_type: 'transcription' | 'translation' } {
  const layer = db
    .prepare(
      `SELECT id, manuscript_id, name_json, tier_type, content_type, modality, deleted_at
       FROM layers WHERE id = ?`,
    )
    .get(layerId) as LayerRow | undefined;
  if (
    layer === undefined ||
    layer.deleted_at !== null ||
    layer.modality !== 'audio' ||
    (layer.content_type !== 'transcription' && layer.content_type !== 'translation')
  ) {
    throw new Error('recording layer is not audio');
  }
  return layer as LayerRow & { content_type: 'transcription' | 'translation' };
}

function preferredHost(db: SqliteDatabase, layerId: string): string | null {
  const link = db
    .prepare('SELECT host_layer_id FROM layer_links WHERE layer_id = ? AND is_preferred = 1')
    .get(layerId) as { host_layer_id: string } | undefined;
  return link?.host_layer_id ?? null;
}

function sourceSpan(db: SqliteDatabase, unitId: string, hostId: string): Span {
  const unit = db
    .prepare('SELECT layer_id, start_ms, end_ms, speaker_id FROM units WHERE id = ?')
    .get(unitId) as
    | {
        layer_id: string;
        start_ms: number | null;
        end_ms: number | null;
        speaker_id: string | null;
      }
    | undefined;
  if (unit === undefined || unit.layer_id !== hostId)
    throw new Error('unit is not on the recording host');
  if (
    unit.start_ms === null ||
    unit.end_ms === null ||
    !Number.isInteger(unit.start_ms) ||
    !Number.isInteger(unit.end_ms) ||
    unit.end_ms <= unit.start_ms
  ) {
    throw new Error('recording span is missing');
  }
  return { start: unit.start_ms, end: unit.end_ms, speakerId: unit.speaker_id };
}

function assertNoDraft(db: SqliteDatabase, unitId: string, textLayerId: string): void {
  const row = db
    .prepare('SELECT 1 AS ok FROM unit_text_drafts WHERE unit_id = ? AND layer_id = ?')
    .get(unitId, textLayerId);
  if (row !== undefined) throw new Error('oral draft exists');
}

function bodyOf(db: SqliteDatabase, unitId: string, textLayerId: string): string {
  const row = db
    .prepare('SELECT body FROM unit_texts WHERE unit_id = ? AND layer_id = ?')
    .get(unitId, textLayerId) as { body: string } | undefined;
  return row?.body ?? '';
}

function readName(json: string): Record<string, string> {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  const name: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'string') name[key] = value;
  }
  return name;
}
