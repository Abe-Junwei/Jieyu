import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  getConversation,
  type Conversation,
  type ConversationFieldRevisions,
  type ConversationMode,
} from './conversations';
import {
  diagnosticStoreFile,
  payloadHash,
  receiveDiagnostic,
  type DiagnosticReceipt,
} from './diagnosticDelivery';

type SqliteDatabase = InstanceType<typeof Database>;

// ponytail: third copy of the source/speaker delivery helpers. Extract when a fourth domain needs it.
export interface ConversationReading extends Conversation {
  delivery: 'unchanged' | 'pending' | 'confirmed';
}

interface FieldPatch<T> {
  expectedRevision: number;
  value: T;
}

export interface ConversationPatch {
  operationId: string;
  id: string;
  title?: FieldPatch<string>;
  mode?: FieldPatch<ConversationMode | null>;
  providerId?: FieldPatch<string | null>;
  model?: FieldPatch<string | null>;
  archived?: FieldPatch<boolean | null>;
  clearedAt?: FieldPatch<string | null>;
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

export function patchConversation(
  db: SqliteDatabase,
  input: ConversationPatch,
): ConversationReading {
  const applied = db.transaction(() => applyPatch(db, input))();
  if (applied.receipt === null) return applied.reading;
  return finishDelivery(db, applied.reading, applied.receipt, applied.reading.delivery);
}

export function redeliverConversation(
  db: SqliteDatabase,
  operationId: string,
): ConversationReading {
  const row = requireDelivery(db, operationId);
  const summary = JSON.parse(row.summary_json) as { conversationId?: unknown };
  if (typeof summary.conversationId !== 'string') throw new Error('diagnostic delivery is invalid');
  const conversation = getConversation(db, summary.conversationId);
  if (conversation === null) throw new Error('conversation is missing');
  return finishDelivery(
    db,
    { ...conversation, delivery: row.status },
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
  reading: ConversationReading,
  receipt: DiagnosticReceipt,
  current: ConversationReading['delivery'] = 'pending',
): ConversationReading {
  const file = diagnosticStoreFile();
  if (file === null) {
    return { ...reading, delivery: current === 'confirmed' ? 'confirmed' : 'pending' };
  }
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
  input: ConversationPatch,
): { reading: ConversationReading; receipt: DiagnosticReceipt | null } {
  const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const existing = findDelivery(db, input.operationId);
  if (existing !== null) {
    if (existing.input_fingerprint !== fingerprint) throw new Error('diagnostic delivery conflict');
    const summary = JSON.parse(existing.summary_json) as { conversationId?: unknown };
    if (typeof summary.conversationId !== 'string')
      throw new Error('diagnostic delivery is invalid');
    const conversation = getConversation(db, summary.conversationId);
    if (conversation === null) throw new Error('conversation is missing');
    return {
      reading: { ...conversation, delivery: existing.status },
      receipt: {
        originProjectId: existing.origin_project_id,
        operationId: existing.operation_id,
        eventSeq: existing.event_seq,
        payloadHash: existing.payload_hash,
      },
    };
  }
  const current = getConversation(db, input.id);
  if (current === null) throw new Error('conversation is missing');
  const title = take(input.title, current.revisions.title, current.title, 'title');
  const mode = take(input.mode, current.revisions.mode, current.mode, 'mode');
  const providerId = take(
    input.providerId,
    current.revisions.providerId,
    current.providerId,
    'providerId',
  );
  const model = take(input.model, current.revisions.model, current.model, 'model');
  const archived = take(input.archived, current.revisions.archived, current.archived, 'archived');
  const clearedAt = take(
    input.clearedAt,
    current.revisions.clearedAt,
    current.clearedAt,
    'clearedAt',
  );
  const revisions: ConversationFieldRevisions = {
    title: title.revision,
    mode: mode.revision,
    providerId: providerId.revision,
    model: model.revision,
    archived: archived.revision,
    clearedAt: clearedAt.revision,
  };
  const changed = (
    [
      ['title', title.changed],
      ['mode', mode.changed],
      ['providerId', providerId.changed],
      ['model', model.changed],
      ['archived', archived.changed],
      ['clearedAt', clearedAt.changed],
    ] as const
  )
    .filter((entry) => entry[1])
    .map((entry) => entry[0]);
  if (changed.length === 0)
    return { reading: { ...current, delivery: 'unchanged' }, receipt: null };
  db.prepare(
    `UPDATE conversations
     SET title = ?, mode = ?, provider_id = ?, model = ?, archived = ?, cleared_at = ?,
         field_revisions_json = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    title.value,
    mode.value,
    providerId.value,
    model.value,
    archived.value === null ? null : archived.value ? 1 : 0,
    clearedAt.value,
    JSON.stringify(revisions),
    new Date().toISOString(),
    current.id,
  );
  const summary = { conversationId: current.id, fields: changed, revisions };
  const hash = payloadHash(summary);
  const origin = originProjectId(db);
  db.prepare(
    `INSERT INTO diagnostic_deliveries (
       origin_project_id, operation_id, event_seq, payload_hash, input_fingerprint, summary_json, status
     ) VALUES (?, ?, 0, ?, ?, ?, 'pending')`,
  ).run(origin, input.operationId, hash, fingerprint, JSON.stringify(summary));
  const stored = getConversation(db, current.id);
  if (stored === null) throw new Error('conversation readback failed');
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

function take<T>(
  patch: FieldPatch<T> | undefined,
  revision: number,
  value: T,
  name: string,
): { value: T; revision: number; changed: boolean } {
  if (patch === undefined) return { value, revision, changed: false };
  if (patch.expectedRevision !== revision) throw new Error(`conversation field conflict: ${name}`);
  if (patch.value === value) return { value, revision, changed: false };
  return { value: patch.value, revision: revision + 1, changed: true };
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
