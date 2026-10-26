import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { writeRequiredFieldValues } from './customFields';

type SqliteDatabase = InstanceType<typeof Database>;

export interface Speaker {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface SpeakerCreate {
  name: string;
  fieldValues?: Record<string, unknown>;
}

interface SpeakerRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export function createSpeaker(db: SqliteDatabase, input: SpeakerCreate): Speaker {
  const id = randomUUID();
  const now = new Date().toISOString();
  const write = db.transaction(() => {
    db.prepare('INSERT INTO speakers (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
      id,
      input.name,
      now,
      now,
    );
    writeRequiredFieldValues(db, 'speaker', id, input.fieldValues);
    const speaker = getSpeaker(db, id);
    if (!speaker) throw new Error('speaker readback failed');
    return speaker;
  });
  return write();
}

export function getSpeaker(db: SqliteDatabase, id: string): Speaker | null {
  const row = db
    .prepare('SELECT id, name, created_at, updated_at FROM speakers WHERE id = ?')
    .get(id) as SpeakerRow | undefined;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
