import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DESKTOP_CSP } from './desktopCsp';
import { sliceForRange } from './mediaRange';
import { openProjectFolder } from './openProject';
import { writeProbeAndReadBack } from './probeStore';
import { PROJECT_LOCK_NAME } from './projectLock';
import { syncFolderWarning } from './syncFolder';
import { USER_DATA_DIRS, ensureUserDataLayout } from './userDataLayout';

const temps: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jieyu-skeleton-'));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('desktop skeleton', () => {
  it('writes one probe row and reads it back', () => {
    const dir = tempDir();
    const row = writeProbeAndReadBack(path.join(dir, 'project.sqlite'), 'ping');
    expect(row).toEqual({ id: 1, note: 'ping' });
    const again = writeProbeAndReadBack(path.join(dir, 'project.sqlite'), 'pong');
    expect(again).toEqual({ id: 2, note: 'pong' });
  });

  it('warns for sync folders and still records the path', () => {
    expect(syncFolderWarning('/Users/a/Library/CloudStorage/OneDrive-Personal/proj')).toBe(
      'sync-folder',
    );
    expect(syncFolderWarning('/tmp/field-notes')).toBeNull();
    expect(syncFolderWarning('/tmp/BaiduNetdisk/proj')).toBe('sync-folder');
  });

  it('blocks a second opener while the lock pid is alive', () => {
    const dir = tempDir();
    const userData = tempDir();
    ensureUserDataLayout(userData);
    for (const name of USER_DATA_DIRS) {
      expect(fs.statSync(path.join(userData, name)).isDirectory()).toBe(true);
    }
    const project = path.join(dir, 'notes');
    const first = openProjectFolder({
      folder: project,
      pid: 10,
      isAlive: () => true,
      userDataRoot: userData,
    });
    const sameProcess = openProjectFolder({
      folder: project,
      pid: 10,
      isAlive: () => true,
      userDataRoot: userData,
    });
    const second = openProjectFolder({
      folder: project,
      pid: 11,
      isAlive: () => true,
      userDataRoot: userData,
    });
    expect(first.lock).toBe('acquired');
    expect(sameProcess.lock).toBe('busy');
    expect(second.lock).toBe('busy');
    expect(fs.readFileSync(path.join(project, PROJECT_LOCK_NAME), 'utf8')).toBe('10\n');
    expect(first.backupDir && fs.statSync(first.backupDir).isDirectory()).toBe(true);
  });

  it('takes over a lock whose pid is gone', () => {
    const project = path.join(tempDir(), 'notes');
    const isAlive = (pid: number) => pid !== 10;
    openProjectFolder({ folder: project, pid: 10, isAlive });
    const next = openProjectFolder({ folder: project, pid: 12, isAlive });
    expect(next.lock).toBe('acquired');
    expect(fs.readFileSync(path.join(project, PROJECT_LOCK_NAME), 'utf8')).toBe('12\n');
  });

  it('slices a Range header and rejects an empty span', () => {
    expect(sliceForRange(8, null)).toEqual({ status: 200, start: 0, end: 7 });
    expect(sliceForRange(8, 'bytes=0-3')).toEqual({ status: 206, start: 0, end: 3 });
    expect(sliceForRange(8, 'bytes=0-')).toEqual({ status: 206, start: 0, end: 7 });
    expect(sliceForRange(8, 'bytes=-')).toEqual({ status: 416, start: 0, end: 0 });
  });

  it('keeps desktop connect-src on this machine', () => {
    expect(DESKTOP_CSP).toContain("connect-src 'self'");
    expect(DESKTOP_CSP).not.toContain('https:');
  });
});
