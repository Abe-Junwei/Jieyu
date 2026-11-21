import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  queueUnreferencedAttachment,
  readAttachmentFile,
  storeAttachmentFile,
} from './attachments';
import { createLayer } from './layers';
import { provenanceSchema } from '../provenanceSchema';
import { putUnitTextDraft, readUnitTextDraft } from './textSave';

type SqliteDatabase = InstanceType<typeof Database>;

export type RecordingKind = 'voice' | 'oral';

export interface RecordingPairInput {
  hostLayerId: string;
  kind: RecordingKind;
  audioName: Record<string, string>;
  textName: Record<string, string>;
}

export interface RecordingPair {
  audioLayerId: string;
  textLayerId: string;
}

export interface RecordingAttach {
  unitId: string;
  layerId: string;
  mimeType: string;
  bytes: Uint8Array;
  operationId: string;
}

export interface RecordingClipRef {
  unitId: string;
  fileId: string;
}

interface HostRow {
  id: string;
  manuscript_id: string;
  tier_type: string;
  content_type: string;
  language_id: string | null;
  deleted_at: string | null;
}

export function createRecordingPair(db: SqliteDatabase, input: RecordingPairInput): RecordingPair {
  const write = db.transaction(() => {
    const host = db
      .prepare(
        `SELECT id, manuscript_id, tier_type, content_type, language_id, deleted_at
         FROM layers WHERE id = ?`,
      )
      .get(input.hostLayerId) as HostRow | undefined;
    if (
      host === undefined ||
      host.deleted_at !== null ||
      host.tier_type !== 'time-aligned' ||
      host.content_type !== 'transcription'
    ) {
      throw new Error('recording host is not a transcription layer');
    }
    const content = pairContent(input.kind);
    const taken = db
      .prepare(
        `SELECT layers.id FROM layers
         JOIN layer_links ON layer_links.layer_id = layers.id AND layer_links.is_preferred = 1
         WHERE layer_links.host_layer_id = ?
           AND layers.deleted_at IS NULL
           AND layers.modality = 'audio'
           AND layers.content_type = ?`,
      )
      .get(host.id, content) as { id: string } | undefined;
    if (taken !== undefined) throw new Error('recording pair already exists');
    const prefix = input.kind === 'voice' ? 'rec-voice' : 'rec-oral';
    const sort = db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) AS n FROM layers WHERE manuscript_id = ?')
      .get(host.manuscript_id) as { n: number };
    const hosts = [{ hostLayerId: host.id, preferred: true as const }];
    const audio = createLayer(db, {
      manuscriptId: host.manuscript_id,
      key: freeKey(db, host.manuscript_id, prefix),
      name: input.audioName,
      tierType: 'symbolic-association',
      contentType: content,
      languageId: host.language_id,
      sortOrder: sort.n + 1,
      hosts,
    });
    db.prepare(`UPDATE layers SET modality = 'audio', updated_at = ? WHERE id = ?`).run(
      new Date().toISOString(),
      audio.id,
    );
    const text = createLayer(db, {
      manuscriptId: host.manuscript_id,
      key: freeKey(db, host.manuscript_id, `${prefix}-text`),
      name: input.textName,
      tierType: 'symbolic-association',
      contentType: content,
      languageId: host.language_id,
      parentId: audio.id,
      sortOrder: sort.n + 2,
      hosts,
    });
    return { audioLayerId: audio.id, textLayerId: text.id };
  });
  return write();
}

