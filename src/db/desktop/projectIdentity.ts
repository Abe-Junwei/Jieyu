import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import type Database from 'better-sqlite3';

type SqliteDatabase = InstanceType<typeof Database>;

export interface ProjectIdentity {
  id: string;
  title: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

/** One identity row. A later open keeps the row that is already there. */
export function ensureProjectIdentity(db: SqliteDatabase, folder: string): ProjectIdentity {
  const existing = getProjectIdentity(db);
  if (existing !== null) return existing;
  const name = basename(folder).trim();
  const title = { und: name.length > 0 ? name : 'project' };
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    'INSERT INTO project (id, title_json, created_at, updated_at) VALUES (?, ?, ?, ?)',
  ).run(id, JSON.stringify(title), now, now);
  const stored = getProjectIdentity(db);
  if (stored === null || stored.id !== id || stored.title.und !== title.und) {
    throw new Error('project readback failed');
  }
  return stored;
}

export function getProjectIdentity(db: SqliteDatabase): ProjectIdentity | null {
  const rows = db
    .prepare('SELECT id, title_json, created_at, updated_at FROM project')
    .all() as IdentityRow[];
  if (rows.length === 0) return null;
  const row = rows[0];
  if (rows.length !== 1 || row === undefined) throw new Error('project is missing');
  return {
    id: row.id,
    title: titleOf(row.title_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface IdentityRow {
  id: string;
  title_json: string;
  created_at: string;
  updated_at: string;
}

function titleOf(json: string): Record<string, string> {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('project title is invalid');
  }
  const title: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (key.length === 0 || typeof value !== 'string' || value.length === 0) {
      throw new Error('project title is invalid');
    }
    title[key] = value;
  }
  if (Object.keys(title).length === 0) throw new Error('project title is invalid');
  return title;
}
