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
import { audiosOfText, insertTextAudio, repackTextAudios } from './unitTextAudios';
import { TEXT_AUDIO_CAP } from '../../utils/textAudioCap';
import { listTranscriptionTargets } from './recordingTarget';

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
}

export interface RecordingAttach {
  unitId: string;
  layerId: string;
  mimeType: string;
  bytes: Uint8Array;
  operationId: string;
}

export interface RecordingClipRef {
  id: string;
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
    // textName stays on the request so older callers still send it. No text layer is created.
    return { audioLayerId: audio.id };
  });
  return write();
}

export function attachRecording(
  db: SqliteDatabase,
  folder: string,
  input: RecordingAttach,
): { fileId: string; audioId: string; replacedFileId: string | null } {
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
          `SELECT id FROM unit_texts
           WHERE unit_id = ? AND layer_id = ? AND role = ?`,
        )
        .get(input.unitId, layer.id, layer.content_type) as { id: string } | undefined;
      const now = new Date().toISOString();
      const textId = existing?.id ?? randomUUID();
      if (existing === undefined) {
        db.prepare(
          `INSERT INTO unit_texts (id, unit_id, layer_id, role, body, updated_at)
           VALUES (?, ?, ?, ?, '', ?)`,
        ).run(textId, input.unitId, layer.id, layer.content_type, now);
      }
      const clips = audiosOfText(db, textId);
      const replay = clips.find((clip) => clip.file_id === stored.fileId);
      if (replay) return { fileId: stored.fileId, audioId: replay.id, replacedFileId: null };
      if (clips.length >= TEXT_AUDIO_CAP) throw new Error('oral clip cap');
      const audioId = randomUUID();
      insertTextAudio(db, {
        id: audioId,
        unit_text_id: textId,
        file_id: stored.fileId,
        position: clips.length + 1,
      });
      return { fileId: stored.fileId, audioId, replacedFileId: null };
    })();
  } catch (error) {
    queueUnreferencedAttachment(db, stored.fileId);
    throw error;
  }
}

export function detachRecording(
  db: SqliteDatabase,
  input: { unitId: string; layerId: string; audioId?: string },
): { fileId: string } {
  return db.transaction(() => {
    const layer = audioLayer(db, input.layerId);
    const existing = db
      .prepare(
        `SELECT id, body FROM unit_texts
         WHERE unit_id = ? AND layer_id = ? AND role = ?`,
      )
      .get(input.unitId, layer.id, layer.content_type) as { id: string; body: string } | undefined;
    const clips = existing === undefined ? [] : audiosOfText(db, existing.id);
    const clip =
      input.audioId === undefined ? clips[0] : clips.find((row) => row.id === input.audioId);
    if (clip === undefined) throw new Error('recording is missing');
    if (existing !== undefined && existing.body === '' && clips.length === 1) {
      db.prepare('DELETE FROM unit_texts WHERE id = ?').run(existing.id);
    } else if (existing !== undefined) {
      db.prepare('DELETE FROM unit_text_audios WHERE id = ?').run(clip.id);
      repackTextAudios(db, existing.id);
    }
    queueUnreferencedAttachment(db, clip.file_id);
    return { fileId: clip.file_id };
  })();
}

export function recordingFileId(
  db: SqliteDatabase,
  unitId: string,
  layerId: string,
  audioId?: string,
): string | null {
  if (audioId !== undefined) return clipFileId(db, unitId, layerId, audioId);
  const row = db
    .prepare(
      `SELECT unit_text_audios.file_id AS fileId
       FROM unit_text_audios
       JOIN unit_texts ON unit_texts.id = unit_text_audios.unit_text_id
       WHERE unit_texts.unit_id = ? AND unit_texts.layer_id = ?
       ORDER BY unit_text_audios.position
       LIMIT 1`,
    )
    .get(unitId, layerId) as { fileId: string } | undefined;
  return row?.fileId ?? null;
}

