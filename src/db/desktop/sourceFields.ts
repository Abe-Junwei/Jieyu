import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  diagnosticStoreFile,
  payloadHash,
  receiveDiagnostic,
  type DiagnosticReceipt,
} from './diagnosticDelivery';

type SqliteDatabase = InstanceType<typeof Database>;

export interface SourceFieldRevisions {
  label: number;
  externalId: number;
}

export interface SourceReading {
  id: string;
  mediaId: string;
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

interface DeliveryRow {
  origin_project_id: string;
  operation_id: string;
  event_seq: number;
  payload_hash: string;
  input_fingerprint: string;
  summary_json: string;
  status: 'pending' | 'confirmed';
}

export function patchSource(db: SqliteDatabase, input: SourcePatch): SourceReading {
  const applied = db.transaction(() => applyPatch(db, input))();
  if (applied.receipt === null) return applied.reading;
  return finishDelivery(
    db,
    applied.reading,
    applied.receipt,
    applied.reading.delivery === 'confirmed' ? 'confirmed' : 'pending',
  );
}

export function redeliverSource(db: SqliteDatabase, operationId: string): SourceReading {
  const row = requireDelivery(db, operationId);
  const summary = JSON.parse(row.summary_json) as { sourceId?: unknown };
  if (typeof summary.sourceId !== 'string') throw new Error('diagnostic delivery is invalid');
  const reading = readSource(db, summary.sourceId);
  if (reading === null) throw new Error('source is missing');
  return finishDelivery(
    db,
    reading,
    {
      originProjectId: row.origin_project_id,
      operationId: row.operation_id,
      eventSeq: row.event_seq,
      payloadHash: row.payload_hash,
    },
    row.status,
  );
}

function finishDelivery(
  db: SqliteDatabase,
  reading: Omit<SourceReading, 'delivery'>,
  receipt: DiagnosticReceipt,
  current: 'pending' | 'confirmed' = 'pending',
): SourceReading {
  const file = diagnosticStoreFile();
  if (file === null)
    return { ...reading, delivery: current === 'confirmed' ? 'confirmed' : 'pending' };
  try {
    receiveDiagnostic(file, receipt);
  } catch (error) {
    if (error instanceof Error && error.message === 'diagnostic payload conflict') throw error;
    return { ...reading, delivery: 'pending' };
  }
  db.prepare(
    `UPDATE diagnostic_deliveries SET status = 'confirmed'
     WHERE origin_project_id = ? AND operation_id = ? AND event_seq = ?`,
  ).run(receipt.originProjectId, receipt.operationId, receipt.eventSeq);
  return { ...reading, delivery: 'confirmed' };
}

function applyPatch(
  db: SqliteDatabase,
  input: SourcePatch,
): {
  reading: SourceReading;
  receipt: DiagnosticReceipt | null;
} {
  const fingerprint = inputFingerprint(input);
  const existing = findDelivery(db, input.operationId);
  if (existing !== null) {
    if (existing.input_fingerprint !== fingerprint) throw new Error('diagnostic delivery conflict');
    const summary = JSON.parse(existing.summary_json) as { sourceId?: unknown };
    if (typeof summary.sourceId !== 'string') throw new Error('diagnostic delivery is invalid');
    const reading = readSource(db, summary.sourceId);
    if (reading === null) throw new Error('source is missing');
    return {
      reading: { ...reading, delivery: existing.status },
      receipt: {
        originProjectId: existing.origin_project_id,
        operationId: existing.operation_id,
        eventSeq: existing.event_seq,
        payloadHash: existing.payload_hash,
      },
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
  const hash = payloadHash(summary);
  const origin = originProjectId(db);
  db.prepare(
    `INSERT INTO diagnostic_deliveries (
       origin_project_id, operation_id, event_seq, payload_hash, input_fingerprint, summary_json, status
     ) VALUES (?, ?, 0, ?, ?, ?, 'pending')`,
  ).run(origin, input.operationId, hash, fingerprint, JSON.stringify(summary));
  const stored = readSource(db, current.id);
  if (stored === null) throw new Error('source readback failed');
  return {
    reading: { ...stored, delivery: 'pending' },
    receipt: {
      originProjectId: origin,
      operationId: input.operationId,
      eventSeq: 0,
      payloadHash: hash,
    },
  };
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
        media_id: string;
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

function originProjectId(db: SqliteDatabase): string {
  const rows = db.prepare('SELECT id FROM project').all() as { id: string }[];
  const only = rows[0];
  if (rows.length !== 1 || only === undefined) throw new Error('project is missing');
  return only.id;
}

function requireDelivery(db: SqliteDatabase, operationId: string): DeliveryRow {
  const row = findDelivery(db, operationId);
  if (row === null) throw new Error('diagnostic delivery is missing');
  return row;
}

function findDelivery(db: SqliteDatabase, operationId: string): DeliveryRow | null {
  const rows = db
    .prepare('SELECT * FROM diagnostic_deliveries WHERE operation_id = ?')
    .all(operationId) as DeliveryRow[];
  const row = rows[0];
  if (row === undefined) return null;
  if (rows.length !== 1) throw new Error('diagnostic delivery is invalid');
  return row;
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
