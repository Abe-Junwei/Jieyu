import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { exportDesktopJym } from './projectExchange';

type SqliteDatabase = InstanceType<typeof Database>;

/** ADR-0046 keeps three daily packages. Other files in the directory stay. */
export const DAILY_BACKUP_KEEP = 3;
const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.jym$/;

export function saveDailyProjectBackup(input: {
  db: SqliteDatabase;
  folder: string;
  backupDir: string;
  now?: Date;
}): string {
  const folderRoot = realpathSync(input.folder);
  const requested = canonicalPath(input.backupDir);
  if (isInside(folderRoot, requested)) throw new Error('backup directory is inside the project');
  mkdirSync(requested, { recursive: true });
  const backupRoot = realpathSync(requested);
  if (isInside(folderRoot, backupRoot)) throw new Error('backup directory is inside the project');
  const day = (input.now ?? new Date()).toISOString().slice(0, 10);
  if (!DAY_FILE.test(`${day}.jym`)) throw new Error('backup day is invalid');
  const bytes = exportDesktopJym(input.db, input.folder);
  const target = path.join(backupRoot, `${day}.jym`);
  const temporary = path.join(backupRoot, `.${day}.${process.pid}.jym.tmp`);
  try {
    writeFileSync(temporary, bytes);
    const stored = readFileSync(temporary);
    if (Buffer.compare(stored, Buffer.from(bytes)) !== 0) {
      throw new Error('backup readback failed');
    }
    renameSync(temporary, target);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
  const names = readdirSync(backupRoot)
    .filter((name) => DAY_FILE.test(name))
    .sort();
  for (const name of names.slice(0, Math.max(0, names.length - DAILY_BACKUP_KEEP))) {
    rmSync(path.join(backupRoot, name), { force: true });
  }
  return target;
}

function canonicalPath(target: string): string {
  let cursor = path.resolve(target);
  const suffix: string[] = [];
  while (!existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    suffix.push(path.basename(cursor));
    cursor = parent;
  }
  const real = realpathSync(cursor);
  return suffix.length === 0 ? real : path.join(real, ...suffix.reverse());
}

function isInside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}
