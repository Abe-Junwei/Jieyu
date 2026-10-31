import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { PROJECT_LOCK_NAME, releaseAllProjectLocks } from '../../desktop/skeleton/projectLock';
import {
  checkDesktopFormatFreeze,
  DESKTOP_FORMAT_FREEZE_RECORD_PATH,
  parseDesktopFormatFreezeRecord,
  type DesktopFormatFreezeRecord,
} from './formatFreeze';
import { openProject } from './openProject';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-format-freeze-'));
  roots.push(root);
  return root;
}

function loadRecord(): DesktopFormatFreezeRecord {
  const raw: unknown = JSON.parse(
    readFileSync(join(process.cwd(), DESKTOP_FORMAT_FREEZE_RECORD_PATH), 'utf8'),
  );
  return parseDesktopFormatFreezeRecord(raw);
}

function pragma(db: { prepare(source: string): { get(): unknown } }, name: string): unknown {
  const row = db.prepare(`PRAGMA ${name}`).get();
  if (typeof row !== 'object' || row === null) return undefined;
  return (row as Record<string, unknown>)[name];
}

afterEach(() => {
  releaseAllProjectLocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('desktop format freeze', () => {
  it('pins the live DDL, version, and rejection rule', () => {
    const record = loadRecord();
    expect(checkDesktopFormatFreeze(record)).toEqual([]);
    expect(record.migrator).toBe(false);
  });

  it('opens a synthetic project at the pinned version', () => {
    const record = loadRecord();
    const dir = folder();
    const opened = openProject(dir);
    const names = opened.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[];
    expect(pragma(opened.db, 'user_version')).toBe(record.userVersion);
    expect(pragma(opened.db, 'application_id')).toBe(record.applicationId);
    expect(pragma(opened.db, 'journal_mode')).toBe(record.journalMode);
    expect(names.map((row) => row.name)).toEqual([...record.tables].sort());
    opened.close();
  });

  it('refuses a bumped version or an added column without changing bytes', () => {
    const record = loadRecord();
    const bumped = folder();
    openProject(bumped).close();
    const bumpedFile = join(bumped, 'project.sqlite');
    const bumpedDb = new Database(bumpedFile);
    bumpedDb.exec(`PRAGMA user_version = ${record.userVersion + 1}`);
    bumpedDb.close();
    const bumpedBefore = readFileSync(bumpedFile);
    expect(() => openProject(bumped)).toThrow(record.rejection);
    expect(readFileSync(bumpedFile)).toEqual(bumpedBefore);
    expect(readdirSync(bumped).includes(PROJECT_LOCK_NAME)).toBe(false);

    const added = folder();
    openProject(added).close();
    const addedFile = join(added, 'project.sqlite');
    const addedDb = new Database(addedFile);
    addedDb.exec('ALTER TABLE notes ADD COLUMN extra TEXT');
    addedDb.close();
    const addedBefore = readFileSync(addedFile);
    expect(() => openProject(added)).toThrow(record.rejection);
    expect(readFileSync(addedFile)).toEqual(addedBefore);
    expect(readdirSync(added).includes(PROJECT_LOCK_NAME)).toBe(false);
  });
});
