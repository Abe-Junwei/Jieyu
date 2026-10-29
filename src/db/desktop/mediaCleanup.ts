import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { mediaRelpath } from './media';

type SqliteDatabase = InstanceType<typeof Database>;

export type MediaCleanupState = 'intent' | 'confirmed' | 'failed' | 'unknown';
export type MediaTrash = (absolutePath: string) => Promise<'moved' | 'unknown'>;

export interface MediaCleanup {
  id: string;
  state: MediaCleanupState;
}

interface MediaCycle {
  id: string;
  relpath: string;
  sha256: string;
  deletedAt: string | null;
  retainUntil: string | null;
  reminderShownAt: string | null;
}

interface CleanupRow {
  id: string;
  media_id: string;
  relpath: string;
  sha256: string;
  state: string;
}

export async function finishMediaCleanup(
  db: SqliteDatabase,
  folder: string,
  mediaId: string,
  operationId: string,
  trash: MediaTrash,
): Promise<MediaCleanup> {
  if (operationId.length === 0) throw new Error('empty media cleanup');
  const existing = readCleanup(db, operationId);
  if (existing?.state === 'confirmed') {
    if (existing.media_id !== mediaId) throw new Error('media cleanup conflict');
    return { id: operationId, state: 'confirmed' };
  }
  const media = readMedia(db, mediaId);
  if (media === undefined) throw new Error('media is missing');
  if (existing !== undefined) {
    if (
      existing.media_id !== media.id ||
      existing.relpath !== media.relpath ||
      existing.sha256 !== media.sha256
    ) {
      throw new Error('media cleanup conflict');
    }
  } else if (openCleanup(db, mediaId) !== undefined) {
    throw new Error('media cleanup is already open');
  }
  assertReady(db, media);
  if (existing === undefined) insertIntent(db, operationId, media);
  else if (existing.state !== 'intent') mark(db, operationId, 'intent');

  let absolute: string;
  try {
    absolute = path.resolve(path.resolve(folder), mediaRelpath(folder, media.relpath));
  } catch (error) {
    if (error instanceof Error && KNOWN_PATH_ERRORS.has(error.message)) {
      mark(db, operationId, 'unknown');
      return { id: operationId, state: 'unknown' };
    }
    throw error;
  }
  if (sha256(readFileSync(absolute)) !== media.sha256) {
    mark(db, operationId, 'unknown');
    return { id: operationId, state: 'unknown' };
  }

  let outcome: 'moved' | 'failed' | 'unknown' = 'unknown';
  try {
    const reported = await trash(absolute);
    if (reported === 'moved') outcome = 'moved';
    else if (reported === 'unknown') outcome = 'unknown';
    else {
      const unreachable: never = reported;
      throw new Error(`media trash result is invalid: ${String(unreachable)}`);
    }
  } catch {
    outcome = 'failed';
  }
  if (outcome === 'failed') {
    mark(db, operationId, 'failed');
    return { id: operationId, state: 'failed' };
  }
  if (outcome !== 'moved' || fileStillThere(absolute)) {
    mark(db, operationId, 'unknown');
    return { id: operationId, state: 'unknown' };
  }

  try {
    const cleared = clearRegistration(db, mediaId, operationId);
    if (!cleared) {
      mark(db, operationId, 'unknown');
      return { id: operationId, state: 'unknown' };
    }
  } catch {
    mark(db, operationId, 'unknown');
    return { id: operationId, state: 'unknown' };
  }
  return { id: operationId, state: 'confirmed' };
}

const KNOWN_PATH_ERRORS = new Set([
  'media file is missing',
  'media path escapes the project folder',
]);

function assertReady(db: SqliteDatabase, media: MediaCycle): void {
  if (media.deletedAt === null || media.retainUntil === null) throw new Error('media is active');
  if (media.reminderShownAt === null) throw new Error('reminder has not been shown');
  const now = new Date().toISOString();
  if (now < earliestPurgeAt(media.retainUntil, media.reminderShownAt)) {
    throw new Error('media is inside its retention window');
  }
  const refs = db
    .prepare('SELECT COUNT(*) AS n FROM manuscripts WHERE media_id = ?')
    .get(media.id) as { n: number };
  if (refs.n > 0) throw new Error('media is still referenced');
}

function earliestPurgeAt(retainUntil: string, reminderShownAt: string): string {
  const afterReminder = plusUtcDays(reminderShownAt, 7);
  return retainUntil > afterReminder ? retainUntil : afterReminder;
}

function plusUtcDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function clearRegistration(db: SqliteDatabase, mediaId: string, operationId: string): boolean {
  const write = db.transaction(() => {
    const current = readMedia(db, mediaId);
    const operation = readCleanup(db, operationId);
    const refs = db
      .prepare('SELECT COUNT(*) AS n FROM manuscripts WHERE media_id = ?')
      .get(mediaId) as { n: number };
    if (current === undefined || operation?.state !== 'intent' || refs.n > 0) return false;
    db.prepare('UPDATE sources SET media_id = NULL WHERE media_id = ?').run(mediaId);
    db.prepare('DELETE FROM media WHERE id = ?').run(mediaId);
    mark(db, operationId, 'confirmed');
    return readMedia(db, mediaId) === undefined;
  });
  return write();
}

function insertIntent(db: SqliteDatabase, operationId: string, media: MediaCycle): void {
  db.prepare(
    `INSERT INTO media_cleanups (id, media_id, relpath, sha256, state)
     VALUES (?, ?, ?, ?, 'intent')`,
  ).run(operationId, media.id, media.relpath, media.sha256);
}

function mark(db: SqliteDatabase, operationId: string, state: MediaCleanupState): void {
  db.prepare('UPDATE media_cleanups SET state = ? WHERE id = ?').run(state, operationId);
}

function readMedia(db: SqliteDatabase, mediaId: string): MediaCycle | undefined {
  return db
    .prepare(
      `SELECT id, relpath, sha256,
              deleted_at AS deletedAt, retain_until AS retainUntil,
              reminder_shown_at AS reminderShownAt
       FROM media WHERE id = ?`,
    )
    .get(mediaId) as MediaCycle | undefined;
}

function readCleanup(db: SqliteDatabase, operationId: string): CleanupRow | undefined {
  const row = db
    .prepare('SELECT id, media_id, relpath, sha256, state FROM media_cleanups WHERE id = ?')
    .get(operationId) as CleanupRow | undefined;
  if (row !== undefined && !isState(row.state)) throw new Error('media cleanup state is invalid');
  return row;
}

function openCleanup(db: SqliteDatabase, mediaId: string): { id: string } | undefined {
  return db
    .prepare(
      `SELECT id FROM media_cleanups
       WHERE media_id = ? AND state IN ('intent', 'failed', 'unknown')`,
    )
    .get(mediaId) as { id: string } | undefined;
}

function isState(value: string): value is MediaCleanupState {
  return value === 'intent' || value === 'confirmed' || value === 'failed' || value === 'unknown';
}

function fileStillThere(absolute: string): boolean {
  try {
    return lstatSync(absolute).isFile();
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
