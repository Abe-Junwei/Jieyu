import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { resolveUnitTextContext } from './unitTextLayers';
import { readStoredUnit, type Unit } from './units';

type SqliteDatabase = InstanceType<typeof Database>;
type TextRow = {
  id: string;
  body: string;
  self_certainty: string | null;
  provenance_json: string | null;
  updated_at: string;
};
type DraftRow = {
  raw_input: string;
  base_body: string;
  provenance_json: string | null;
  updated_at: string;
};
type Cell = { unitId: string; text: TextRow | null; draft: DraftRow | null };
export interface TextClearUndo {
  manuscriptId: string;
  textLayerId: string;
  before: Cell[];
  after: string;
}

function cells(db: SqliteDatabase, unitIds: readonly string[], textLayerId: string): Cell[] {
  if (unitIds.length === 0 || new Set(unitIds).size !== unitIds.length)
    throw new Error('invalid clear selection');
  let manuscriptId: string | undefined;
  return unitIds.map((unitId) => {
    const context = resolveUnitTextContext(db, unitId, textLayerId);
    const layer = db
      .prepare('SELECT tier_type, modality FROM layers WHERE id = ?')
      .get(textLayerId) as { tier_type: string; modality: string };
    if (
      (context.role !== 'transcription' && context.role !== 'translation') ||
      context.unitLayerId === textLayerId ||
      layer.tier_type !== 'symbolic-association' ||
      layer.modality !== 'text'
    ) {
      throw new Error('layer cannot clear shared text');
    }
    if (manuscriptId !== undefined && manuscriptId !== context.manuscriptId)
      throw new Error('units are not in the same manuscript');
    manuscriptId = context.manuscriptId;
    return {
      unitId,
      text:
        (db
          .prepare(
            `SELECT id, body, self_certainty, provenance_json, updated_at
             FROM unit_texts WHERE unit_id = ? AND layer_id = ? AND role = ?`,
          )
          .get(unitId, textLayerId, context.role) as TextRow | undefined) ?? null,
      draft:
        (db
          .prepare(
            'SELECT raw_input, base_body, provenance_json, updated_at FROM unit_text_drafts WHERE unit_id = ? AND layer_id = ?',
          )
          .get(unitId, textLayerId) as DraftRow | undefined) ?? null,
    };
  });
}

function digest(rows: Cell[]): string {
  // Undoing a later edit restores content with a fresh timestamp.
  const state = rows.map(({ unitId, text, draft }) => ({
    unitId,
    text:
      text === null
        ? null
        : {
            id: text.id,
            body: text.body,
            self_certainty: text.self_certainty,
            provenance_json: text.provenance_json,
          },
    draft:
      draft === null
        ? null
        : {
            raw_input: draft.raw_input,
            base_body: draft.base_body,
            provenance_json: draft.provenance_json,
          },
  }));
  return createHash('sha256').update(JSON.stringify(state)).digest('hex');
}

export function textClearPreview(
  db: SqliteDatabase,
  unitIds: readonly string[],
  textLayerId: string,
) {
  return db.transaction(() => {
    const rows = cells(db, unitIds, textLayerId);
    return {
      linkedTexts: 0,
      tokens: 0,
      morphemes: 0,
      notes: 0,
      lexemeLinks: 0,
      analysisCandidates: 0,
      customFieldValues: 0,
      receptionRecords: 0,
      drafts: rows.filter((row) => row.draft !== null).length,
      fingerprint: digest(rows),
    };
  })();
}

export function clearUnitTexts(
  db: SqliteDatabase,
  unitIds: readonly string[],
  textLayerId: string,
  expected: string,
): TextClearUndo {
  return db.transaction(() => {
    const before = cells(db, unitIds, textLayerId);
    if (digest(before) !== expected) throw new Error('text clear preview is stale');
    for (const row of before) {
      // Keep the text identity: recordings and notes still refer to this row.
      if (row.text !== null)
        db.prepare(
          `UPDATE unit_texts
           SET body = '', self_certainty = NULL, provenance_json = NULL, updated_at = ?
           WHERE id = ?`,
        ).run(new Date().toISOString(), row.text.id);
      db.prepare('DELETE FROM unit_text_drafts WHERE unit_id = ? AND layer_id = ?').run(
        row.unitId,
        textLayerId,
      );
    }
    const manuscriptId = resolveUnitTextContext(db, unitIds[0]!, textLayerId).manuscriptId;
    db.prepare(
      'UPDATE manuscripts SET generation = generation + 1, updated_at = ? WHERE id = ?',
    ).run(new Date().toISOString(), manuscriptId);
    return {
      manuscriptId: resolveUnitTextContext(db, unitIds[0]!, textLayerId).manuscriptId,
      textLayerId,
      before,
      after: digest(cells(db, unitIds, textLayerId)),
    };
  })();
}

export function undoTextClear(db: SqliteDatabase, undo: TextClearUndo): Unit[] {
  return db.transaction(() => {
    if (
      digest(
        cells(
          db,
          undo.before.map((row) => row.unitId),
          undo.textLayerId,
        ),
      ) !== undo.after
    )
      throw new Error('text clear undo is stale');
    for (const row of undo.before) {
      if (row.text !== null)
        db.prepare(
          `UPDATE unit_texts
           SET body = ?, self_certainty = ?, provenance_json = ?, updated_at = ?
           WHERE id = ?`,
        ).run(
          row.text.body,
          row.text.self_certainty,
          row.text.provenance_json,
          row.text.updated_at,
          row.text.id,
        );
      if (row.draft !== null)
        db.prepare(
          `INSERT INTO unit_text_drafts (unit_id, layer_id, raw_input, base_body, provenance_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(
          row.unitId,
          undo.textLayerId,
          row.draft.raw_input,
          row.draft.base_body,
          row.draft.provenance_json,
          row.draft.updated_at,
        );
    }
    db.prepare(
      'UPDATE manuscripts SET generation = generation + 1, updated_at = ? WHERE id = ?',
    ).run(new Date().toISOString(), undo.manuscriptId);
    return undo.before.map((row) => readStoredUnit(db, row.unitId, undo.textLayerId)!);
  })();
}

export function redoTextClear(db: SqliteDatabase, undo: TextClearUndo): TextClearUndo {
  return clearUnitTexts(
    db,
    undo.before.map((row) => row.unitId),
    undo.textLayerId,
    digest(undo.before),
  );
}
