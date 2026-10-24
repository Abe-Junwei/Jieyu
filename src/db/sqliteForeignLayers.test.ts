import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { HIDDEN_DIRECTORY } from './projectFiles/fileOps';
import { MANUSCRIPT_APPLICATION_ID, PROJECT_APPLICATION_ID } from './sqliteSpeakerAssignment';
import { openSqliteStoragePort } from './sqliteStoragePort';

const roots: string[] = [];
const NEW_LAYERS = `CREATE TABLE layers (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  language_id TEXT,
  orthography_id TEXT,
  text_id TEXT
);`;
const OLD_LAYERS = `CREATE TABLE layers (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  language_id TEXT,
  orthography_id TEXT
);`;

function pragmaFile(file: string, applicationId: number, sql: string): void {
  const db = new Database(file);
  db.exec('PRAGMA journal_mode = DELETE');
  db.exec(`PRAGMA application_id = ${applicationId}`);
  db.exec('PRAGMA user_version = 1');
  db.exec(sql);
  db.close();
}

function tempProject(sql = NEW_LAYERS): { root: string; folder: string; userData: string } {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-sqlite-layers-'));
  roots.push(root);
  const folder = join(root, 'project');
  mkdirSync(folder);
  pragmaFile(
    join(folder, 'project.sqlite'),
    PROJECT_APPLICATION_ID,
    'CREATE TABLE project (id TEXT PRIMARY KEY)',
  );
  pragmaFile(join(folder, 'mixed.jyd'), MANUSCRIPT_APPLICATION_ID, sql);
  pragmaFile(join(folder, 'other.jyd'), MANUSCRIPT_APPLICATION_ID, sql);
  return { root, folder, userData: join(root, 'user-data.sqlite') };
}

