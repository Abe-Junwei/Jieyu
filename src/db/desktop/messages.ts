import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

type SqliteDatabase = InstanceType<typeof Database>;

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageAppend {
  id?: string;
  conversationId: string;
  role: MessageRole;
  body: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: MessageRole;
  body: string;
  created_at: string;
  updated_at: string;
}

const COLUMNS = `id, conversation_id, role, body, created_at, updated_at`;

export function appendMessage(db: SqliteDatabase, input: MessageAppend): Message {
  const id = input.id ?? randomUUID();
  const write = db.transaction(() => {
    if (
      db.prepare('SELECT 1 FROM conversations WHERE id = ?').get(input.conversationId) === undefined
    ) {
      throw new Error('conversation is missing');
    }
    if (db.prepare('SELECT 1 FROM messages WHERE id = ?').get(id) !== undefined) {
      throw new Error('message id is duplicated');
    }
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, input.conversationId, input.role, input.body, now, now);
    const message = getMessage(db, id);
    if (
      !message ||
      message.conversationId !== input.conversationId ||
      message.role !== input.role ||
      message.body !== input.body
    ) {
      throw new Error('message readback failed');
    }
    return message;
  });
  return write();
}

export function listMessages(db: SqliteDatabase, conversationId: string): Message[] {
  if (db.prepare('SELECT 1 FROM conversations WHERE id = ?').get(conversationId) === undefined) {
    throw new Error('conversation is missing');
  }
  const rows = db
    .prepare(
      `SELECT ${COLUMNS} FROM messages
       WHERE conversation_id = ? ORDER BY created_at, rowid`,
    )
    .all(conversationId) as MessageRow[];
  return rows.map(mapMessage);
}

function getMessage(db: SqliteDatabase, id: string): Message | null {
  const row = db.prepare(`SELECT ${COLUMNS} FROM messages WHERE id = ?`).get(id) as
    MessageRow | undefined;
  if (!row) return null;
  return mapMessage(row);
}

function mapMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
