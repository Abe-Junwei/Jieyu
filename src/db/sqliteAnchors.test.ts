import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { HIDDEN_DIRECTORY } from './projectFiles/fileOps';
import { MANUSCRIPT_APPLICATION_ID, PROJECT_APPLICATION_ID } from './sqliteSpeakerAssignment';
import { openSqliteStoragePort } from './sqliteStoragePort';

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
  const root = mkdtempSync(join(tmpdir(), 'jieyu-sqlite-anchors-'));
  roots.push(root);
  const folder = join(root, 'project');
  mkdirSync(folder);
  pragmaFile(
    join(folder, 'project.sqlite'),
    PROJECT_APPLICATION_ID,
    'CREATE TABLE project (id TEXT PRIMARY KEY)',
  );
  const anchors = `CREATE TABLE anchors (
    id TEXT PRIMARY KEY,
    media_id TEXT NOT NULL,
    time REAL NOT NULL
  );`;
  pragmaFile(join(folder, 'mixed.jyd'), MANUSCRIPT_APPLICATION_ID, anchors);
  pragmaFile(join(folder, 'other.jyd'), MANUSCRIPT_APPLICATION_ID, anchors);
  const hidden = join(folder, HIDDEN_DIRECTORY);
  mkdirSync(hidden);
  pragmaFile(join(hidden, 'hidden.jyd'), MANUSCRIPT_APPLICATION_ID, anchors);
  return { root, folder, userData: join(root, 'user-data.sqlite') };
}

function insertAnchor(file: string, id: string, mediaId: string): void {
  const db = new Database(file);
  db.prepare('INSERT INTO anchors (id, media_id, time) VALUES (?, ?, ?)').run(id, mediaId, 1);
  db.close();
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('sqlite manuscript anchor counts', () => {
  it('counts anchors for one recording after reopen and skips hidden manuscripts', async () => {
    const { folder, userData } = tempProject();
    insertAnchor(join(folder, 'mixed.jyd'), 'anchor-a', 'media-a');
    insertAnchor(join(folder, 'mixed.jyd'), 'anchor-b', 'media-a');
    insertAnchor(join(folder, 'mixed.jyd'), 'anchor-cross', 'media-a');
    insertAnchor(join(folder, 'other.jyd'), 'anchor-c', 'media-a');
    insertAnchor(join(folder, 'other.jyd'), 'anchor-cross', 'media-b');
    insertAnchor(join(folder, HIDDEN_DIRECTORY, 'hidden.jyd'), 'anchor-hidden', 'media-a');
    const first = openSqliteStoragePort(userData, folder);
    try {
      await expect(first.port.countAnchorsByMedia('media-a')).resolves.toBe(4);
      await expect(first.port.countAnchorsByMedia('  media-a  ')).resolves.toBe(4);
      await expect(first.port.countAnchorsByMedia('media-b')).resolves.toBe(1);
      await expect(first.port.countAnchorsByMedia('  ')).resolves.toBe(0);
      await expect(first.port.countAnchorsByMedia('media-missing')).resolves.toBe(0);
    } finally {
      first.close();
    }
    const second = openSqliteStoragePort(userData, folder);
    try {
      await expect(second.port.countAnchorsByMedia('media-a')).resolves.toBe(4);
      await expect(second.port.countAnchorsByMedia('media-b')).resolves.toBe(1);
    } finally {
      second.close();
    }
  });

  it('refuses the same anchor id on one recording in two manuscripts and leaves the row', async () => {
    const { folder, userData } = tempProject();
    insertAnchor(join(folder, 'mixed.jyd'), 'anchor-dup', 'media-a');
    insertAnchor(join(folder, 'other.jyd'), 'anchor-dup', 'media-a');
    insertAnchor(join(folder, 'other.jyd'), 'anchor-ok', 'media-b');
    const opened = openSqliteStoragePort(userData, folder);
    try {
      await expect(opened.port.countAnchorsByMedia('media-a')).rejects.toThrow(
        'duplicate anchor anchor-dup in project folder',
      );
      await expect(opened.port.countAnchorsByMedia('media-b')).resolves.toBe(1);
    } finally {
      opened.close();
    }
    const stored = new Database(join(folder, 'mixed.jyd'));
    try {
      expect(
        stored.prepare('SELECT id, media_id FROM anchors WHERE id = ?').get('anchor-dup'),
      ).toEqual({ id: 'anchor-dup', media_id: 'media-a' });
    } finally {
      stored.close();
    }
  });

  it('does not count anchors when no project folder is open', async () => {
    const { userData } = tempProject();
    const opened = openSqliteStoragePort(userData);
    try {
      await expect(opened.port.countAnchorsByMedia('media-a')).rejects.toThrow(
        /has not opened a project folder/,
      );
    } finally {
      opened.close();
    }
  });
});
