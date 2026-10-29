import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const PROJECT_LOCK_NAME = '.jieyu.lock';

/** ponytail: mtime refresh, not flock. A holder whose event loop stalls longer than this can be taken over. Upgrade path is LockFileEx / flock when Node exposes both. */
export const PROJECT_LOCK_STALE_MS = 10_000;

const UPDATE_MS = PROJECT_LOCK_STALE_MS / 2;

export type ProjectLockResult = { ok: true } | { ok: false; reason: 'busy' };

type HeldLock = {
  token: string;
  timer: ReturnType<typeof setInterval>;
  lockDir: string;
};

const heldByFolder = new Map<string, HeldLock>();

export function tryAcquireProjectLock(projectDir: string): ProjectLockResult {
  const folder = path.resolve(projectDir);
  fs.mkdirSync(folder, { recursive: true });
  if (heldByFolder.has(folder)) return { ok: false, reason: 'busy' };
  const lockDir = path.join(folder, PROJECT_LOCK_NAME);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      fs.mkdirSync(lockDir);
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') throw error;
      if (!lockIsStale(lockDir) || !removeStaleLock(lockDir)) return { ok: false, reason: 'busy' };
      continue;
    }
    const token = randomUUID();
    try {
      fs.writeFileSync(path.join(lockDir, 'owner'), token);
    } catch (error) {
      fs.rmSync(lockDir, { recursive: true, force: true });
      throw error;
    }
    const timer = setInterval(() => {
      const held = heldByFolder.get(folder);
      if (held === undefined || held.token !== token) return;
      try {
        const now = new Date();
        fs.utimesSync(lockDir, now, now);
      } catch {
        clearInterval(timer);
        if (heldByFolder.get(folder)?.token === token) heldByFolder.delete(folder);
      }
    }, UPDATE_MS);
    timer.unref();
    heldByFolder.set(folder, { token, timer, lockDir });
    return { ok: true };
  }
  return { ok: false, reason: 'busy' };
}

export function releaseProjectLock(projectDir: string): void {
  const folder = path.resolve(projectDir);
  const held = heldByFolder.get(folder);
  if (held === undefined) return;
  clearInterval(held.timer);
  heldByFolder.delete(folder);
  let owner = '';
  try {
    owner = fs.readFileSync(path.join(held.lockDir, 'owner'), 'utf8');
  } catch {
    return;
  }
  if (owner !== held.token) return;
  fs.rmSync(held.lockDir, { recursive: true, force: true });
}

export function releaseAllProjectLocks(): void {
  for (const folder of [...heldByFolder.keys()]) releaseProjectLock(folder);
}

export function projectFolderLockedByThisProcess(projectDir: string): boolean {
  return heldByFolder.has(path.resolve(projectDir));
}

function lockIsStale(lockDir: string): boolean {
  try {
    // A directory without owner is still being created. Only an old mtime is stale.
    return Date.now() - fs.statSync(lockDir).mtimeMs > PROJECT_LOCK_STALE_MS;
  } catch {
    return false;
  }
}

function removeStaleLock(lockDir: string): boolean {
  const aside = `${lockDir}.${randomUUID()}.stale`;
  try {
    fs.renameSync(lockDir, aside);
  } catch {
    return false;
  }
  try {
    if (!lockIsStale(aside)) {
      fs.renameSync(aside, lockDir);
      return false;
    }
    fs.rmSync(aside, { recursive: true, force: true });
    return true;
  } catch {
    try {
      if (!fs.existsSync(lockDir)) fs.renameSync(aside, lockDir);
    } catch {
      // The aside name is unique. A failed restore is collected on the next acquire.
    }
    return false;
  }
}

function errorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) return '';
  const code = error.code;
  return typeof code === 'string' ? code : '';
}

process.on('exit', releaseAllProjectLocks);
