import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { releaseAllProjectLocks, tryAcquireProjectLock } from './projectLock';
import { sqliteStoragePortFlagEnabled } from './sqliteStoragePortFlag';
import {
  callLockedSqliteStorage,
  closeLockedSqliteStorage,
  openLockedSqliteStorage,
  reopenLockedSqliteStorage,
  writeProjectLibraryMarker,
} from './sqliteStorageHost';

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-sqlite-host-'));
  roots.push(root);
  return root;
}

function lock(folder: string): void {
  const result = tryAcquireProjectLock(folder);
  if (!result.ok) throw new Error('project folder is busy');
}

afterEach(() => {
  closeLockedSqliteStorage();
  releaseAllProjectLocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('sqlite storage port flag', () => {
  it('stays off unless the value is 1 or true', () => {
    expect(sqliteStoragePortFlagEnabled(undefined)).toBe(false);
    expect(sqliteStoragePortFlagEnabled('')).toBe(false);
    expect(sqliteStoragePortFlagEnabled('0')).toBe(false);
    expect(sqliteStoragePortFlagEnabled('false')).toBe(false);
    expect(sqliteStoragePortFlagEnabled('yes')).toBe(false);
    expect(sqliteStoragePortFlagEnabled('1')).toBe(true);
    expect(sqliteStoragePortFlagEnabled(' true ')).toBe(true);
  });
});

describe('locked sqlite storage host', () => {
  it('reads a turn back after the main process closes and reopens both files', async () => {
    const root = tempRoot();
    const folder = join(root, 'project');
    const userDataFile = join(root, 'user-data.sqlite');
    mkdirSync(folder, { recursive: true });
    writeProjectLibraryMarker(join(folder, 'project.sqlite'));
    lock(folder);
    const turn = { conversationId: 'c1', createdAt: 1, expiresAt: 70, note: 'kept' };
    openLockedSqliteStorage({ folder, userDataFile });
    await callLockedSqliteStorage('turns.putTurn', [turn]);
    reopenLockedSqliteStorage();
    await expect(callLockedSqliteStorage('turns.getTurn', ['c1'])).resolves.toEqual(turn);
  });

  it('refuses a project library with the wrong application id', () => {
    const root = tempRoot();
    const folder = join(root, 'project');
    const userDataFile = join(root, 'user-data.sqlite');
    mkdirSync(folder, { recursive: true });
    writeProjectLibraryMarker(join(folder, 'project.sqlite'));
    const db = new Database(join(folder, 'project.sqlite'));
    db.exec('PRAGMA application_id = 1');
    db.close();
    lock(folder);
    expect(() => openLockedSqliteStorage({ folder, userDataFile })).toThrow(
      /application_id is not a Jieyu project library/,
    );
  });

  it('refuses a user data file inside the locked folder', () => {
    const root = tempRoot();
    const folder = join(root, 'project');
    mkdirSync(folder, { recursive: true });
    writeProjectLibraryMarker(join(folder, 'project.sqlite'));
    lock(folder);
    expect(() =>
      openLockedSqliteStorage({
        folder,
        userDataFile: join(folder, 'user-data.sqlite'),
      }),
    ).toThrow(/inside the project folder/);
  });

  it('refuses a folder this process has not locked', () => {
    const root = tempRoot();
    const folder = join(root, 'project');
    mkdirSync(folder, { recursive: true });
    writeProjectLibraryMarker(join(folder, 'project.sqlite'));
    expect(() =>
      openLockedSqliteStorage({
        folder,
        userDataFile: join(root, 'user-data.sqlite'),
      }),
    ).toThrow(/not locked/);
  });
});
