import type Database from 'better-sqlite3';
import { readStringMap } from './stringMap';

type SqliteDatabase = InstanceType<typeof Database>;

export type DeletionReminderTarget = 'manuscript' | 'media';

export interface DeletionReminder {
  id: string;
  reminderShownAt: string;
}

export interface DueDeletionReminder {
  target: DeletionReminderTarget;
  id: string;
  title: Record<string, string> | null;
  relpath: string | null;
  retainUntil: string;
}

export function listDueDeletionReminders(db: SqliteDatabase): DueDeletionReminder[] {
  const cutoff = plusUtcDays(new Date().toISOString(), 7);
  const manuscripts = db
    .prepare(
      `SELECT id, title_json AS titleJson, retain_until AS retainUntil
       FROM manuscripts
       WHERE deleted_at IS NOT NULL AND retain_until IS NOT NULL AND retain_until <= ?
       ORDER BY retain_until, id`,
    )
    .all(cutoff) as { id: string; titleJson: string; retainUntil: string }[];
  const recordings = db
    .prepare(
      `SELECT id, relpath, retain_until AS retainUntil
       FROM media
       WHERE deleted_at IS NOT NULL AND retain_until IS NOT NULL AND retain_until <= ?
       ORDER BY retain_until, id`,
    )
    .all(cutoff) as { id: string; relpath: string; retainUntil: string }[];
  return [
    ...manuscripts.map((row) => ({
      target: 'manuscript' as const,
      id: row.id,
      title: readStringMap(row.titleJson),
      relpath: null,
      retainUntil: row.retainUntil,
    })),
    ...recordings.map((row) => ({
      target: 'media' as const,
      id: row.id,
      title: null,
      relpath: row.relpath,
      retainUntil: row.retainUntil,
    })),
  ];
}

export function showDeletionReminder(
  db: SqliteDatabase,
  target: DeletionReminderTarget,
  id: string,
): DeletionReminder {
  const table = reminderTable(target);
  const write = db.transaction(() => {
    const row = readCycle(db, table, id);
    if (row === undefined) throw new Error(`${target} is missing`);
    if (row.deletedAt === null) throw new Error(`${target} is active`);
    if (row.reminderShownAt !== null) return { id, reminderShownAt: row.reminderShownAt };
    const now = new Date().toISOString();
    if (table === 'manuscripts') {
      db.prepare(
        `UPDATE manuscripts
         SET reminder_shown_at = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NOT NULL AND reminder_shown_at IS NULL`,
      ).run(now, now, id);
    } else {
      db.prepare(
        `UPDATE media
         SET reminder_shown_at = ?
         WHERE id = ? AND deleted_at IS NOT NULL AND reminder_shown_at IS NULL`,
      ).run(now, id);
    }
    const next = readCycle(db, table, id);
    if (next?.reminderShownAt !== now) throw new Error(`${target} reminder readback failed`);
    return { id, reminderShownAt: now };
  });
  return write();
}

export function purgeManuscript(db: SqliteDatabase, id: string): { id: string } {
  const write = db.transaction(() => {
    const row = readCycle(db, 'manuscripts', id);
    if (row === undefined) throw new Error('manuscript is missing');
    if (row.deletedAt === null || row.retainUntil === null) throw new Error('manuscript is active');
    if (row.reminderShownAt === null) throw new Error('reminder has not been shown');
    const now = new Date().toISOString();
    if (now < earliestPurgeAt(row.retainUntil, row.reminderShownAt)) {
      throw new Error('manuscript is inside its retention window');
    }
    const running = db
      .prepare(`SELECT id FROM model_runs WHERE manuscript_id = ? AND status = 'running' LIMIT 1`)
      .get(id) as { id: string } | undefined;
    if (running) throw new Error('manuscript has a running task');
    removeOwnedRows(db, id);
    db.prepare('DELETE FROM manuscripts WHERE id = ? AND deleted_at IS NOT NULL').run(id);
    if (readCycle(db, 'manuscripts', id) !== undefined) {
      throw new Error('manuscript purge readback failed');
    }
    return { id };
  });
  return write();
}

function earliestPurgeAt(retainUntil: string, reminderShownAt: string): string {
  const afterReminder = plusUtcDays(reminderShownAt, 7);
  return retainUntil > afterReminder ? retainUntil : afterReminder;
}

