import fs from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { PROJECT_LOCK_NAME, releaseAllProjectLocks, tryAcquireProjectLock } from './projectLock';

afterEach(() => {
  releaseAllProjectLocks();
  vi.restoreAllMocks();
});

it('does not take a lock that is still waiting for its owner file', () => {
  const folder = mkdtempSync(join(tmpdir(), 'jieyu-fix-owner-'));
  const mkdir = fs.mkdirSync.bind(fs);
  let competitor: unknown;
  let inserted = false;
  const spy = vi.spyOn(fs, 'mkdirSync').mockImplementation(((
    file: fs.PathLike,
    options?: fs.MakeDirectoryOptions,
  ) => {
    const result = mkdir(file, options);
    if (String(file) === join(folder, PROJECT_LOCK_NAME) && !inserted) {
      inserted = true;
      competitor = tryAcquireProjectLock(folder);
    }
    return result;
  }) as typeof fs.mkdirSync);
  try {
    expect(tryAcquireProjectLock(folder)).toEqual({ ok: true });
    expect(competitor).toEqual({ ok: false, reason: 'busy' });
  } finally {
    spy.mockRestore();
    releaseAllProjectLocks();
    rmSync(folder, { recursive: true, force: true });
  }
});
