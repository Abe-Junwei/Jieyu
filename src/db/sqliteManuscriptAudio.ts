/**
 * 文稿改挂录音（ADR-0077）。
 * 一份 `.jyd` 一次事务：改 `meta.audio_id`，并把这份文稿里每个语段的 `media_id` 改成同一条。
 * 已有录音是替换，不追加。提交后再读回。读回失败不撤销。
 * 不改锚点、轨道，不删音频文件，也不弹确认。
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { audioIdOf } from './projectFiles/manuscriptAudio';
import { readMediaItemById } from './sqliteMediaItems';
import { MANUSCRIPT_APPLICATION_ID } from './sqliteSpeakerAssignment';
import { StorageReadbackError } from './storageReadbackError';

type SqliteDatabase = InstanceType<typeof Database>;

const OPERATION = 'replaceManuscriptAudio';

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

function textColumn(row: unknown, key: string): string | null {
  if (typeof row !== 'object' || row === null) return null;
  const value = (row as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

function findManuscript(projectDir: string, manuscriptId: string): string {
  const hits: string[] = [];
  for (const file of manuscripts(projectDir)) {
    const db = openManuscript(file);
    try {
      if (db.prepare('SELECT id FROM meta WHERE id = ?').get(manuscriptId) !== undefined) {
        hits.push(file);
      }
    } finally {
      db.close();
    }
  }
  if (hits.length === 0) throw new Error('manuscript not found');
  if (hits.length > 1) throw new Error(`duplicate manuscript ${manuscriptId} in project folder`);
  return hits[0]!;
}

function unitProjectIds(db: SqliteDatabase): string[] {
  const ids = new Set<string>();
  for (const row of db.prepare('SELECT text_id FROM units').all()) {
    const textId = textColumn(row, 'text_id')?.trim() ?? '';
    if (textId.length > 0) ids.add(textId);
  }
  return [...ids];
}

function readBack(
  db: SqliteDatabase,
  manuscriptId: string,
  audioId: string | null,
  sourceDocumentId: string | null,
): void {
  const metaRows = db.prepare('SELECT id, audio_id, source_document_id FROM meta').all();
  if (metaRows.length !== 1) throw new StorageReadbackError(OPERATION);
  const meta = metaRows[0];
  if (textColumn(meta, 'id') !== manuscriptId) throw new StorageReadbackError(OPERATION);
  if (textColumn(meta, 'audio_id') !== audioId) throw new StorageReadbackError(OPERATION);
  if (textColumn(meta, 'source_document_id') !== sourceDocumentId) {
    throw new StorageReadbackError(OPERATION);
  }
  for (const row of db.prepare('SELECT media_id FROM units').all()) {
    if (textColumn(row, 'media_id') !== audioId) throw new StorageReadbackError(OPERATION);
  }
}

export function replaceManuscriptAudioInProject(
  project: SqliteDatabase,
  projectDir: string,
  manuscriptId: string,
  audioId: string | null,
): void {
  const id = manuscriptId.trim();
  if (id.length === 0) throw new Error('manuscript not found');
  const next = audioIdOf(audioId ?? undefined);
  const file = findManuscript(projectDir, id);
  const db = openManuscript(file);
  try {
    const metaRows = db.prepare('SELECT id, source_document_id FROM meta').all();
    if (metaRows.length !== 1) throw new Error('manuscript has more than one audio row');
    const sourceDocumentId = textColumn(metaRows[0], 'source_document_id');
    if (next !== null) {
      const media = readMediaItemById(project, next);
      if (media === undefined) throw new Error('recording not found');
      const projects = unitProjectIds(db);
      if (projects.length > 1) throw new Error('manuscript units belong to more than one project');
      const owner = projects[0];
      if (owner !== undefined && owner !== media.textId) {
        throw new Error('recording belongs to another project');
      }
    }
    const now = new Date().toISOString();
    const updateMeta = db.prepare('UPDATE meta SET audio_id = ? WHERE id = ?');
    const updateUnits = db.prepare('UPDATE units SET media_id = ?, updated_at = ?');
    db.transaction(() => {
      updateMeta.run(next, id);
      updateUnits.run(next, now);
    })();
    readBack(db, id, next, sourceDocumentId);
  } finally {
    db.close();
  }
}
