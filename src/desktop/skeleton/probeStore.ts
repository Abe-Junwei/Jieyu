import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export interface ProbeRow {
  id: number;
  note: string;
}

/** The skeleton probe is a temp fixture. It does not follow the opened project folder. */
export function probeDatabasePath(tempRoot: string): string {
  return path.join(tempRoot, 'jieyu-skeleton-probe', 'probe.sqlite');
}

export function writeSkeletonProbe(tempRoot: string, note: string): ProbeRow {
  const file = probeDatabasePath(tempRoot);
  mkdirSync(path.dirname(file), { recursive: true });
  return writeProbeAndReadBack(file, note);
}

export function fileContainsProbeTable(file: string): boolean {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    return (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'skeleton_probe'")
        .get() !== undefined
    );
  } finally {
    db.close();
  }
}

/** One IPC maps to one BEGIN/COMMIT. The table is only the skeleton proof. */
export function writeProbeAndReadBack(databasePath: string, note: string): ProbeRow {
  const db = new Database(databasePath);
  try {
    db.exec(
      'CREATE TABLE IF NOT EXISTS skeleton_probe (id INTEGER PRIMARY KEY, note TEXT NOT NULL)',
    );
    const insert = db.prepare('INSERT INTO skeleton_probe (note) VALUES (?)');
    const select = db.prepare('SELECT id, note FROM skeleton_probe WHERE id = ?');
    const commit = db.transaction((value: string): ProbeRow => {
      const info = insert.run(value);
      const row = select.get(info.lastInsertRowid) as ProbeRow | undefined;
      if (!row) throw new Error('probe row missing after commit');
      return row;
    });
    return commit(note);
  } finally {
    db.close();
  }
}
