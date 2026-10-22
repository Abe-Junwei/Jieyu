/**
 * 去掉一条空录音（ADR-0076）。
 * 先改每一份碰到的 `.jyd`，再改项目库。各文件一次事务，提交后再读回。读回失败不撤销。
 * 不删磁盘上的音频文件，不改文稿的 `meta.audio_id`。
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { emptyRecordingRemovalByteBlock } from '../utils/mediaItemState';
import { readMediaItemById } from './sqliteMediaItems';
import { MANUSCRIPT_APPLICATION_ID } from './sqliteSpeakerAssignment';
import { RecordingRemovalBlockedError } from './storagePort';
import { StorageReadbackError } from './storageReadbackError';

type SqliteDatabase = InstanceType<typeof Database>;

const OPERATION = 'removeEmptyRecording';
const UNBOUND_MEDIA_ID = '__unknown_media__';

interface ManuscriptHits {
  file: string;
  unitIds: string[];
  anchorIds: string[];
  trackIds: string[];
}

function applicationId(db: SqliteDatabase): number {
  const row: unknown = db.prepare('PRAGMA application_id').get();
  if (typeof row !== 'object' || row === null) return 0;
  const value = (row as { application_id?: unknown }).application_id;
  return typeof value === 'number' ? value : 0;
}

function manuscripts(projectDir: string): string[] {
  return readdirSync(projectDir)
    .filter((name) => name.endsWith('.jyd'))
    .sort()
    .map((name) => path.join(projectDir, name));
}

function openManuscript(file: string): SqliteDatabase {
  const db = new Database(file);
  db.exec('PRAGMA journal_mode = DELETE');
  if (applicationId(db) !== MANUSCRIPT_APPLICATION_ID) {
    db.close();
    throw new Error(`${path.basename(file)} application_id is not a Jieyu manuscript`);
  }
  return db;
}

function ids(db: SqliteDatabase, sql: string, mediaId: string): string[] {
  const found: string[] = [];
  for (const value of db.prepare(sql).all(mediaId)) {
    if (typeof value !== 'object' || value === null) continue;
    const id = (value as { id?: unknown }).id;
    if (typeof id === 'string') found.push(id);
  }
  return found;
}

function mediaColumn(row: unknown): string | undefined {
  if (typeof row !== 'object' || row === null) return undefined;
  const id = (row as { media_id?: unknown }).media_id;
  return typeof id === 'string' ? id : undefined;
}

function collectHits(projectDir: string, mediaId: string): ManuscriptHits[] {
  const hits: ManuscriptHits[] = [];
  for (const file of manuscripts(projectDir)) {
    const db = openManuscript(file);
    try {
      const unitIds = ids(db, 'SELECT id FROM units WHERE media_id = ? ORDER BY id', mediaId);
      const anchorIds = ids(db, 'SELECT id FROM anchors WHERE media_id = ? ORDER BY id', mediaId);
      const trackIds = ids(
        db,
        'SELECT id FROM track_entities WHERE media_id = ? ORDER BY id',
        mediaId,
      );
      if (unitIds.length > 0 || anchorIds.length > 0 || trackIds.length > 0) {
        hits.push({ file, unitIds, anchorIds, trackIds });
      }
    } finally {
      db.close();
    }
  }
  return hits;
}

function sourceIds(project: SqliteDatabase, mediaId: string): string[] {
  return ids(project, 'SELECT id FROM source_records WHERE media_id = ? ORDER BY id', mediaId);
}

function rewriteManuscript(file: string, mediaId: string, now: string): void {
  const db = openManuscript(file);
  try {
    const updateUnits = db.prepare(
      'UPDATE units SET media_id = ?, updated_at = ? WHERE media_id = ?',
    );
    const updateAnchors = db.prepare('UPDATE anchors SET media_id = ? WHERE media_id = ?');
    const deleteTracks = db.prepare('DELETE FROM track_entities WHERE media_id = ?');
    db.transaction(() => {
      updateUnits.run(UNBOUND_MEDIA_ID, now, mediaId);
      updateAnchors.run(UNBOUND_MEDIA_ID, mediaId);
      deleteTracks.run(mediaId);
    })();
  } finally {
    db.close();
  }
}

function rewriteLibrary(project: SqliteDatabase, mediaId: string, now: string): void {
  const clearSources = project.prepare(
    'UPDATE source_records SET media_id = NULL, updated_at = ? WHERE media_id = ?',
  );
  const deleteMedia = project.prepare('DELETE FROM media_items WHERE id = ?');
  project.transaction(() => {
    clearSources.run(now, mediaId);
    deleteMedia.run(mediaId);
  })();
}

function assertRebound(db: SqliteDatabase, sql: string, id: string): void {
  const row: unknown = db.prepare(sql).get(id);
  if (mediaColumn(row) !== UNBOUND_MEDIA_ID) throw new StorageReadbackError(OPERATION);
}

function readBack(
  project: SqliteDatabase,
  projectDir: string,
  hits: readonly ManuscriptHits[],
  unboundSourceIds: readonly string[],
  mediaId: string,
): void {
  if (readMediaItemById(project, mediaId) !== undefined) throw new StorageReadbackError(OPERATION);
  if (sourceIds(project, mediaId).length > 0) throw new StorageReadbackError(OPERATION);
  for (const sourceId of unboundSourceIds) {
    const row: unknown = project
      .prepare('SELECT id, media_id FROM source_records WHERE id = ?')
      .get(sourceId);
    if (row === undefined || mediaColumn(row) === mediaId)
      throw new StorageReadbackError(OPERATION);
  }
  for (const file of manuscripts(projectDir)) {
    const db = openManuscript(file);
    try {
      const left =
        ids(db, 'SELECT id FROM units WHERE media_id = ?', mediaId).length +
        ids(db, 'SELECT id FROM anchors WHERE media_id = ?', mediaId).length +
        ids(db, 'SELECT id FROM track_entities WHERE media_id = ?', mediaId).length;
      if (left > 0) throw new StorageReadbackError(OPERATION);
    } finally {
      db.close();
    }
  }
  for (const hit of hits) {
    const db = openManuscript(hit.file);
    try {
      for (const unitId of hit.unitIds) {
        assertRebound(db, 'SELECT media_id FROM units WHERE id = ?', unitId);
      }
      for (const anchorId of hit.anchorIds) {
        assertRebound(db, 'SELECT media_id FROM anchors WHERE id = ?', anchorId);
      }
      for (const trackId of hit.trackIds) {
        if (db.prepare('SELECT id FROM track_entities WHERE id = ?').get(trackId) !== undefined) {
          throw new StorageReadbackError(OPERATION);
        }
      }
    } finally {
      db.close();
    }
  }
}

export function removeEmptyRecordingInProject(
  project: SqliteDatabase,
  projectDir: string,
  mediaId: string,
): { unboundSourceIds: string[] } {
  const id = mediaId.trim();
  if (id.length === 0) throw new RecordingRemovalBlockedError(mediaId, 'missing');
  const row = readMediaItemById(project, id);
  if (row === undefined) throw new RecordingRemovalBlockedError(id, 'missing');
  const blocked = emptyRecordingRemovalByteBlock(row);
  if (blocked !== null) throw new RecordingRemovalBlockedError(id, blocked);
  const hits = collectHits(projectDir, id);
  const unboundSourceIds = sourceIds(project, id);
  const now = new Date().toISOString();
  for (const hit of hits) rewriteManuscript(hit.file, id, now);
  rewriteLibrary(project, id, now);
  readBack(project, projectDir, hits, unboundSourceIds, id);
  return { unboundSourceIds };
}