function insertLayer(file: string, id: string, textId: string | null): void {
  const db = new Database(file);
  db.prepare(
    'INSERT INTO layers (id, key, language_id, orthography_id, text_id) VALUES (?, ?, NULL, NULL, ?)',
  ).run(id, 'tx', textId);
  db.close();
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('sqlite foreign layers', () => {
  it('returns only a layer owned by another project after reopen', async () => {
    const { folder, userData } = tempProject();
    insertLayer(join(folder, 'mixed.jyd'), 'layer-a', 'project-a');
    insertLayer(join(folder, 'mixed.jyd'), 'layer-b', 'project-b');
    const query = [' layer-b ', 'layer-b', 'layer-a', 'gone', ''];
    const first = openSqliteStoragePort(userData, folder);
    try {
      await expect(first.port.listForeignOwnedLayers(query, 'project-a')).resolves.toEqual([
        { id: 'layer-b', textId: 'project-b' },
      ]);
    } finally {
      first.close();
    }
    const second = openSqliteStoragePort(userData, folder);
    try {
      await expect(second.port.listForeignOwnedLayers(query, 'project-a')).resolves.toEqual([
        { id: 'layer-b', textId: 'project-b' },
      ]);
    } finally {
      second.close();
    }
  });

  it('trims the stored project id and leaves the query project id unchanged', async () => {
    const { folder, userData } = tempProject();
    insertLayer(join(folder, 'mixed.jyd'), 'layer-spaced', ' project-a ');
    const opened = openSqliteStoragePort(userData, folder);
    try {
      await expect(
        opened.port.listForeignOwnedLayers(['layer-spaced'], 'project-a'),
      ).resolves.toEqual([]);
      await expect(
        opened.port.listForeignOwnedLayers(['layer-spaced'], ' project-a '),
      ).resolves.toEqual([{ id: 'layer-spaced', textId: 'project-a' }]);
    } finally {
      opened.close();
    }
  });

  it('does not open manuscripts when every requested id is blank', async () => {
    const { folder, userData } = tempProject();
    pragmaFile(join(folder, 'bad.jyd'), 1, NEW_LAYERS);
    const opened = openSqliteStoragePort(userData, folder);
    try {
      await expect(opened.port.listForeignOwnedLayers(['', '   '], 'project-a')).resolves.toEqual(
        [],
      );
    } finally {
      opened.close();
    }
  });

  it('refuses a matched row whose project id is empty and leaves it', async () => {
    for (const textId of [null, '', '   '] as const) {
      const { folder, userData } = tempProject();
      insertLayer(join(folder, 'mixed.jyd'), 'layer-empty', textId);
      const opened = openSqliteStoragePort(userData, folder);
      try {
        await expect(
          opened.port.listForeignOwnedLayers(['layer-empty'], 'project-a'),
        ).rejects.toThrow('layer row is incomplete');
      } finally {
        opened.close();
      }
      const stored = new Database(join(folder, 'mixed.jyd'));
      try {
        expect(
          stored.prepare('SELECT id, text_id FROM layers WHERE id = ?').get('layer-empty'),
        ).toEqual({
          id: 'layer-empty',
          text_id: textId,
        });
      } finally {
        stored.close();
      }
    }
  });

  it('refuses an old manuscript that has no project-id column', async () => {
    const { folder, userData } = tempProject(OLD_LAYERS);
    const db = new Database(join(folder, 'mixed.jyd'));
    db.prepare(
      'INSERT INTO layers (id, key, language_id, orthography_id) VALUES (?, ?, NULL, NULL)',
    ).run('layer-old', 'tx');
    db.close();
    const opened = openSqliteStoragePort(userData, folder);
    try {
      await expect(opened.port.listForeignOwnedLayers(['missing'], 'project-a')).rejects.toThrow(
        'layer row is incomplete',
      );
      await expect(opened.port.listForeignOwnedLayers(['layer-old'], 'project-a')).rejects.toThrow(
        'layer row is incomplete',
      );
    } finally {
      opened.close();
    }
    const stored = new Database(join(folder, 'mixed.jyd'));
    try {
      const names = stored
        .prepare('PRAGMA table_info(layers)')
        .all()
        .map((row) => (row as { name: string }).name);
      expect(names).not.toContain('text_id');
      expect(stored.prepare('SELECT id, key FROM layers WHERE id = ?').get('layer-old')).toEqual({
        id: 'layer-old',
        key: 'tx',
      });
    } finally {
      stored.close();
    }
  });

  it('refuses the same layer id in two manuscripts even when the owner matches', async () => {
    const { folder, userData } = tempProject();
    insertLayer(join(folder, 'mixed.jyd'), 'layer-dup', 'project-a');
    insertLayer(join(folder, 'other.jyd'), 'layer-dup', 'project-a');
    const opened = openSqliteStoragePort(userData, folder);
    try {
      await expect(opened.port.listForeignOwnedLayers(['layer-dup'], 'project-b')).rejects.toThrow(
        'duplicate layer layer-dup in project folder',
      );
    } finally {
      opened.close();
    }
    for (const name of ['mixed.jyd', 'other.jyd']) {
      const stored = new Database(join(folder, name));
      try {
        expect(
          stored.prepare('SELECT id, text_id FROM layers WHERE id = ?').get('layer-dup'),
        ).toEqual({ id: 'layer-dup', text_id: 'project-a' });
      } finally {
        stored.close();
      }
    }
  });

  it('does not read a manuscript in a hidden directory or a subdirectory', async () => {
    const { folder, userData } = tempProject();
    insertLayer(join(folder, 'mixed.jyd'), 'layer-a', 'project-a');
    const hidden = join(folder, HIDDEN_DIRECTORY);
    const nested = join(folder, 'nested');
    mkdirSync(hidden);
    mkdirSync(nested);
    pragmaFile(join(hidden, 'hidden.jyd'), MANUSCRIPT_APPLICATION_ID, NEW_LAYERS);
    pragmaFile(join(nested, 'nested.jyd'), MANUSCRIPT_APPLICATION_ID, NEW_LAYERS);
    insertLayer(join(hidden, 'hidden.jyd'), 'layer-hidden', 'project-b');
    insertLayer(join(nested, 'nested.jyd'), 'layer-nested', 'project-b');
    const opened = openSqliteStoragePort(userData, folder);
    try {
      await expect(
        opened.port.listForeignOwnedLayers(
          ['layer-hidden', 'layer-nested', 'layer-a'],
          'project-a',
        ),
      ).resolves.toEqual([]);
    } finally {
      opened.close();
    }
  });

  it('rejects a top-level file whose application id is not a manuscript', async () => {
    const { folder, userData } = tempProject();
    pragmaFile(join(folder, 'bad.jyd'), 1, NEW_LAYERS);
    const opened = openSqliteStoragePort(userData, folder);
    try {
      await expect(opened.port.listForeignOwnedLayers(['layer-a'], 'project-a')).rejects.toThrow(
        'bad.jyd application_id is not a Jieyu manuscript',
      );
    } finally {
      opened.close();
    }
  });

  it('rejects a port that has not opened a project folder', async () => {
    const { userData } = tempProject();
    const opened = openSqliteStoragePort(userData);
    try {
      await expect(opened.port.listForeignOwnedLayers(['layer-a'], 'project-a')).rejects.toThrow(
        'sqlite storage port has not opened a project folder',
      );
      await expect(opened.port.listForeignOwnedLayers([''], 'project-a')).rejects.toThrow(
        'sqlite storage port has not opened a project folder',
      );
    } finally {
      opened.close();
    }
  });
});
