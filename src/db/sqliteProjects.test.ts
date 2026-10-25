import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { PROJECT_APPLICATION_ID } from './sqliteSpeakerAssignment';
import { openSqliteStoragePort } from './sqliteStoragePort';

const roots: string[] = [];
const NEW_PROJECT = `CREATE TABLE project (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  speaker_ids_json TEXT,
  title_json TEXT,
  created_at TEXT,
  updated_at TEXT
);`;
const OLD_PROJECT = `CREATE TABLE project (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  speaker_ids_json TEXT
);`;
const CREATED = '2020-01-01T00:00:00.000Z';
const UPDATED = '2020-01-02T00:00:00.000Z';

function pragmaFile(file: string, sql: string): void {
  const db = new Database(file);
  db.exec('PRAGMA journal_mode = DELETE');
  db.exec(`PRAGMA application_id = ${PROJECT_APPLICATION_ID}`);
  db.exec('PRAGMA user_version = 1');
  db.exec(sql);
  db.close();
}

function tempProject(sql = NEW_PROJECT): { folder: string; userData: string } {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-sqlite-project-'));
  roots.push(root);
  const folder = join(root, 'project');
  mkdirSync(folder);
  pragmaFile(join(folder, 'project.sqlite'), sql);
  return { folder, userData: join(root, 'user-data.sqlite') };
}

function insertProject(
  folder: string,
  id: string,
  title: string | null,
  createdAt: string | null,
  updatedAt: string | null,
): void {
  const db = new Database(join(folder, 'project.sqlite'));
  db.prepare(
    'INSERT INTO project (id, name, title_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, 'plain-name', title, createdAt, updatedAt);
  db.close();
}

function storedRow(folder: string): unknown {
  const db = new Database(join(folder, 'project.sqlite'));
  try {
    return db.prepare('SELECT id, name, title_json, created_at, updated_at FROM project').get();
  } finally {
    db.close();
  }
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('sqlite project row', () => {
  it('reads the title and times after reopen and leaves name unread', async () => {
    const { folder, userData } = tempProject();
    insertProject(folder, 'p-1', '{"zh":"标题"}', CREATED, UPDATED);
    const expected = {
      id: 'p-1',
      title: { zh: '标题' },
      createdAt: CREATED,
      updatedAt: UPDATED,
    };
    const first = openSqliteStoragePort(userData, folder);
    try {
      await expect(first.port.readProject(' p-1 ')).resolves.toEqual(expected);
    } finally {
      first.close();
    }
    const second = openSqliteStoragePort(userData, folder);
    try {
      await expect(second.port.readProject('p-1')).resolves.toEqual(expected);
      await expect(second.port.readProject('missing')).resolves.toBeUndefined();
      await expect(second.port.readProject('   ')).resolves.toBeUndefined();
    } finally {
      second.close();
    }
  });

  it('refuses an incomplete title or time and leaves the row', async () => {
    const { folder, userData } = tempProject();
    insertProject(folder, 'p-1', null, CREATED, UPDATED);
    const opened = openSqliteStoragePort(userData, folder);
    try {
      await expect(opened.port.readProject('p-1')).rejects.toThrow('project row is incomplete');
    } finally {
      opened.close();
    }
    expect(storedRow(folder)).toEqual({
      id: 'p-1',
      name: 'plain-name',
      title_json: null,
      created_at: CREATED,
      updated_at: UPDATED,
    });
  });

  it('refuses a title that is not a string map and a time that is not a date', async () => {
    const { folder, userData } = tempProject();
    const cases: Array<[string, string, string]> = [
      ['{"zh":1}', CREATED, UPDATED],
      ['[]', CREATED, UPDATED],
      ['{"zh":"标题"}', '', UPDATED],
      ['{"zh":"标题"}', CREATED, 'yesterday'],
    ];
    for (const [title, createdAt, updatedAt] of cases) {
      const db = new Database(join(folder, 'project.sqlite'));
      db.prepare('DELETE FROM project').run();
      db.prepare(
        'INSERT INTO project (id, name, title_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      ).run('p-1', 'plain-name', title, createdAt, updatedAt);
      db.close();
      const opened = openSqliteStoragePort(userData, folder);
      try {
        await expect(opened.port.readProject('p-1')).rejects.toThrow('project row is incomplete');
      } finally {
        opened.close();
      }
    }
    expect(storedRow(folder)).toMatchObject({ name: 'plain-name', title_json: '{"zh":"标题"}' });
  });

  it('refuses a non-blank query when the new columns are absent', async () => {
    const { folder, userData } = tempProject(OLD_PROJECT);
    const db = new Database(join(folder, 'project.sqlite'));
    db.prepare('INSERT INTO project (id, name) VALUES (?, ?)').run('p-1', 'plain-name');
    db.close();
    const opened = openSqliteStoragePort(userData, folder);
    try {
      await expect(opened.port.readProject('missing')).rejects.toThrow('project row is incomplete');
    } finally {
      opened.close();
    }
    const check = new Database(join(folder, 'project.sqlite'));
    try {
      const names = check
        .prepare('PRAGMA table_info(project)')
        .all()
        .map((row) => (row as { name: string }).name);
      expect(names).toEqual(['id', 'name', 'speaker_ids_json']);
      expect(check.prepare('SELECT id, name FROM project').get()).toEqual({
        id: 'p-1',
        name: 'plain-name',
      });
    } finally {
      check.close();
    }
  });

  it('refuses when no project folder is open', async () => {
    const root = mkdtempSync(join(tmpdir(), 'jieyu-sqlite-project-'));
    roots.push(root);
    const opened = openSqliteStoragePort(join(root, 'user-data.sqlite'));
    try {
      await expect(opened.port.readProject('p-1')).rejects.toThrow(
        'sqlite storage port has not opened a project folder',
      );
      await expect(opened.port.readProject(' ')).rejects.toThrow(
        'sqlite storage port has not opened a project folder',
      );
    } finally {
      opened.close();
    }
  });
});
