/**
 * 轨道行写在一份 `.jyd` 里（ADR-0073）。
 * 一次事务改 `track_entities`，提交后再读回。读回失败不撤销。
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { CatalogOwnershipMismatchError } from '../services/projectCatalogScope';
import { MANUSCRIPT_APPLICATION_ID } from './sqliteSpeakerAssignment';
import { StorageReadbackError } from './storageReadbackError';
import type { TrackEntityDocType } from './types';

type SqliteDatabase = InstanceType<typeof Database>;
type TrackMode = TrackEntityDocType['mode'];

const OPERATION = 'putTrackEntity';
const TRACK_MODES: readonly TrackMode[] = [
  'single',
  'multi-auto',
  'multi-locked',
  'multi-speaker-fixed',
];

interface Hit {
  file: string;
  textId: string | null;
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

function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return (value as Record<string, unknown>)[key];
}

function laneLockJson(map: Record<string, number>): string {
  if (typeof map !== 'object' || map === null || Array.isArray(map)) {
    throw new Error('laneLockMap is not an object');
  }
  for (const value of Object.values(map)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error('laneLockMap is not a map of finite numbers');
    }
  }
  return JSON.stringify(map);
}

function parseLaneLock(json: unknown): Record<string, number> {
  if (typeof json !== 'string') throw new Error('track entity laneLockMap is missing');
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error('track entity laneLockMap is not an object');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('track entity laneLockMap is not an object');
  }
  const map: Record<string, number> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'number' || !Number.isFinite(item)) {
      throw new Error('track entity laneLockMap is not a map of finite numbers');
    }
    map[key] = item;
  }
  return map;
}

function isTrackMode(value: string): value is TrackMode {
  return TRACK_MODES.some((mode) => mode === value);
}

function readDoc(value: unknown): TrackEntityDocType {
  const id = field(value, 'id');
  const textId = field(value, 'text_id');
  const mediaId = field(value, 'media_id');
  const mode = field(value, 'mode');
  const updatedAt = field(value, 'updated_at');
  if (
    typeof id !== 'string' ||
    typeof textId !== 'string' ||
    typeof mediaId !== 'string' ||
    typeof mode !== 'string' ||
    !isTrackMode(mode) ||
    typeof updatedAt !== 'string'
  ) {
    throw new Error('track entity row is incomplete');
  }
  return {
    id,
    textId,
    mediaId,
    mode,
    laneLockMap: parseLaneLock(field(value, 'lane_lock_json')),
    updatedAt,
  };
}

function sameLaneLockMap(stored: Record<string, number>, written: Record<string, number>): boolean {
  const writtenKeys = Object.keys(written);
  if (Object.keys(stored).length !== writtenKeys.length) return false;
  return writtenKeys.every((key) => Object.hasOwn(stored, key) && stored[key] === written[key]);
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

function indexTracks(projectDir: string): { files: string[]; tracks: Map<string, Hit> } {
  const files = manuscripts(projectDir);
  const tracks = new Map<string, Hit>();
  for (const file of files) {
    const db = openManuscript(file);
    try {
      for (const value of db.prepare('SELECT id, text_id FROM track_entities').all()) {
        const id = field(value, 'id');
        if (typeof id !== 'string') continue;
        if (tracks.has(id)) throw new Error(`duplicate track entity ${id} in project folder`);
        const textId = field(value, 'text_id');
        tracks.set(id, { file, textId: typeof textId === 'string' ? textId : null });
      }
    } finally {
      db.close();
    }
  }
  return { files, tracks };
}

function targetFile(files: readonly string[], existing: Hit | undefined): string {
  if (existing !== undefined) return existing.file;
  if (files.length === 1) return files[0]!;
  throw new Error('track entity has no manuscript');
}

function readBack(db: SqliteDatabase, doc: TrackEntityDocType): void {
  const row: unknown = db
    .prepare(
      'SELECT id, media_id, mode, lane_lock_json, text_id, updated_at FROM track_entities WHERE id = ?',
    )
    .get(doc.id);
  let stored: TrackEntityDocType;
  try {
    stored = readDoc(row);
  } catch {
    throw new StorageReadbackError(OPERATION);
  }
  if (
    stored.textId !== doc.textId ||
    stored.mediaId !== doc.mediaId ||
    stored.mode !== doc.mode ||
    stored.updatedAt !== doc.updatedAt ||
    !sameLaneLockMap(stored.laneLockMap, doc.laneLockMap)
  ) {
    throw new StorageReadbackError(OPERATION);
  }
}

export function putTrackEntityInProject(projectDir: string, doc: TrackEntityDocType): void {
  const json = laneLockJson(doc.laneLockMap);
  const index = indexTracks(projectDir);
  const existing = index.tracks.get(doc.id);
  const owner = existing?.textId?.trim() ?? '';
  if (owner.length > 0 && owner !== doc.textId) {
    throw new CatalogOwnershipMismatchError('track_entities', doc.id, owner, doc.textId);
  }
  const file = targetFile(index.files, existing);
  const db = openManuscript(file);
  try {
    const statement = db.prepare(
      `INSERT INTO track_entities (id, media_id, mode, lane_lock_json, text_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         media_id = excluded.media_id,
         mode = excluded.mode,
         lane_lock_json = excluded.lane_lock_json,
         text_id = excluded.text_id,
         updated_at = excluded.updated_at`,
    );
    db.transaction(() => {
      statement.run(doc.id, doc.mediaId, doc.mode, json, doc.textId, doc.updatedAt);
    })();
    readBack(db, doc);
  } finally {
    db.close();
  }
}

export function listTrackEntitiesInProject(
  projectDir: string,
  textId: string,
): TrackEntityDocType[] {
  const id = textId.trim();
  if (id.length === 0) return [];
  const rows: TrackEntityDocType[] = [];
  for (const file of manuscripts(projectDir)) {
    const db = openManuscript(file);
    try {
      for (const value of db
        .prepare(
          'SELECT id, media_id, mode, lane_lock_json, text_id, updated_at FROM track_entities WHERE text_id = ? ORDER BY id',
        )
        .all(id)) {
        rows.push(readDoc(value));
      }
    } finally {
      db.close();
    }
  }
  return rows;
}
