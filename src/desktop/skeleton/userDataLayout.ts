import fs from 'node:fs';
import path from 'node:path';

export const USER_DATA_DIRS = ['preferences', 'cache', 'backups', 'models'] as const;

export function ensureUserDataLayout(root: string): void {
  for (const dir of USER_DATA_DIRS) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }
}

export function ensureProjectBackupDir(root: string, projectName: string): string {
  const dir = path.join(root, 'backups', projectName);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
