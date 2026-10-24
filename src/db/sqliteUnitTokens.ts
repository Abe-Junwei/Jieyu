/**
 * 词计数在项目文件夹的 `.jyd` 里。
 * 词表没有项目编号，计数连语段上已有的 text_id（ADR-0072）。
 * 只数这些行。不另加列，不读整行，不进子目录。
 * 同一个编号出现在两份文稿里、又属于同一项目，就拒绝，不把这一行算两次。
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { MANUSCRIPT_APPLICATION_ID } from './sqliteSpeakerAssignment';

type SqliteDatabase = InstanceType<typeof Database>;

const TOKEN_SQL = `SELECT tokens.id AS id
  FROM tokens
  JOIN units ON tokens.unit_id = units.id
  WHERE units.text_id = ?`;

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

function tokenId(value: unknown): string {
  if (typeof value !== 'object' || value === null) throw new Error('token row is incomplete');
  const id = (value as Record<string, unknown>).id;
  if (typeof id !== 'string' || id.length === 0) throw new Error('token row is incomplete');
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

function countUnitTokensByTextInProject(projectDir: string, textId: string): number {
  const id = textId.trim();
  if (id.length === 0) return 0;
  const seen = new Set<string>();
  let count = 0;
  for (const row of eachManuscript(projectDir, (db) => db.prepare(TOKEN_SQL).all(id))) {
    const found = tokenId(row);
    if (seen.has(found)) throw new Error(`duplicate token ${found} in project folder`);
    seen.add(found);
    count += 1;
  }
  return count;
}

export function tokenCountMethods(projectDir: string | undefined) {
  function folder(): string {
    if (projectDir === undefined) {
      throw new Error('sqlite storage port has not opened a project folder');
    }
    return projectDir;
  }
  return {
    async countUnitTokensByText(textId: string) {
      return countUnitTokensByTextInProject(folder(), textId);
    },
  };
}
