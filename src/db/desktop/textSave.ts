import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { resolveUnitTextContext } from './unitTextLayers';

type SqliteDatabase = InstanceType<typeof Database>;

export interface UnitTextDraft {
  unitId: string;
  textLayerId: string;
  rawInput: string;
  baseBody: string;
  provenanceJson: string | null;
  updatedAt: string;
}

export type TextSaveInspection = 'committed' | 'not-submitted' | 'conflict';

/** kind + unit/text-layer identity + payload. Field revisions are not part of this digest yet. */
export function textSaveDigest(unitId: string, textLayerId: string, text: string): string {
  return createHash('sha256').update(`text\n${unitId}\n${textLayerId}\n${text}`).digest('hex');
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
  input: {
    operationId: string;
    digest: string;
    unitId: string;
    textLayerId: string;
    text: string;
  },
): void {
  db.prepare(
    `INSERT INTO text_save_receipts (operation_id, digest, unit_id, layer_id, committed_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(input.operationId, input.digest, input.unitId, input.textLayerId, new Date().toISOString());
  db.prepare(
    'DELETE FROM unit_text_drafts WHERE unit_id = ? AND layer_id = ? AND raw_input = ?',
  ).run(input.unitId, input.textLayerId, input.text);
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
  input: {
    unitId: string;
    textLayerId?: string;
    rawInput: string;
    baseBody: string;
    provenanceJson?: string | null;
  },
): UnitTextDraft | null {
  const context = resolveUnitTextContext(db, input.unitId, input.textLayerId);
  const write = db.transaction(() => {
    if (input.rawInput === input.baseBody) {
      db.prepare('DELETE FROM unit_text_drafts WHERE unit_id = ? AND layer_id = ?').run(
        input.unitId,
        context.textLayerId,
      );
      return null;
    }
    const updatedAt = new Date().toISOString();
    db.prepare(
      `INSERT INTO unit_text_drafts (
         unit_id, layer_id, raw_input, base_body, provenance_json, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(unit_id, layer_id) DO UPDATE SET
         raw_input = excluded.raw_input,
         base_body = excluded.base_body,
         updated_at = excluded.updated_at,
         provenance_json = CASE
           WHEN excluded.provenance_json IS NOT NULL THEN excluded.provenance_json
           WHEN excluded.raw_input = unit_text_drafts.raw_input
             THEN unit_text_drafts.provenance_json
           ELSE NULL
         END`,
    ).run(
      input.unitId,
      context.textLayerId,
      input.rawInput,
      input.baseBody,
      input.provenanceJson ?? null,
      updatedAt,
    );
    return readUnitTextDraft(db, input.unitId, context.textLayerId);
  });
  return write();
}

export function readUnitTextDraft(
  db: SqliteDatabase,
  unitId: string,
  textLayerId?: string,
): UnitTextDraft | null {
  const context = resolveUnitTextContext(db, unitId, textLayerId);
  const row = db
    .prepare(
      `SELECT unit_id, layer_id, raw_input, base_body, provenance_json, updated_at
       FROM unit_text_drafts WHERE unit_id = ? AND layer_id = ?`,
    )
    .get(unitId, context.textLayerId) as
    | {
        unit_id: string;
        layer_id: string;
        raw_input: string;
        base_body: string;
        provenance_json: string | null;
        updated_at: string;
      }
    | undefined;
  if (row === undefined) return null;
  return {
    unitId: row.unit_id,
    textLayerId: row.layer_id,
    rawInput: row.raw_input,
    baseBody: row.base_body,
    provenanceJson: row.provenance_json,
    updatedAt: row.updated_at,
  };
}

export function discardUnitTextDraft(
  db: SqliteDatabase,
  unitId: string,
  textLayerId?: string,
): void {
  const context = resolveUnitTextContext(db, unitId, textLayerId);
  db.prepare('DELETE FROM unit_text_drafts WHERE unit_id = ? AND layer_id = ?').run(
    unitId,
    context.textLayerId,
  );
}
