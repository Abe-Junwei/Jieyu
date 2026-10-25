import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { readStringMap } from './stringMap';

type SqliteDatabase = InstanceType<typeof Database>;

export interface Manuscript {
  id: string;
  title: Record<string, string>;
  mediaId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ManuscriptCreate {
  title: Record<string, string>;
  mediaId: string;
}

interface ManuscriptRow {
  id: string;
  title_json: string;
  media_id: string;
  created_at: string;
  updated_at: string;
}

export function createManuscript(db: SqliteDatabase, input: ManuscriptCreate): Manuscript {
  const id = randomUUID();
  const now = new Date().toISOString();
  const write = db.transaction(() => {
    db.prepare(
      `INSERT INTO manuscripts (id, title_json, media_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(id, JSON.stringify(input.title), input.mediaId, now, now);
    const manuscript = getManuscript(db, id);
    if (!manuscript) throw new Error('manuscript readback failed');
    return manuscript;
  });
  return write();
}

export function getManuscript(db: SqliteDatabase, id: string): Manuscript | null {
  const row = db
    .prepare(
      'SELECT id, title_json, media_id, created_at, updated_at FROM manuscripts WHERE id = ?',
    )
    .get(id) as ManuscriptRow | undefined;
  if (!row) return null;
  return mapManuscript(row);
}

export function listManuscripts(db: SqliteDatabase): Manuscript[] {
  const rows = db
    .prepare(
      `SELECT id, title_json, media_id, created_at, updated_at
       FROM manuscripts ORDER BY created_at, id`,
    )
    .all() as ManuscriptRow[];
  return rows.map(mapManuscript);
}

function mapManuscript(row: ManuscriptRow): Manuscript {
  return {
    id: row.id,
    title: readStringMap(row.title_json),
    mediaId: row.media_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
