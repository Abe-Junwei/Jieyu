import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { createMedia, mediaRelpath } from './media';

type SqliteDatabase = InstanceType<typeof Database>;

export type MediaReregistration =
  { status: 'created'; id: string } | { status: 'choose'; ids: string[] };

export function reregisterMedia(
  db: SqliteDatabase,
  folder: string,
  input: { relpath: string; duration: number },
): MediaReregistration {
  const relpath = mediaRelpath(folder, input.relpath);
  const absolute = path.resolve(realpathSync(folder), relpath);
  const digest = createHash('sha256').update(readFileSync(absolute)).digest('hex');
  const active = db
    .prepare('SELECT id FROM media WHERE sha256 = ? AND deleted_at IS NULL')
    .get(digest) as { id: string } | undefined;
  if (active !== undefined) throw new Error('media hash is already registered');
  const deleted = db
    .prepare(`SELECT id FROM media WHERE sha256 = ? AND deleted_at IS NOT NULL ORDER BY id`)
    .all(digest) as { id: string }[];
  if (deleted.length > 0) return { status: 'choose', ids: deleted.map((row) => row.id) };
  const created = createMedia(db, folder, {
    relpath,
    sha256: digest,
    duration: input.duration,
  });
  return { status: 'created', id: created.id };
}

export function restoreRegisteredMedia(db: SqliteDatabase, id: string): { id: string } {
  const write = db.transaction(() => {
    const row = db.prepare('SELECT deleted_at FROM media WHERE id = ?').get(id) as
      { deleted_at: string | null } | undefined;
    if (row === undefined) throw new Error('media is missing');
    if (row.deleted_at === null) throw new Error('media is active');
    db.prepare(
      `UPDATE media
       SET deleted_at = NULL, retain_until = NULL, reminder_shown_at = NULL
       WHERE id = ? AND deleted_at IS NOT NULL`,
    ).run(id);
    const next = db.prepare('SELECT deleted_at FROM media WHERE id = ?').get(id) as {
      deleted_at: string | null;
    };
    if (next.deleted_at !== null) throw new Error('media restore readback failed');
    return { id };
  });
  return write();
}
