import Database from 'better-sqlite3';

export interface ProbeRow {
  id: number;
  note: string;
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
