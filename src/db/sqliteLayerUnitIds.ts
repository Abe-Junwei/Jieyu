/**
 * 语段编号在项目文件夹的 `.jyd` 里（ADR-0072 已有的 id 和 text_id）。
 * 只读这些编号。不读整份语段文档，不进子目录。
 * 同一个编号出现在两份文稿里就拒绝。
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

function unitId(value: unknown): string {
  if (typeof value !== 'object' || value === null) throw new Error('unit row is incomplete');
  const id = (value as Record<string, unknown>).id;
  if (typeof id !== 'string' || id.length === 0) throw new Error('unit row is incomplete');
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

export function listLayerUnitIdsByTextInProject(projectDir: string, textId: string): string[] {
  const id = textId.trim();
  if (id.length === 0) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const row of eachManuscript(projectDir, (db) =>
    db.prepare('SELECT id FROM units WHERE text_id = ? ORDER BY id').all(id),
  )) {
    const unit = unitId(row);
    if (seen.has(unit)) throw new Error(`duplicate unit ${unit} in project folder`);
    seen.add(unit);
    ids.push(unit);
  }
  ids.sort();
  return ids;
}

export function countPresentLayerUnitsInProject(
  projectDir: string,
  ids: readonly string[],
): number {
  if (ids.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const row of eachManuscript(projectDir, (db) => db.prepare('SELECT id FROM units').all())) {
    const unit = unitId(row);
    counts.set(unit, (counts.get(unit) ?? 0) + 1);
  }
  let present = 0;
  for (const id of ids) {
    const found = counts.get(id) ?? 0;
    if (found > 1) throw new Error(`duplicate unit ${id} in project folder`);
    if (found === 1) present += 1;
  }
  return present;
}

export function layerUnitIdMethods(projectDir: string | undefined) {
  function folder(): string {
    if (projectDir === undefined) {
      throw new Error('sqlite storage port has not opened a project folder');
    }
    return projectDir;
  }
  return {
    async listLayerUnitIdsByText(textId: string) {
      return listLayerUnitIdsByTextInProject(folder(), textId);
    },
    async countPresentLayerUnits(ids: readonly string[]) {
      return countPresentLayerUnitsInProject(folder(), ids);
    },
  };
}
