import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { HIDDEN_DIRECTORY } from './projectFiles/fileOps';
import { MANUSCRIPT_APPLICATION_ID, PROJECT_APPLICATION_ID } from './sqliteSpeakerAssignment';
import { openSqliteStoragePort } from './sqliteStoragePort';

const TEXT_ID = 'text-tokens';
const roots: string[] = [];

function pragmaFile(file: string, applicationId: number, sql: string): void {
  const db = new Database(file);
  db.exec('PRAGMA journal_mode = DELETE');
  db.exec(`PRAGMA application_id = ${applicationId}`);
  db.exec('PRAGMA user_version = 1');
  db.exec(sql);
  db.close();
}

const TABLES = `CREATE TABLE units (
    id TEXT PRIMARY KEY,
    text_id TEXT
  );
  CREATE TABLE tokens (
    id TEXT PRIMARY KEY,
    unit_id TEXT NOT NULL,
    token_index INTEGER NOT NULL,
    form TEXT NOT NULL
  );`;

function tempProject(): { root: string; folder: string; userData: string } {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-sqlite-tokens-'));
  roots.push(root);
  const folder = join(root, 'project');
  mkdirSync(folder);
  pragmaFile(
    join(folder, 'project.sqlite'),
    PROJECT_APPLICATION_ID,
    'CREATE TABLE project (id TEXT PRIMARY KEY)',
  );
  pragmaFile(join(folder, 'mixed.jyd'), MANUSCRIPT_APPLICATION_ID, TABLES);
  pragmaFile(join(folder, 'other.jyd'), MANUSCRIPT_APPLICATION_ID, TABLES);
  const hidden = join(folder, HIDDEN_DIRECTORY);
  mkdirSync(hidden);
  pragmaFile(join(hidden, 'hidden.jyd'), MANUSCRIPT_APPLICATION_ID, TABLES);
  return { root, folder, userData: join(root, 'user-data.sqlite') };
}

function insertUnit(file: string, id: string, textId: string | null): void {
  const db = new Database(file);
  db.prepare('INSERT INTO units (id, text_id) VALUES (?, ?)').run(id, textId);
  db.close();
}

function insertToken(file: string, id: string, unitId: string): void {
  const db = new Database(file);
  db.prepare('INSERT INTO tokens (id, unit_id, token_index, form) VALUES (?, ?, ?, ?)').run(
    id,
    unitId,
    0,
    'form',
  );
  db.close();
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('sqlite manuscript token counts', () => {
  it('counts tokens for one project after reopen and skips rows without that project', async () => {
    const { folder, userData } = tempProject();
    const mixed = join(folder, 'mixed.jyd');
    const other = join(folder, 'other.jyd');
    const hidden = join(folder, HIDDEN_DIRECTORY, 'hidden.jyd');
    insertUnit(mixed, 'unit-a', TEXT_ID);
    insertUnit(mixed, 'unit-blank', null);
    insertUnit(other, 'unit-b', TEXT_ID);
    insertUnit(other, 'unit-cross', 'text-other');
    insertUnit(hidden, 'unit-hidden', TEXT_ID);
    insertToken(mixed, 'token-a', 'unit-a');
    insertToken(mixed, 'token-b', 'unit-a');
    insertToken(mixed, 'token-blank', 'unit-blank');
    insertToken(mixed, 'token-orphan', 'unit-missing');
    insertToken(mixed, 'token-shared', 'unit-a');
    insertToken(other, 'token-c', 'unit-b');
    insertToken(other, 'token-shared', 'unit-cross');
    insertToken(hidden, 'token-hidden', 'unit-hidden');
    const first = openSqliteStoragePort(userData, folder);
    try {
      await expect(first.port.countUnitTokensByText(TEXT_ID)).resolves.toBe(4);
      await expect(first.port.countUnitTokensByText(`  ${TEXT_ID}  `)).resolves.toBe(4);
      await expect(first.port.countUnitTokensByText('text-other')).resolves.toBe(1);
      await expect(first.port.countUnitTokensByText('  ')).resolves.toBe(0);
      await expect(first.port.countUnitTokensByText('text-missing')).resolves.toBe(0);
    } finally {
      first.close();
    }
    const second = openSqliteStoragePort(userData, folder);
    try {
      await expect(second.port.countUnitTokensByText(TEXT_ID)).resolves.toBe(4);
    } finally {
      second.close();
    }
  });

  it('refuses the same token id on one project in two manuscripts and leaves the row', async () => {
    const { folder, userData } = tempProject();
    const mixed = join(folder, 'mixed.jyd');
    const other = join(folder, 'other.jyd');
    insertUnit(mixed, 'unit-a', TEXT_ID);
    insertUnit(other, 'unit-b', TEXT_ID);
    insertUnit(other, 'unit-ok', 'text-other');
    insertToken(mixed, 'token-dup', 'unit-a');
    insertToken(other, 'token-dup', 'unit-b');
    insertToken(other, 'token-ok', 'unit-ok');
    const opened = openSqliteStoragePort(userData, folder);
    try {
      await expect(opened.port.countUnitTokensByText(TEXT_ID)).rejects.toThrow(
        'duplicate token token-dup in project folder',
      );
      await expect(opened.port.countUnitTokensByText('text-other')).resolves.toBe(1);
    } finally {
      opened.close();
    }
    const stored = new Database(mixed);
    try {
      expect(
        stored.prepare('SELECT id, unit_id FROM tokens WHERE id = ?').get('token-dup'),
      ).toEqual({ id: 'token-dup', unit_id: 'unit-a' });
    } finally {
      stored.close();
    }
  });

  it('does not count tokens when no project folder is open', async () => {
    const { userData } = tempProject();
    const opened = openSqliteStoragePort(userData);
    try {
      await expect(opened.port.countUnitTokensByText(TEXT_ID)).rejects.toThrow(
        /has not opened a project folder/,
      );
    } finally {
      opened.close();
    }
  });
});
