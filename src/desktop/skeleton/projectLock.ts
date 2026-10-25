import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const PROJECT_LOCK_NAME = '.jieyu.lock';

export type ProjectLockResult = { ok: true } | { ok: false; reason: 'busy' };

export function pidIsAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function tryAcquireProjectLock(
  projectDir: string,
  pid: number,
  isAlive: (candidate: number) => boolean = pidIsAlive,
): ProjectLockResult {
  fs.mkdirSync(projectDir, { recursive: true });
  const lockPath = path.join(projectDir, PROJECT_LOCK_NAME);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const temp = path.join(projectDir, `.${PROJECT_LOCK_NAME}.${pid}.${randomUUID()}.tmp`);
    fs.writeFileSync(temp, `${pid}\n`);
    try {
      fs.linkSync(temp, lockPath);
      return { ok: true };
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : '';
      if (code !== 'EEXIST') throw error;
      const existing = Number.parseInt(fs.readFileSync(lockPath, 'utf8'), 10);
      if (Number.isFinite(existing) && isAlive(existing)) return { ok: false, reason: 'busy' };
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // another process removed the stale lock
      }
    } finally {
      fs.rmSync(temp, { force: true });
    }
  }
  return { ok: false, reason: 'busy' };
}

export function releaseProjectLock(projectDir: string, pid: number): void {
  const lockPath = path.join(projectDir, PROJECT_LOCK_NAME);
  if (!fs.existsSync(lockPath)) return;
  const existing = Number.parseInt(fs.readFileSync(lockPath, 'utf8'), 10);
  if (existing !== pid) return;
  fs.unlinkSync(lockPath);
}
