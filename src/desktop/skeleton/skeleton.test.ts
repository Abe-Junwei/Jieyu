import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DESKTOP_CSP } from './desktopCsp';
import { isAllowedAiOutboundUrl, isAppNavigation, secretStoreRefusal } from './desktopSecurity';
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
  it('refuses to store secrets with the Linux basic_text backend outside the smoke run', () => {
    expect(secretStoreRefusal(true, 'basic_text', false)).toBe('basic_text');
    expect(secretStoreRefusal(true, 'basic_text', true)).toBeNull();
    expect(secretStoreRefusal(true, 'gnome_libsecret', false)).toBeNull();
    expect(secretStoreRefusal(true, null, false)).toBeNull();
    expect(secretStoreRefusal(false, null, true)).toBe('unavailable');
  });

  it('attaches a bearer only for origins main configured', () => {
    const allowed = ['http://127.0.0.1:4312', 'https://api.example.test'];
    expect(isAllowedAiOutboundUrl('http://127.0.0.1:4312/stream', allowed)).toBe(true);
    expect(isAllowedAiOutboundUrl('https://api.example.test/v1', allowed)).toBe(true);
    expect(isAllowedAiOutboundUrl('http://127.0.0.1:1/nope', allowed)).toBe(false);
    expect(isAllowedAiOutboundUrl('https://evil.example/v1', allowed)).toBe(false);
    expect(isAllowedAiOutboundUrl('http://user:pass@127.0.0.1:4312/stream', allowed)).toBe(false);
    expect(isAllowedAiOutboundUrl('file:///etc/passwd', allowed)).toBe(false);
    expect(isAllowedAiOutboundUrl('http://127.0.0.1:4312/stream', [])).toBe(false);
  });

  it('only allows navigation that stays on the app page', () => {
    expect(isAppNavigation('http://localhost:5173/#/x', 'http://localhost:5173/')).toBe(true);
    expect(isAppNavigation('https://evil.example/', 'http://localhost:5173/')).toBe(false);
    expect(isAppNavigation('file:///app/dist/index.html#a', 'file:///app/dist/index.html')).toBe(
      true,
    );
    expect(isAppNavigation('file:///etc/passwd', 'file:///app/dist/index.html')).toBe(false);
    expect(isAppNavigation('javascript:alert(1)', 'http://localhost:5173/')).toBe(false);
    expect(isAppNavigation('http://localhost:5173/', '')).toBe(false);
  });

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
