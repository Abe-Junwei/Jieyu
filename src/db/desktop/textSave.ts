import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';

type SqliteDatabase = InstanceType<typeof Database>;

export interface UnitTextDraft {
  unitId: string;
  rawInput: string;
  baseBody: string;
  updatedAt: string;
}

export type TextSaveInspection = 'committed' | 'not-submitted' | 'conflict';

/** kind + unit id + payload. Field revisions are not part of this digest yet. */
export function textSaveDigest(unitId: string, text: string): string {
  return createHash('sha256').update(`text\n${unitId}\n${text}`).digest('hex');
}

/** Call inside the text-save transaction. A matching receipt is a replay; a different digest conflicts. */
export function claimTextSave(
  db: SqliteDatabase,
  operationId: string,
  digest: string,
): 'fresh' | 'replay' {
  const row = db
    .prepare('SELECT digest FROM text_save_receipts WHERE operation_id = ?')
    .get(operationId) as { digest: string } | undefined;
  if (row === undefined) return 'fresh';
  if (row.digest !== digest) throw new Error('operation id conflict');
  return 'replay';
}

/** Call inside the same transaction as the text write. Drops a draft only when it is the text just saved. */
export function finishTextSave(
  db: SqliteDatabase,
  input: { operationId: string; digest: string; unitId: string; text: string },
): void {
  db.prepare(
    `INSERT INTO text_save_receipts (operation_id, digest, unit_id, committed_at)
     VALUES (?, ?, ?, ?)`,
  ).run(input.operationId, input.digest, input.unitId, new Date().toISOString());
  db.prepare('DELETE FROM unit_text_drafts WHERE unit_id = ? AND raw_input = ?').run(
    input.unitId,
    input.text,
  );
}

export function inspectUnitTextSave(
  db: SqliteDatabase,
  operationId: string,
  digest: string,
): TextSaveInspection {
  const row = db
    .prepare('SELECT digest FROM text_save_receipts WHERE operation_id = ?')
    .get(operationId) as { digest: string } | undefined;
  if (row === undefined) return 'not-submitted';
  return row.digest === digest ? 'committed' : 'conflict';
}

export function putUnitTextDraft(
  db: SqliteDatabase,
  input: { unitId: string; rawInput: string; baseBody: string },
): UnitTextDraft | null {
  const write = db.transaction(() => {
    const unit = db.prepare('SELECT id FROM units WHERE id = ?').get(input.unitId) as
      { id: string } | undefined;
    if (unit === undefined) throw new Error('unit is missing');
    if (input.rawInput === input.baseBody) {
      db.prepare('DELETE FROM unit_text_drafts WHERE unit_id = ?').run(input.unitId);
      return null;
    }
    const updatedAt = new Date().toISOString();
    db.prepare(
      `INSERT INTO unit_text_drafts (unit_id, raw_input, base_body, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(unit_id) DO UPDATE SET
         raw_input = excluded.raw_input,
         base_body = excluded.base_body,
         updated_at = excluded.updated_at`,
    ).run(input.unitId, input.rawInput, input.baseBody, updatedAt);
    return readUnitTextDraft(db, input.unitId);
  });
  return write();
}

export function readUnitTextDraft(db: SqliteDatabase, unitId: string): UnitTextDraft | null {
  const row = db
    .prepare(
      'SELECT unit_id, raw_input, base_body, updated_at FROM unit_text_drafts WHERE unit_id = ?',
    )
    .get(unitId) as
    { unit_id: string; raw_input: string; base_body: string; updated_at: string } | undefined;
  if (row === undefined) return null;
  return {
    unitId: row.unit_id,
    rawInput: row.raw_input,
    baseBody: row.base_body,
    updatedAt: row.updated_at,
  };
}

export function discardUnitTextDraft(db: SqliteDatabase, unitId: string): void {
  db.prepare('DELETE FROM unit_text_drafts WHERE unit_id = ?').run(unitId);
}
