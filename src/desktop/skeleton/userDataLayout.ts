import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const USER_DATA_DIRS = ['preferences', 'cache', 'backups', 'models'] as const;

export function ensureUserDataLayout(root: string): void {
  for (const dir of USER_DATA_DIRS) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }
}

/** Stable backup subdir key: full resolved path hash, not basename (#404). */
export function projectBackupKey(folder: string): string {
  return createHash('sha256').update(path.resolve(folder)).digest('hex');
}

export function ensureProjectBackupDir(root: string, projectKey: string): string {
  const dir = path.join(root, 'backups', projectKey);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Write/list/restore share this path (#404 write, #428 list/restore). */
export function projectBackupDir(userDataRoot: string, folder: string): string {
  return ensureProjectBackupDir(userDataRoot, projectBackupKey(folder));
}

