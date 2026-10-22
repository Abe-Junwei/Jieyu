import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { HIDDEN_DIRECTORY } from './projectFiles/fileOps';
import { MANUSCRIPT_APPLICATION_ID, PROJECT_APPLICATION_ID } from './sqliteSpeakerAssignment';
import { openSqliteStoragePort } from './sqliteStoragePort';

const TEXT_ID = 'text-units';
const roots: string[] = [];

function pragmaFile(file: string, applicationId: number, sql: string): void {
  const db = new Database(file);
  db.exec('PRAGMA journal_mode = DELETE');
  db.exec(`PRAGMA application_id = ${applicationId}`);
  db.exec('PRAGMA user_version = 1');
  db.exec(sql);
  db.close();
}

function tempProject(): { root: string; folder: string; userData: string } {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-sqlite-units-'));
  roots.push(root);
  const folder = join(root, 'project');
  mkdirSync(folder);
  pragmaFile(
    join(folder, 'project.sqlite'),
    PROJECT_APPLICATION_ID,
    'CREATE TABLE project (id TEXT PRIMARY KEY)',
  );
  const units = `CREATE TABLE units (
    id TEXT PRIMARY KEY,
    text_id TEXT
  );`;
  pragmaFile(join(folder, 'mixed.jyd'), MANUSCRIPT_APPLICATION_ID, units);
  pragmaFile(join(folder, 'other.jyd'), MANUSCRIPT_APPLICATION_ID, units);
  const hidden = join(folder, HIDDEN_DIRECTORY);
  mkdirSync(hidden);
  pragmaFile(join(hidden, 'hidden.jyd'), MANUSCRIPT_APPLICATION_ID, units);
  return { root, folder, userData: join(root, 'user-data.sqlite') };
}

function insertUnit(file: string, id: string, textId: string | null): void {
  const db = new Database(file);
  db.prepare('INSERT INTO units (id, text_id) VALUES (?, ?)').run(id, textId);
  db.close();
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('sqlite manuscript unit ids', () => {
  it('lists ids for one project after reopen and skips other manuscripts', async () => {
    const { folder, userData } = tempProject();
    insertUnit(join(folder, 'mixed.jyd'), 'unit-c', TEXT_ID);
    insertUnit(join(folder, 'mixed.jyd'), 'unit-b', 'text-other');
    insertUnit(join(folder, 'mixed.jyd'), 'unit-blank', null);
    insertUnit(join(folder, 'other.jyd'), 'unit-a', TEXT_ID);
    insertUnit(join(folder, HIDDEN_DIRECTORY, 'hidden.jyd'), 'unit-hidden', TEXT_ID);
    const first = openSqliteStoragePort(userData, folder);
    try {
      await expect(first.port.listLayerUnitIdsByText(TEXT_ID)).resolves.toEqual([
        'unit-a',
        'unit-c',
      ]);
      await expect(first.port.listLayerUnitIdsByText('  ')).resolves.toEqual([]);
      await expect(first.port.countPresentLayerUnits(['unit-c', 'gone', 'unit-c'])).resolves.toBe(
        2,
      );
      await expect(first.port.countPresentLayerUnits([])).resolves.toBe(0);
    } finally {
      first.close();
    }
    const second = openSqliteStoragePort(userData, folder);
    try {
      await expect(second.port.listLayerUnitIdsByText(TEXT_ID)).resolves.toEqual([
        'unit-a',
        'unit-c',
      ]);
      await expect(second.port.countPresentLayerUnits(['unit-a', 'unit-hidden'])).resolves.toBe(1);
    } finally {
      second.close();
    }
  });

  it('refuses the same unit id in two manuscripts and leaves the rows', async () => {
    const { folder, userData } = tempProject();
    insertUnit(join(folder, 'mixed.jyd'), 'unit-dup', TEXT_ID);
    insertUnit(join(folder, 'other.jyd'), 'unit-dup', TEXT_ID);
    insertUnit(join(folder, 'other.jyd'), 'unit-ok', TEXT_ID);
    const opened = openSqliteStoragePort(userData, folder);
    try {
      await expect(opened.port.listLayerUnitIdsByText(TEXT_ID)).rejects.toThrow(
        'duplicate unit unit-dup in project folder',
      );
      await expect(opened.port.countPresentLayerUnits(['unit-dup'])).rejects.toThrow(
        'duplicate unit unit-dup in project folder',
      );
      await expect(opened.port.countPresentLayerUnits(['unit-ok'])).resolves.toBe(1);
    } finally {
      opened.close();
    }
    const stored = new Database(join(folder, 'mixed.jyd'));
    try {
      expect(stored.prepare('SELECT id FROM units WHERE id = ?').get('unit-dup')).toEqual({
        id: 'unit-dup',
      });
    } finally {
      stored.close();
    }
  });

  it('does not read unit ids when no project folder is open', async () => {
    const { userData } = tempProject();
    const opened = openSqliteStoragePort(userData);
    try {
      await expect(opened.port.listLayerUnitIdsByText(TEXT_ID)).rejects.toThrow(
        /has not opened a project folder/,
      );
      await expect(opened.port.countPresentLayerUnits(['unit-a'])).rejects.toThrow(
        /has not opened a project folder/,
      );
    } finally {
      opened.close();
    }
  });
});
