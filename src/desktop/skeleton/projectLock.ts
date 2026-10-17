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
  if (fs.existsSync(lockPath)) {
    const existing = Number.parseInt(fs.readFileSync(lockPath, 'utf8'), 10);
    if (Number.isFinite(existing) && isAlive(existing)) {
      return { ok: false, reason: 'busy' };
    }
  }
  fs.writeFileSync(lockPath, `${pid}\n`);
  return { ok: true };
}
