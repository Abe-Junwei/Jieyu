/**
 * 锚点计数在项目文件夹的 `.jyd` 里（ADR-0072 已有的 media_id）。
 * 只数这些行。不另加列，不进子目录。
 * 同一个编号出现在两份文稿里、又落在同一条录音上，就拒绝，不把这一行算两次。
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { MANUSCRIPT_APPLICATION_ID } from './sqliteSpeakerAssignment';

type SqliteDatabase = InstanceType<typeof Database>;

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

function anchorId(value: unknown): string {
  if (typeof value !== 'object' || value === null) throw new Error('anchor row is incomplete');
  const id = (value as Record<string, unknown>).id;
  if (typeof id !== 'string' || id.length === 0) throw new Error('anchor row is incomplete');
  return id;
}

function eachManuscript<T>(projectDir: string, read: (db: SqliteDatabase) => T[]): T[] {
  const rows: T[] = [];
  for (const file of manuscripts(projectDir)) {
    const db = openManuscript(file);
    try {
      rows.push(...read(db));
    } finally {
      db.close();
    }
  }
  return rows;
}

function countAnchorsByMediaInProject(projectDir: string, mediaId: string): number {
  const id = mediaId.trim();
  if (id.length === 0) return 0;
  const seen = new Set<string>();
  let count = 0;
  for (const row of eachManuscript(projectDir, (db) =>
    db.prepare('SELECT id FROM anchors WHERE media_id = ?').all(id),
  )) {
    const anchor = anchorId(row);
    if (seen.has(anchor)) throw new Error(`duplicate anchor ${anchor} in project folder`);
    seen.add(anchor);
    count += 1;
  }
  return count;
}

export function anchorCountMethods(projectDir: string | undefined) {
  function folder(): string {
    if (projectDir === undefined) {
      throw new Error('sqlite storage port has not opened a project folder');
    }
    return projectDir;
  }
  return {
    async countAnchorsByMedia(mediaId: string) {
      return countAnchorsByMediaInProject(folder(), mediaId);
    },
  };
}
