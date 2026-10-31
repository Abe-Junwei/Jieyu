import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { writeRequiredFieldValues } from './customFields';

type SqliteDatabase = InstanceType<typeof Database>;

export type ConversationMode = 'assistant' | 'analysis' | 'review';

export interface ConversationFieldRevisions {
  title: number;
  mode: number;
  providerId: number;
  model: number;
  archived: number;
  clearedAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  mode: ConversationMode | null;
  providerId: string | null;
  model: string | null;
  archived: boolean | null;
  clearedAt: string | null;
  revisions: ConversationFieldRevisions;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationCreate {
  title: string;
  fieldValues?: Record<string, unknown>;
}

interface ConversationRow {
  id: string;
  title: string;
  mode: string | null;
  provider_id: string | null;
  model: string | null;
  archived: number | null;
  cleared_at: string | null;
  field_revisions_json: string;
  created_at: string;
  updated_at: string;
}

const COLUMNS = `id, title, mode, provider_id, model, archived, cleared_at, field_revisions_json,
  created_at, updated_at`;

export function createConversation(db: SqliteDatabase, input: ConversationCreate): Conversation {
  const id = randomUUID();
  const now = new Date().toISOString();
  const write = db.transaction(() => {
    db.prepare(
      'INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
    ).run(id, input.title, now, now);
    writeRequiredFieldValues(db, 'conversation', id, input.fieldValues);
    const conversation = getConversation(db, id);
    if (!conversation) throw new Error('conversation readback failed');
    return conversation;
  });
  return write();
}

export function getConversation(db: SqliteDatabase, id: string): Conversation | null {
  const row = db.prepare(`SELECT ${COLUMNS} FROM conversations WHERE id = ?`).get(id) as
    ConversationRow | undefined;
  if (!row) return null;
  return mapConversation(row);
}

export function listConversations(db: SqliteDatabase): Conversation[] {
  const rows = db
    .prepare(`SELECT ${COLUMNS} FROM conversations ORDER BY created_at, id`)
    .all() as ConversationRow[];
  return rows.map(mapConversation);
}

function mapConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    mode: modeOf(row.mode),
    providerId: row.provider_id,
    model: row.model,
    archived: archivedOf(row.archived),
    clearedAt: row.cleared_at,
    revisions: revisionsOf(row.field_revisions_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const MODES = ['assistant', 'analysis', 'review'] as const;

function modeOf(value: string | null): ConversationMode | null {
  if (value === null) return null;
  if ((MODES as readonly string[]).includes(value)) return value as ConversationMode;
  throw new Error('conversation mode is invalid');
}

function archivedOf(value: number | null): boolean | null {
  if (value === null) return null;
  if (value === 0) return false;
  if (value === 1) return true;
  throw new Error('conversation archived is invalid');
}

export function revisionsOf(json: string): ConversationFieldRevisions {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('conversation revisions are invalid');
  }
  const record = parsed as Record<string, unknown>;
  const revisions = {} as ConversationFieldRevisions;
  for (const key of ['title', 'mode', 'providerId', 'model', 'archived', 'clearedAt'] as const) {
    const value = record[key];
    if (typeof value !== 'number') throw new Error('conversation revisions are invalid');
    revisions[key] = value;
  }
  return revisions;
}
