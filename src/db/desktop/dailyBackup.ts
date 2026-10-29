import {
  existsSync,
  lstatSync,
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
import { exportDesktopJym, importDesktopJym } from './projectExchange';

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
  const day = localDay(input.now ?? new Date());
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
    const target = path.join(backupRoot, name);
    const info = lstatSync(target);
    if (info.isSymbolicLink()) {
      rmSync(target);
      continue;
    }
    if (!info.isFile()) throw new Error('backup day is invalid');
    rmSync(target);
  }
  return target;
}

export function listDailyBackupDays(backupDir: string): string[] {
  if (!existsSync(backupDir)) return [];
  return readdirSync(backupDir)
    .map((name) => {
      const match = DAY_FILE.exec(name);
      return match?.[1];
    })
    .filter((day): day is string => day !== undefined)
    .sort((left, right) => right.localeCompare(left))
    .slice(0, DAILY_BACKUP_KEEP);
}

export function restoreDailyBackup(input: {
  backupDir: string;
  day: string;
  destination: string;
}): void {
  if (!DAY_FILE.test(`${input.day}.jym`)) throw new Error('backup day is invalid');
  const file = path.join(input.backupDir, `${input.day}.jym`);
  if (!existsSync(file)) throw new Error('backup file is missing');
  importDesktopJym(input.destination, readFileSync(file));
}

function localDay(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
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
