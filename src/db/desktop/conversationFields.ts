import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  getConversation,
  type Conversation,
  type ConversationFieldRevisions,
  type ConversationMode,
} from './conversations';
import type { DiagnosticReceipt } from './diagnosticDelivery';
import {
  finishFieldDelivery,
  recordPendingDelivery,
  replayDelivery,
  resumeDelivery,
} from './fieldDelivery';

type SqliteDatabase = InstanceType<typeof Database>;

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

export function patchConversation(
  db: SqliteDatabase,
  input: ConversationPatch,
): ConversationReading {
  const applied = db.transaction(() => applyPatch(db, input))();
  if (applied.receipt === null) return applied.reading;
  return finishFieldDelivery(db, applied.reading, applied.receipt, applied.reading.delivery);
}

export function redeliverConversation(
  db: SqliteDatabase,
  operationId: string,
): ConversationReading {
  return resumeDelivery(db, operationId, (summary) => conversationReading(db, summary));
}

function applyPatch(
  db: SqliteDatabase,
  input: ConversationPatch,
): { reading: ConversationReading; receipt: DiagnosticReceipt | null } {
  const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const replay = replayDelivery(db, input.operationId, fingerprint, (summary) =>
    conversationReading(db, summary),
  );
  if (replay !== null) {
    return {
      reading: { ...replay.reading, delivery: replay.status },
      receipt: replay.receipt,
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
  const receipt = recordPendingDelivery(db, {
    operationId: input.operationId,
    fingerprint,
    summary,
  });
  const stored = getConversation(db, current.id);
  if (stored === null) throw new Error('conversation readback failed');
  return { reading: { ...stored, delivery: 'pending' }, receipt };
}

function conversationReading(db: SqliteDatabase, summary: unknown): Conversation {
  const record = summary as { conversationId?: unknown };
  if (typeof record.conversationId !== 'string') throw new Error('diagnostic delivery is invalid');
  const conversation = getConversation(db, record.conversationId);
  if (conversation === null) throw new Error('conversation is missing');
  return conversation;
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
