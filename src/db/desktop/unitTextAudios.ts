import type Database from 'better-sqlite3';

type SqliteDatabase = InstanceType<typeof Database>;

export interface StoredTextAudio {
  id: string;
  unit_text_id: string;
  file_id: string;
  position: number;
}

export function audiosOfText(db: SqliteDatabase, unitTextId: string): StoredTextAudio[] {
  return db
    .prepare(
      `SELECT id, unit_text_id, file_id, position
       FROM unit_text_audios WHERE unit_text_id = ? ORDER BY position, id`,
    )
    .all(unitTextId) as StoredTextAudio[];
}

export function audiosOfUnit(db: SqliteDatabase, unitId: string): StoredTextAudio[] {
  return db
    .prepare(
      `SELECT unit_text_audios.id, unit_text_audios.unit_text_id, unit_text_audios.file_id,
              unit_text_audios.position
       FROM unit_text_audios
       JOIN unit_texts ON unit_texts.id = unit_text_audios.unit_text_id
       WHERE unit_texts.unit_id = ?
       ORDER BY unit_text_audios.position, unit_text_audios.id`,
    )
    .all(unitId) as StoredTextAudio[];
}

export function textAudioCount(db: SqliteDatabase, unitTextId: string): number {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM unit_text_audios WHERE unit_text_id = ?')
    .get(unitTextId) as { n: number };
  return row.n;
}

/** Empty body rows stay when recordings, active notes, or a non-null self_certainty remain. */
export function keepEmptyUnitText(db: SqliteDatabase, unitTextId: string): boolean {
  if (textAudioCount(db, unitTextId) > 0) return true;
  const notes = db
    .prepare(
      `SELECT COUNT(*) AS n FROM notes
       WHERE unit_text_id = ? AND attachment = 'active'`,
    )
    .get(unitTextId) as { n: number };
  if (notes.n > 0) return true;
  const certainty = db
    .prepare('SELECT self_certainty FROM unit_texts WHERE id = ?')
    .get(unitTextId) as { self_certainty: string | null } | undefined;
  return certainty?.self_certainty != null;
}

export function insertTextAudio(db: SqliteDatabase, row: StoredTextAudio): void {
  db.prepare(
    `INSERT INTO unit_text_audios (id, unit_text_id, file_id, position)
     VALUES (?, ?, ?, ?)`,
  ).run(row.id, row.unit_text_id, row.file_id, row.position);
}

export function fileIdsOfUnit(db: SqliteDatabase, unitId: string): string[] {
  return audiosOfUnit(db, unitId).map((row) => row.file_id);
}

/** Compact to 1..n from the low end. Each new position is lower, so the unique check does not collide. */
export function repackTextAudios(db: SqliteDatabase, unitTextId: string): void {
  const rows = audiosOfText(db, unitTextId);
  const write = db.prepare('UPDATE unit_text_audios SET position = ? WHERE id = ?');
  rows.forEach((row, index) => {
    const position = index + 1;
    if (row.position !== position) write.run(position, row.id);
  });
}