export function attachRecording(
  db: SqliteDatabase,
  folder: string,
  input: RecordingAttach,
): { fileId: string; replacedFileId: string | null } {
  const stored = storeAttachmentFile(db, folder, {
    kind: 'audio',
    mimeType: input.mimeType,
    bytes: input.bytes,
    operationId: input.operationId,
  });
  try {
    return db.transaction(() => {
      const layer = audioLayer(db, input.layerId);
      const unit = db.prepare('SELECT layer_id FROM units WHERE id = ?').get(input.unitId) as
        { layer_id: string } | undefined;
      if (unit === undefined) throw new Error('unit is missing');
      if (unit.layer_id !== preferredHost(db, layer.id)) {
        throw new Error('unit is not on the recording host');
      }
      const existing = db
        .prepare(
          `SELECT id, audio_file_id FROM unit_texts
           WHERE unit_id = ? AND layer_id = ? AND role = ?`,
        )
        .get(input.unitId, layer.id, layer.content_type) as
        { id: string; audio_file_id: string | null } | undefined;
      const now = new Date().toISOString();
      const previous = existing?.audio_file_id ?? null;
      if (existing === undefined) {
        db.prepare(
          `INSERT INTO unit_texts (id, unit_id, layer_id, role, body, audio_file_id, updated_at)
           VALUES (?, ?, ?, ?, '', ?, ?)`,
        ).run(randomUUID(), input.unitId, layer.id, layer.content_type, stored.fileId, now);
      } else {
        db.prepare(`UPDATE unit_texts SET audio_file_id = ?, updated_at = ? WHERE id = ?`).run(
          stored.fileId,
          now,
          existing.id,
        );
      }
      if (previous !== null && previous !== stored.fileId)
        queueUnreferencedAttachment(db, previous);
      return {
        fileId: stored.fileId,
        replacedFileId: previous !== null && previous !== stored.fileId ? previous : null,
      };
    })();
  } catch (error) {
    queueUnreferencedAttachment(db, stored.fileId);
    throw error;
  }
}

export function detachRecording(
  db: SqliteDatabase,
  input: { unitId: string; layerId: string },
): { fileId: string } {
  return db.transaction(() => {
    const layer = audioLayer(db, input.layerId);
    const existing = db
      .prepare(
        `SELECT id, body, audio_file_id FROM unit_texts
         WHERE unit_id = ? AND layer_id = ? AND role = ?`,
      )
      .get(input.unitId, layer.id, layer.content_type) as
      { id: string; body: string; audio_file_id: string | null } | undefined;
    if (existing?.audio_file_id == null) throw new Error('recording is missing');
    if (existing.body === '') {
      db.prepare('DELETE FROM unit_texts WHERE id = ?').run(existing.id);
    } else {
      db.prepare(`UPDATE unit_texts SET audio_file_id = NULL, updated_at = ? WHERE id = ?`).run(
        new Date().toISOString(),
        existing.id,
      );
    }
    queueUnreferencedAttachment(db, existing.audio_file_id);
    return { fileId: existing.audio_file_id };
  })();
}

export function recordingFileId(
  db: SqliteDatabase,
  unitId: string,
  layerId: string,
): string | null {
  const row = db
    .prepare(
      `SELECT audio_file_id FROM unit_texts
       WHERE unit_id = ? AND layer_id = ? AND audio_file_id IS NOT NULL`,
    )
    .get(unitId, layerId) as { audio_file_id: string } | undefined;
  return row?.audio_file_id ?? null;
}

/** Write the transcript only when the clip it heard is still the clip on the card. */
export function commitOralTranscript(
  db: SqliteDatabase,
  input: {
    unitId: string;
    audioLayerId: string;
    fileId: string;
    text: string;
    model: string;
    modelVersion: string;
  },
): OralTranscript {
  if (recordingFileId(db, input.unitId, input.audioLayerId) !== input.fileId) {
    throw new Error('oral source changed');
  }
  return proposeOralDraft(db, input);
}

export function readRecording(
  db: SqliteDatabase,
  folder: string,
  input: { unitId: string; layerId: string },
): { mimeType: string; bytes: Uint8Array } {
  const row = db
    .prepare(
      `SELECT audio_file_id FROM unit_texts
       WHERE unit_id = ? AND layer_id = ? AND audio_file_id IS NOT NULL`,
    )
    .get(input.unitId, input.layerId) as { audio_file_id: string } | undefined;
  if (row === undefined) throw new Error('recording is missing');
  return readAttachmentFile(db, folder, row.audio_file_id);
}

export interface OralTranscript {
  textLayerId: string;
}

interface OralEngine {
  model: string;
  modelVersion: string;
}

const oralEngines = new Map<string, OralEngine>();

function oralEngineKey(unitId: string, textLayerId: string): string {
  return `${unitId}\n${textLayerId}`;
}

