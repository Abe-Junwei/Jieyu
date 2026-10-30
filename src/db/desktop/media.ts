import { randomUUID } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { writeRequiredFieldValues } from './customFields';

type SqliteDatabase = InstanceType<typeof Database>;

export interface Media {
  id: string;
  relpath: string;
  sha256: string;
  filename: string;
  duration: number;
  createdAt: string;
}

export interface MediaCreate {
  relpath: string;
  sha256: string;
  duration: number;
  fieldValues?: Record<string, unknown>;
}

interface MediaRow {
  id: string;
  relpath: string;
  sha256: string;
  filename: string;
  duration: number;
  created_at: string;
}

/** Lexical check, then realpath, per CWE-22. A missing parent is "missing", not a traversal. */
export function mediaRelpath(folder: string, relpath: string): string {
  if (relpath.length === 0 || relpath.includes('\0') || path.isAbsolute(relpath)) {
    throw new Error('media path escapes the project folder');
  }
  const root = path.resolve(folder);
  const candidate = path.resolve(root, relpath);
  if (!isInside(root, candidate)) throw new Error('media path escapes the project folder');
  const realRoot = realpathSync(root);
  const realCandidate = canonicalExisting(candidate);
  if (!isInside(realRoot, realCandidate)) throw new Error('media path escapes the project folder');
  let stat;
  try {
    stat = statSync(realCandidate);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') throw new Error('media file is missing');
    throw error;
  }
  if (!stat.isFile()) throw new Error('media file is missing');
  return path.relative(realRoot, realCandidate).split(path.sep).join('/');
}

export function createMedia(db: SqliteDatabase, folder: string, input: MediaCreate): Media {
  const relpath = mediaRelpath(folder, input.relpath);
  const id = randomUUID();
  const now = new Date().toISOString();
  const write = db.transaction(() => {
    db.prepare(
      `INSERT INTO media (id, relpath, sha256, filename, duration, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, relpath, input.sha256, path.posix.basename(relpath), input.duration, now);
    writeRequiredFieldValues(db, 'media', id, input.fieldValues);
    const media = getMedia(db, id);
    if (!media) throw new Error('media readback failed');
    return media;
  });
  return write();
}

export interface DeletedMedia {
  id: string;
  relpath: string;
  deletedAt: string;
  retainUntil: string;
  reminderShownAt: string | null;
}

export function listDeletedMedia(db: SqliteDatabase): DeletedMedia[] {
  const rows = db
    .prepare(
      `SELECT id, relpath, deleted_at AS deletedAt, retain_until AS retainUntil,
              reminder_shown_at AS reminderShownAt
       FROM media
       WHERE deleted_at IS NOT NULL AND retain_until IS NOT NULL
       ORDER BY deleted_at, id`,
    )
    .all() as DeletedMedia[];
  return rows;
}

export function listActiveMedia(db: SqliteDatabase): Media[] {
  const rows = db
    .prepare(
      `SELECT id, relpath, sha256, filename, duration, created_at
       FROM media WHERE deleted_at IS NULL ORDER BY created_at, id`,
    )
    .all() as MediaRow[];
  return rows.map((row) => ({
    id: row.id,
    relpath: row.relpath,
    sha256: row.sha256,
    filename: row.filename,
    duration: row.duration,
    createdAt: row.created_at,
  }));
}

export function getMedia(db: SqliteDatabase, id: string): Media | null {
  const row = db
    .prepare('SELECT id, relpath, sha256, filename, duration, created_at FROM media WHERE id = ?')
    .get(id) as MediaRow | undefined;
  if (!row) return null;
  return {
    id: row.id,
    relpath: row.relpath,
    sha256: row.sha256,
    filename: row.filename,
    duration: row.duration,
    createdAt: row.created_at,
  };
}

function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return (
    rel.length > 0 && !path.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${path.sep}`)
  );
}

function canonicalExisting(candidate: string): string {
  try {
    return realpathSync(candidate);
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error;
  }
  try {
    return path.join(realpathSync(path.dirname(candidate)), path.basename(candidate));
  } catch (error) {
    if (errorCode(error) === 'ENOENT') throw new Error('media file is missing');
    throw error;
  }
}

function errorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) return '';
  const code = error.code;
  return typeof code === 'string' ? code : '';
}
