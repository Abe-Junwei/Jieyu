import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { writeRequiredFieldValues } from './customFields';
import type { DiagnosticReceipt } from './diagnosticDelivery';
import {
  finishFieldDelivery,
  recordPendingDelivery,
  replayDelivery,
  resumeDelivery,
} from './fieldDelivery';

type SqliteDatabase = InstanceType<typeof Database>;

export interface SourceFieldRevisions {
  label: number;
  externalId: number;
}

export interface SourceReading {
  id: string;
  mediaId: string | null;
  label: string;
  externalId: string;
  revisions: SourceFieldRevisions;
  delivery: 'unchanged' | 'pending' | 'confirmed';
}

interface FieldPatch {
  expectedRevision: number;
  value: string;
}

export interface SourcePatch {
  operationId: string;
  id: string;
  label?: FieldPatch;
  externalId?: FieldPatch;
}

export interface SourceCreate {
  label: string;
  externalId: string;
  mediaId?: string | null;
  fieldValues?: Record<string, unknown>;
}

export type SourceRecord = Omit<SourceReading, 'delivery'>;

/** A new source row. Same label or external id does not merge, and no file or bibliography is copied. */
export function createSource(db: SqliteDatabase, input: SourceCreate): SourceRecord {
  const id = randomUUID();
  const now = new Date().toISOString();
  const mediaId = input.mediaId === undefined ? null : input.mediaId;
  const write = db.transaction(() => {
    if (mediaId !== null) assertCurrentMedia(db, mediaId);
    db.prepare(
      `INSERT INTO sources (
        id, media_id, label, external_id, field_revisions_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, mediaId, input.label, input.externalId, '{"label":0,"externalId":0}', now, now);
    writeRequiredFieldValues(db, 'source', id, input.fieldValues);
    const stored = readSource(db, id);
    if (
      stored === null ||
      stored.label !== input.label ||
      stored.externalId !== input.externalId ||
      stored.mediaId !== mediaId ||
      stored.revisions.label !== 0 ||
      stored.revisions.externalId !== 0
    ) {
      throw new Error('source readback failed');
    }
    for (const [definitionId, value] of Object.entries(input.fieldValues ?? {})) {
      const kept = db
        .prepare(
          `SELECT value_json FROM custom_field_values
           WHERE definition_id = ? AND target_type = 'source' AND target_id = ?`,
        )
        .get(definitionId, id) as { value_json: string } | undefined;
      if (kept === undefined || kept.value_json !== JSON.stringify(value)) {
        throw new Error('source readback failed');
      }
    }
    return stored;
  });
  return write();
}

function assertCurrentMedia(db: SqliteDatabase, mediaId: string): void {
  if (mediaId.length === 0) throw new Error('media is missing');
  const row = db.prepare('SELECT deleted_at FROM media WHERE id = ?').get(mediaId) as
    { deleted_at: string | null } | undefined;
  if (row === undefined) throw new Error('media is missing');
  if (row.deleted_at !== null) throw new Error('media is deleted');
}

export function patchSource(db: SqliteDatabase, input: SourcePatch): SourceReading {
  const applied = db.transaction(() => applyPatch(db, input))();
  if (applied.receipt === null) return applied.reading;
  return finishFieldDelivery(db, applied.reading, applied.receipt, applied.reading.delivery);
}

export function redeliverSource(db: SqliteDatabase, operationId: string): SourceReading {
  return resumeDelivery(db, operationId, (summary) => sourceReading(db, summary));
}

function applyPatch(
  db: SqliteDatabase,
  input: SourcePatch,
): {
  reading: SourceReading;
  receipt: DiagnosticReceipt | null;
} {
  const fingerprint = inputFingerprint(input);
  const replay = replayDelivery(db, input.operationId, fingerprint, (summary) =>
    sourceReading(db, summary),
  );
  if (replay !== null) {
    return {
      reading: { ...replay.reading, delivery: replay.status },
      receipt: replay.receipt,
    };
  }
  const current = readSource(db, input.id);
  if (current === null) throw new Error('source is missing');
  const label = takeField(input.label, current.revisions.label, current.label, 'label');
  const externalId = takeField(
    input.externalId,
    current.revisions.externalId,
    current.externalId,
    'externalId',
  );
  const revisions = {
    label: label.revision,
    externalId: externalId.revision,
  };
  const changed = [label.changed ? 'label' : null, externalId.changed ? 'externalId' : null].filter(
    (name): name is string => name !== null,
  );
  if (changed.length === 0)
    return { reading: { ...current, delivery: 'unchanged' }, receipt: null };
  const updatedAt = new Date().toISOString();
  db.prepare(
    `UPDATE sources
     SET label = ?, external_id = ?, field_revisions_json = ?, updated_at = ?
     WHERE id = ?`,
  ).run(label.value, externalId.value, JSON.stringify(revisions), updatedAt, current.id);
  const summary = { sourceId: current.id, fields: changed, revisions };
  const receipt = recordPendingDelivery(db, {
    operationId: input.operationId,
    fingerprint,
    summary,
  });
  const stored = readSource(db, current.id);
  if (stored === null) throw new Error('source readback failed');
  return { reading: { ...stored, delivery: 'pending' }, receipt };
}

function sourceReading(db: SqliteDatabase, summary: unknown): Omit<SourceReading, 'delivery'> {
  const record = summary as { sourceId?: unknown };
  if (typeof record.sourceId !== 'string') throw new Error('diagnostic delivery is invalid');
  const reading = readSource(db, record.sourceId);
  if (reading === null) throw new Error('source is missing');
  return reading;
}

function takeField(
  patch: FieldPatch | undefined,
  revision: number,
  value: string,
  name: string,
): { value: string; revision: number; changed: boolean } {
  if (patch === undefined) return { value, revision, changed: false };
  if (patch.expectedRevision !== revision) throw new Error(`source field conflict: ${name}`);
  if (patch.value === value) return { value, revision, changed: false };
  return { value: patch.value, revision: revision + 1, changed: true };
}

function readSource(db: SqliteDatabase, id: string): Omit<SourceReading, 'delivery'> | null {
  const row = db
    .prepare(
      `SELECT id, media_id, label, external_id, field_revisions_json
       FROM sources WHERE id = ?`,
    )
    .get(id) as
    | {
        id: string;
        media_id: string | null;
        label: string;
        external_id: string;
        field_revisions_json: string;
      }
    | undefined;
  if (row === undefined) return null;
  return {
    id: row.id,
    mediaId: row.media_id,
    label: row.label,
    externalId: row.external_id,
    revisions: revisionsOf(row.field_revisions_json),
  };
}

function revisionsOf(json: string): SourceFieldRevisions {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== 'object' || parsed === null)
    throw new Error('source revisions are invalid');
  const record = parsed as { label?: unknown; externalId?: unknown };
  if (typeof record.label !== 'number' || typeof record.externalId !== 'number') {
    throw new Error('source revisions are invalid');
  }
  return { label: record.label, externalId: record.externalId };
}

function inputFingerprint(input: SourcePatch): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        id: input.id,
        label: input.label ?? null,
        externalId: input.externalId ?? null,
      }),
    )
    .digest('hex');
}