/** The child text layer's draft. Saving that draft stamps `engine`; discarding drops it. */
export function proposeOralDraft(
  db: SqliteDatabase,
  input: {
    unitId: string;
    audioLayerId: string;
    text: string;
    model: string;
    modelVersion: string;
  },
): OralTranscript {
  const layer = audioLayer(db, input.audioLayerId);
  const child = db
    .prepare(
      `SELECT id FROM layers
       WHERE parent_id = ? AND modality = 'text' AND deleted_at IS NULL AND content_type = ?`,
    )
    .get(layer.id, layer.content_type) as { id: string } | undefined;
  if (child === undefined) throw new Error('oral text layer is missing');
  if (readUnitTextDraft(db, input.unitId, child.id) !== null) {
    throw new Error('oral draft exists');
  }
  const stored = db
    .prepare(`SELECT body FROM unit_texts WHERE unit_id = ? AND layer_id = ? AND role = ?`)
    .get(input.unitId, child.id, layer.content_type) as { body: string } | undefined;
  const base = stored?.body ?? '';
  if (input.text !== base) {
    const engine = { model: input.model, modelVersion: input.modelVersion };
    putUnitTextDraft(db, {
      unitId: input.unitId,
      textLayerId: child.id,
      rawInput: input.text,
      baseBody: base,
      provenanceJson: oralProvenanceJson(engine),
    });
    oralEngines.set(oralEngineKey(input.unitId, child.id), engine);
  }
  return { textLayerId: child.id };
}

export function peekOralEngine(unitId: string, textLayerId: string): OralEngine | undefined {
  return oralEngines.get(oralEngineKey(unitId, textLayerId));
}

export function dropOralEngine(unitId: string, textLayerId: string): void {
  oralEngines.delete(oralEngineKey(unitId, textLayerId));
}

export function clearOralEngines(): void {
  oralEngines.clear();
}

export function oralProvenanceJson(engine: OralEngine): string {
  return JSON.stringify(
    provenanceSchema.parse({
      actorType: 'ai',
      method: 'auto-transcription',
      model: engine.model,
      modelVersion: engine.modelVersion,
      createdAt: new Date().toISOString(),
    }),
  );
}

export function listRecordings(db: SqliteDatabase, layerId: string): RecordingClipRef[] {
  const rows = db
    .prepare(
      `SELECT unit_id, audio_file_id FROM unit_texts
       WHERE layer_id = ? AND audio_file_id IS NOT NULL
       ORDER BY unit_id`,
    )
    .all(layerId) as { unit_id: string; audio_file_id: string }[];
  return rows.map((row) => ({ unitId: row.unit_id, fileId: row.audio_file_id }));
}

function pairContent(kind: RecordingKind): 'transcription' | 'translation' {
  switch (kind) {
    case 'voice':
      return 'transcription';
    case 'oral':
      return 'translation';
    default: {
      const neverKind: never = kind;
      throw new Error(neverKind);
    }
  }
}

function freeKey(db: SqliteDatabase, manuscriptId: string, base: string): string {
  const rows = db.prepare('SELECT key FROM layers WHERE manuscript_id = ?').all(manuscriptId) as {
    key: string;
  }[];
  const taken = new Set(rows.map((row) => row.key));
  if (!taken.has(base)) return base;
  let count = 2;
  while (taken.has(`${base}-${count}`)) count += 1;
  return `${base}-${count}`;
}

function audioLayer(db: SqliteDatabase, layerId: string): { id: string; content_type: string } {
  const layer = db
    .prepare(`SELECT id, content_type, modality, deleted_at FROM layers WHERE id = ?`)
    .get(layerId) as
    { id: string; content_type: string; modality: string; deleted_at: string | null } | undefined;
  if (layer === undefined || layer.deleted_at !== null || layer.modality !== 'audio') {
    throw new Error('recording layer is not audio');
  }
  return layer;
}

function preferredHost(db: SqliteDatabase, layerId: string): string {
  const link = db
    .prepare(`SELECT host_layer_id FROM layer_links WHERE layer_id = ? AND is_preferred = 1`)
    .get(layerId) as { host_layer_id: string } | undefined;
  if (link === undefined) throw new Error('unit is not on the recording host');
  return link.host_layer_id;
}