function clipStillAttached(
  db: SqliteDatabase,
  unitId: string,
  layerId: string,
  fileId: string,
): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS ok
       FROM unit_text_audios
       JOIN unit_texts ON unit_texts.id = unit_text_audios.unit_text_id
       WHERE unit_texts.unit_id = ? AND unit_texts.layer_id = ? AND unit_text_audios.file_id = ?`,
    )
    .get(unitId, layerId, fileId);
  return row !== undefined;
}

/** Write the transcript only when the clip it heard is still attached. */
export function commitOralTranscript(
  db: SqliteDatabase,
  input: {
    unitId: string;
    audioLayerId: string;
    fileId: string;
    audioId?: string;
    baseline: string;
    textLayerId: string;
    destUnitId?: string;
    text: string;
    model: string;
    modelVersion: string;
  },
): OralTranscript {
  const destUnitId = input.destUnitId ?? input.unitId;
  return db.transaction(() => {
    if (
      !clipStillAttached(db, input.unitId, input.audioLayerId, input.fileId) ||
      (input.audioId !== undefined &&
        recordingFileId(db, input.unitId, input.audioLayerId, input.audioId) !== input.fileId)
    )
      throw new Error('oral source changed');
    if (
      oralTextBaseline(db, { unitId: destUnitId, textLayerId: input.textLayerId }) !==
      input.baseline
    ) {
      throw new Error('oral text changed');
    }
    return proposeOralDraft(db, { ...input, unitId: destUnitId });
  })();
}

export function readRecording(
  db: SqliteDatabase,
  folder: string,
  input: { unitId: string; layerId: string; audioId?: string },
): { mimeType: string; bytes: Uint8Array } {
  const fileId =
    input.audioId === undefined
      ? recordingFileId(db, input.unitId, input.layerId)
      : clipFileId(db, input.unitId, input.layerId, input.audioId);
  if (fileId === null) throw new Error('recording is missing');
  return readAttachmentFile(db, folder, fileId);
}

function clipFileId(
  db: SqliteDatabase,
  unitId: string,
  layerId: string,
  audioId: string,
): string | null {
  const row = db
    .prepare(
      `SELECT unit_text_audios.file_id AS fileId
       FROM unit_text_audios
       JOIN unit_texts ON unit_texts.id = unit_text_audios.unit_text_id
       WHERE unit_text_audios.id = ? AND unit_texts.unit_id = ? AND unit_texts.layer_id = ?`,
    )
    .get(audioId, unitId, layerId) as { fileId: string } | undefined;
  return row?.fileId ?? null;
}

/** A model may only propose against an unchanged target with no pending user draft. */
export function oralTextBaseline(
  db: SqliteDatabase,
  input: { unitId: string; textLayerId: string },
): string {
  if (readUnitTextDraft(db, input.unitId, input.textLayerId) !== null) {
    throw new Error('oral draft exists');
  }
  const text = db
    .prepare(
      'SELECT id, body, provenance_json, updated_at FROM unit_texts WHERE unit_id = ? AND layer_id = ?',
    )
    .get(input.unitId, input.textLayerId);
  return JSON.stringify([input.textLayerId, text ?? null]);
}

export interface OralTranscript {
  textLayerId: string;
}

interface OralEngine {
  text: string;
  fileId?: string;
  audioId?: string;
  audioLayerId?: string;
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
    textLayerId: string;
    fileId?: string;
    audioId?: string;
  },
): OralTranscript {
  const textLayer = textTarget(db, input.audioLayerId, input.textLayerId);
  oralTextBaseline(db, { unitId: input.unitId, textLayerId: textLayer.id });
  const stored = db
    .prepare(`SELECT body FROM unit_texts WHERE unit_id = ? AND layer_id = ? AND role = ?`)
    .get(input.unitId, textLayer.id, textLayer.contentType) as { body: string } | undefined;
  const base = stored?.body ?? '';
  if (input.text !== base) {
    const engine = {
      text: input.text,
      model: input.model,
      modelVersion: input.modelVersion,
      ...(input.fileId === undefined ? {} : { fileId: input.fileId }),
      ...(input.audioId === undefined ? {} : { audioId: input.audioId }),
      audioLayerId: input.audioLayerId,
    };
    putUnitTextDraft(db, {
      unitId: input.unitId,
      textLayerId: textLayer.id,
      rawInput: input.text,
      baseBody: base,
      provenanceJson: oralProvenanceJson(engine),
    });
    oralEngines.set(oralEngineKey(input.unitId, textLayer.id), engine);
  }
  return { textLayerId: textLayer.id };
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
      ...(engine.fileId === undefined
        ? {}
        : {
            params: {
              audioFileId: engine.fileId,
              ...(engine.audioId === undefined ? {} : { audioId: engine.audioId }),
              ...(engine.audioLayerId === undefined ? {} : { audioLayerId: engine.audioLayerId }),
            },
          }),
      createdAt: new Date().toISOString(),
    }),
  );
}

export function listRecordings(db: SqliteDatabase, layerId: string): RecordingClipRef[] {
  const rows = db
    .prepare(
      `SELECT unit_text_audios.id AS id, unit_texts.unit_id AS unitId,
              unit_text_audios.file_id AS fileId
       FROM unit_text_audios
       JOIN unit_texts ON unit_texts.id = unit_text_audios.unit_text_id
       WHERE unit_texts.layer_id = ?
       ORDER BY unit_texts.unit_id, unit_text_audios.position, unit_text_audios.id`,
    )
    .all(layerId) as { id: string; unitId: string; fileId: string }[];
  return rows;
}

function textTarget(
  db: SqliteDatabase,
  audioLayerId: string,
  textLayerId: string,
): { id: string; contentType: string } {
  const listed = listTranscriptionTargets(db, audioLayerId);
  const target = listed.targets.find((item) => item.id === textLayerId);
  if (target === undefined) throw new Error('transcription target is not allowed');
  return { id: target.id, contentType: listed.contentType };
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