function removeOwnedRows(db: SqliteDatabase, manuscriptId: string): void {
  const units = `SELECT units.id FROM units
    JOIN layers ON layers.id = units.layer_id
    WHERE layers.manuscript_id = ?`;
  db.prepare(
    `DELETE FROM local_id_map WHERE batch_id IN (
      SELECT reception_batches.id FROM reception_batches
      WHERE unit_id IN (${units})
    )`,
  ).run(manuscriptId);
  db.prepare(`DELETE FROM reception_batches WHERE unit_id IN (${units})`).run(manuscriptId);
  db.prepare(
    `DELETE FROM transcription_acceptances
     WHERE run_id IN (SELECT id FROM model_runs WHERE manuscript_id = ?)
        OR unit_id IN (${units})`,
  ).run(manuscriptId, manuscriptId);
  db.prepare('DELETE FROM model_runs WHERE manuscript_id = ?').run(manuscriptId);
  db.prepare(`DELETE FROM analysis_candidates WHERE unit_id IN (${units})`).run(manuscriptId);
  db.prepare(
    `DELETE FROM token_lexeme_links
     WHERE (target_type = 'token' AND target_id IN (
       SELECT tokens.id FROM tokens WHERE unit_id IN (${units})
     ))
        OR (target_type = 'morpheme' AND target_id IN (
          SELECT morphemes.id FROM morphemes
          JOIN tokens ON tokens.id = morphemes.token_id
          WHERE tokens.unit_id IN (${units})
        ))`,
  ).run(manuscriptId, manuscriptId);
  db.prepare(
    `DELETE FROM custom_field_values
     WHERE (target_type = 'manuscript' AND target_id = ?)
        OR (target_type = 'layer' AND target_id IN (
          SELECT id FROM layers WHERE manuscript_id = ?
        ))
        OR (target_type = 'unit' AND target_id IN (${units}))
        OR (target_type = 'note' AND target_id IN (
          SELECT id FROM notes WHERE manuscript_id = ?
        ))`,
  ).run(manuscriptId, manuscriptId, manuscriptId, manuscriptId);
  db.prepare('DELETE FROM notes WHERE manuscript_id = ?').run(manuscriptId);
  db.prepare(
    `DELETE FROM morphemes WHERE token_id IN (
      SELECT tokens.id FROM tokens WHERE unit_id IN (${units})
    )`,
  ).run(manuscriptId);
  db.prepare(`DELETE FROM tokens WHERE unit_id IN (${units})`).run(manuscriptId);
  db.prepare(`DELETE FROM unit_texts WHERE unit_id IN (${units})`).run(manuscriptId);
  db.prepare(
    `DELETE FROM units WHERE layer_id IN (SELECT id FROM layers WHERE manuscript_id = ?)`,
  ).run(manuscriptId);
  const deleteLeaf = db.prepare(
    `DELETE FROM layers
     WHERE manuscript_id = ?
       AND NOT EXISTS (
         SELECT 1 FROM layers AS child
         WHERE child.parent_id = layers.id AND child.manuscript_id = layers.manuscript_id
       )`,
  );
  for (;;) {
    const before = db
      .prepare('SELECT COUNT(*) AS n FROM layers WHERE manuscript_id = ?')
      .get(manuscriptId) as { n: number };
    deleteLeaf.run(manuscriptId);
    const left = db
      .prepare('SELECT COUNT(*) AS n FROM layers WHERE manuscript_id = ?')
      .get(manuscriptId) as { n: number };
    if (left.n === 0) return;
    if (left.n === before.n) throw new Error('manuscript layers are cyclic');
  }
}

function reminderTable(target: DeletionReminderTarget): 'manuscripts' | 'media' {
  if (target === 'manuscript') return 'manuscripts';
  if (target === 'media') return 'media';
  const unreachable: never = target;
  return unreachable;
}

function readCycle(
  db: SqliteDatabase,
  table: 'manuscripts' | 'media',
  id: string,
):
  | { deletedAt: string | null; retainUntil: string | null; reminderShownAt: string | null }
  | undefined {
  const sql =
    table === 'manuscripts'
      ? `SELECT deleted_at AS deletedAt, retain_until AS retainUntil,
                reminder_shown_at AS reminderShownAt
         FROM manuscripts WHERE id = ?`
      : `SELECT deleted_at AS deletedAt, retain_until AS retainUntil,
                reminder_shown_at AS reminderShownAt
         FROM media WHERE id = ?`;
  return db.prepare(sql).get(id) as
    | { deletedAt: string | null; retainUntil: string | null; reminderShownAt: string | null }
    | undefined;
}

function plusUtcDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}
