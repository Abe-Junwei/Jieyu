import { checkFormalCuts, type FormalCut } from './unitSplitTextPlan';
import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  clearAnalysisProjection,
  detachAnalysisAssociations,
  insertReviewSnapshot,
  nodeIdsOf,
  readAnalysisMaterial,
} from './analysisCandidates';
import { missingFields } from './customFields';
import { textAudioCount } from './unitTextAudios';
import { assertUnitTextRoleFree, readStoredUnit, type Unit } from './units';
import {
  deleteUnitTree,
  insertRemovedUnit,
  readRemovedUnit,
  shiftSortOrders,
  type RemovedUnit,
} from './unitSpan';

type SqliteDatabase = InstanceType<typeof Database>;

const MIN_SPLIT_MS = 10;

export interface UnitSplitPreset {
  oldId: string;
  leftId: string;
  rightId: string;
}

export interface UnitSplitUndo {
  operationId: string;
  manuscriptId: string;
  manuscriptGeneration: number;
  rootId: string;
  leftId: string;
  rightId: string;
  time: number;
  formalCuts?: FormalCut[];
  textLayerId: string;
  cutIndex: number;
  rawInput: string;
  presets: UnitSplitPreset[];
  removed: RemovedUnit[];
  reparents: { id: string; parentId: string }[];
  createdIds: string[];
  fingerprint: string;
  textDrafts: TextDraftRow[];
  saveReceipts: SaveReceiptRow[];
}

interface TextDraftRow {
  unit_id: string;
  layer_id: string;
  raw_input: string;
  base_body: string;
  provenance_json: string | null;
  updated_at: string;
}

interface SaveReceiptRow {
  operation_id: string;
  digest: string;
  unit_id: string;
  layer_id: string;
  committed_at: string;
}

interface LiveUnit {
  id: string;
  layer_id: string;
  speaker_id: string | null;
  parent_unit_id: string | null;
  start_ms: number | null;
  end_ms: number | null;
  confidence: number | null;
  skip_processing: number;
  sort_order: number;
  created_at: string;
  analysis_graph_json: string | null;
  analysis_generation: number;
  graph_fingerprint: string;
}

interface TextRow {
  id: string;
  layer_id: string;
  role: string;
  body: string;
  self_certainty: string | null;
  provenance_json: string | null;
}

export interface UnitSplitInput {
  baseline?: string;
  formalCuts?: FormalCut[];
  unitId: string;
  time: number;
  operationId?: string;
  textLayerId?: string;
  cutIndex?: number;
  rawInput?: string;
  leftId?: string;
  rightId?: string;
  presets?: UnitSplitPreset[];
}

interface SplitAccum {
  operationId: string;
  time: number;
  removed: RemovedUnit[];
  reparents: { id: string; parentId: string }[];
  createdIds: string[];
  presets: UnitSplitPreset[];
  requested: UnitSplitPreset[];
  textDrafts: TextDraftRow[];
  saveReceipts: SaveReceiptRow[];
  formalCuts?: FormalCut[];
}

export function splitUnit(
  db: SqliteDatabase,
  input: UnitSplitInput,
  afterWrite?: () => void,
): { left: Unit; right: Unit; undo: UnitSplitUndo } {
  if (!Number.isInteger(input.time)) throw new Error('split point is outside the unit');
  const write = db.transaction(() => {
    const root = liveUnit(db, input.unitId);
    const sharedOrthography = db
      .prepare(
        `SELECT 1 FROM layer_links JOIN layers ON layers.id = layer_links.layer_id
      WHERE host_layer_id = ? AND layers.deleted_at IS NULL AND layers.content_type = 'transcription'
      AND layers.tier_type = 'symbolic-association' AND layers.modality = 'text' LIMIT 1`,
      )
      .get(root.layer_id);
    if (sharedOrthography !== undefined && input.formalCuts === undefined) {
      throw new Error('shared split requires confirmation');
    }
    if (root.start_ms === null || root.end_ms === null) {
      throw new Error('split point is outside the unit');
    }
    assertMargins(root.start_ms, root.end_ms, input.time);
    assertDescendants(db, root.id, input.time);
    const textLayerId = input.textLayerId ?? root.layer_id;
    const formal =
      input.formalCuts === undefined
        ? undefined
        : checkFormalCuts(db, root.id, input.baseline ?? '', input.formalCuts);
    const source =
      formal === undefined
        ? sourceText(db, root.id, textLayerId, input.rawInput)
        : (formal.layers.find((row) => row.layerId === textLayerId)?.body ?? '');
    const formalIndex = input.formalCuts?.find((row) => row.layerId === textLayerId)?.cutIndex;
    const cutIndex = formalIndex ?? input.cutIndex ?? source.length;
    if (cutIndex < 0 || cutIndex > source.length)
      throw new Error('split text point is outside the text');
    const place = manuscriptOf(db, root.id);
    const operationId = input.operationId ?? randomUUID();
    const requested = [...(input.presets ?? [])];
    if (
      input.leftId !== undefined &&
      input.rightId !== undefined &&
      !requested.some((row) => row.oldId === root.id)
    ) {
      requested.unshift({ oldId: root.id, leftId: input.leftId, rightId: input.rightId });
    }
    const accum: SplitAccum = {
      operationId,
      time: input.time,
      removed: [],
      reparents: [],
      createdIds: [],
      presets: [],
      requested,
      ...(input.formalCuts === undefined ? {} : { formalCuts: input.formalCuts }),
      textDrafts: [],
      saveReceipts: [],
    };
    const split = splitOne(db, accum, root, {
      textLayerId,
      cutIndex,
      source,
      ...(formal === undefined ? {} : { consumeTextDraft: false }),
      parentLeft: root.parent_unit_id,
      parentRight: root.parent_unit_id,
    });
    const now = new Date().toISOString();
    bumpGeneration(db, place.manuscriptId, now);
    afterWrite?.();
    const left = readStoredUnit(db, split.leftId);
    const right = readStoredUnit(db, split.rightId);
    const generation = generationOf(db, place.manuscriptId);
    if (
      !left ||
      !right ||
      readStoredUnit(db, root.id) !== null ||
      left.startMs !== root.start_ms ||
      left.endMs !== input.time ||
      right.startMs !== input.time ||
      right.endMs !== root.end_ms ||
      generation !== place.generation + 1
    ) {
      throw new Error('unit split readback failed');
    }
    return {
      left,
      right,
      undo: {
        operationId,
        manuscriptId: place.manuscriptId,
        manuscriptGeneration: generation,
        rootId: root.id,
        leftId: split.leftId,
        rightId: split.rightId,
        time: input.time,
        ...(input.formalCuts === undefined ? {} : { formalCuts: input.formalCuts }),
        textLayerId,
        cutIndex,
        rawInput: source,
        presets: accum.presets,
        removed: accum.removed,
        reparents: accum.reparents,
        createdIds: accum.createdIds,
        fingerprint: fingerprintOf(db, accum.createdIds),
        textDrafts: accum.textDrafts,
        saveReceipts: accum.saveReceipts,
      },
    };
  });
  return write();
}

export function undoSplit(db: SqliteDatabase, undo: UnitSplitUndo, afterWrite?: () => void): Unit {
  const write = db.transaction(() => {
    if (!splitStillAfter(db, undo)) throw new Error('unit split undo is stale');
    const now = new Date().toISOString();
    for (const id of undo.createdIds) parkUnit(db, id);
    for (const removed of undo.removed) insertUnitRow(db, removed);
    for (const row of undo.reparents) {
      db.prepare('UPDATE units SET parent_unit_id = ? WHERE id = ?').run(row.parentId, row.id);
    }
    for (const id of [...undo.createdIds].reverse()) deleteUnitTree(db, id);
    for (const removed of undo.removed) insertRemovedContents(db, removed);
    for (const removed of [...undo.removed].sort((a, b) => b.unit.sort_order - a.unit.sort_order)) {
      shiftSortOrders(db, removed.unit.layer_id, removed.unit.sort_order, 'down', [], 'gt');
    }
    restoreDrafts(db, undo);
    db.prepare('DELETE FROM unit_span_maps WHERE operation_id = ?').run(undo.operationId);
    bumpGeneration(db, undo.manuscriptId, now);
    afterWrite?.();
    const unit = readStoredUnit(db, undo.rootId);
    if (!unit || unit.startMs === null || unit.endMs === null) {
      throw new Error('unit split undo readback failed');
    }
    for (const id of undo.createdIds) {
      if (readStoredUnit(db, id) !== null) throw new Error('unit split undo readback failed');
    }
    return unit;
  });
  return write();
}

function splitOne(
  db: SqliteDatabase,
  accum: SplitAccum,
  unit: LiveUnit,
  cut: {
    textLayerId: string;
    cutIndex: number;
    source: string;
    parentLeft: string | null;
    parentRight: string | null;
    consumeTextDraft?: boolean;
  },
): { leftId: string; rightId: string } {
  if (unit.start_ms === null || unit.end_ms === null) {
    throw new Error('split point is outside the unit');
  }
  assertTimeDrafts(db, unit.id, unit.start_ms, unit.end_ms);
  const preset = presetFor(accum.requested, unit.id);
  accum.removed.push(readRemovedUnit(db, unit.id));
  accum.textDrafts.push(...textDraftsOf(db, unit.id));
  accum.saveReceipts.push(...receiptsOf(db, unit.id));
  const texts = textsOf(db, unit.id);
  const transcription = texts.find(
    (row) => row.layer_id === unit.layer_id && row.role === 'transcription',
  );
  const ownLayer = cut.textLayerId === unit.layer_id;
  const ownCut = accum.formalCuts?.find((row) => row.layerId === unit.layer_id);
  const ownBody = transcription?.body ?? '';
  const leftBody = ownCut
    ? ownBody.slice(0, ownCut.cutIndex)
    : ownLayer
      ? cut.source.slice(0, cut.cutIndex)
      : ownBody;
  const rightBody = ownCut
    ? ownBody.slice(ownCut.cutIndex)
    : ownLayer
      ? cut.source.slice(cut.cutIndex)
      : '';
  const graphText = readGraphText(unit.analysis_graph_json);
  const keepGraph = graphText !== null && leftBody === graphText && rightBody === '';
  const material = capturedMaterial(db, unit.id, keepGraph, graphText);
  const children = db
    .prepare(`SELECT id FROM units WHERE parent_unit_id = ? ORDER BY start_ms, id`)
    .all(unit.id) as { id: string }[];
  const { leftId, rightId } = preset;
  accum.presets.push(preset);
  accum.createdIds.push(leftId, rightId);
  const now = new Date().toISOString();
  const parked = 1_000_000 + unit.sort_order;
  db.prepare(
    'UPDATE units SET start_ms = NULL, end_ms = NULL, sort_order = ?, updated_at = ? WHERE id = ?',
  ).run(parked, now, unit.id);
  shiftSortOrders(db, unit.layer_id, unit.sort_order, 'up', [unit.id], 'gt');
  insertHalf(db, {
    id: leftId,
    unit,
    parentId: cut.parentLeft,
    startMs: unit.start_ms,
    endMs: accum.time,
    sortOrder: unit.sort_order,
    keepGraph,
    now,
  });
  insertHalf(db, {
    id: rightId,
    unit,
    parentId: cut.parentRight,
    startMs: accum.time,
    endMs: unit.end_ms,
    sortOrder: unit.sort_order + 1,
    keepGraph: false,
    now,
  });
  writeMaps(db, accum.operationId, unit.id, leftId, rightId, now);
  if (accum.formalCuts !== undefined && accum.removed.length === 1) {
    for (const row of texts) {
      const index =
        accum.formalCuts.find((item) => item.layerId === row.layer_id)?.cutIndex ?? row.body.length;
      moveTexts(
        db,
        leftId,
        rightId,
        [row],
        { textLayerId: row.layer_id, cutIndex: index, source: row.body },
        now,
      );
    }
  } else moveTexts(db, leftId, rightId, texts, cut, now);
  moveDrafts(
    db,
    unit.id,
    leftId,
    rightId,
    cut.textLayerId,
    unit.start_ms,
    unit.end_ms,
    cut.consumeTextDraft !== false,
  );
  db.prepare('UPDATE text_save_receipts SET unit_id = ? WHERE unit_id = ?').run(leftId, unit.id);
  if (!keepGraph && unit.analysis_graph_json !== null) {
    if (material?.graph) insertReviewSnapshot(db, { ...material, unitId: leftId });
    const targets = analysisTargets(db, unit.id, material?.graph ?? null, unit.analysis_graph_json);
    detachAnalysisAssociations(db, unit.id, targets, now);
    clearAnalysisProjection(db, unit.id);
  }
  db.prepare(
    `UPDATE notes SET unit_id = (
       SELECT unit_texts.unit_id FROM unit_texts WHERE unit_texts.id = notes.unit_text_id
     )
     WHERE anchor_kind = 'unit_text' AND unit_id = ?`,
  ).run(unit.id);
  db.prepare('UPDATE notes SET unit_id = ? WHERE unit_id = ?').run(leftId, unit.id);
  if (keepGraph) {
    db.prepare('UPDATE tokens SET unit_id = ? WHERE unit_id = ?').run(leftId, unit.id);
  }
  db.prepare(`UPDATE analysis_candidates SET unit_id = ? WHERE unit_id = ?`).run(leftId, unit.id);
  db.prepare(
    `UPDATE analysis_candidates
     SET status = 'rejected', updated_at = ?
     WHERE unit_id = ? AND kind = 'suggestion' AND status = 'pending'`,
  ).run(now, leftId);
  db.prepare('UPDATE reception_batches SET unit_id = ? WHERE unit_id = ?').run(leftId, unit.id);
  db.prepare('UPDATE transcription_acceptances SET unit_id = ? WHERE unit_id = ?').run(
    leftId,
    unit.id,
  );
  copyUnitFields(db, unit.id, leftId, rightId);
  for (const child of children) {
    const row = liveUnit(db, child.id);
    if (row.start_ms === null || row.end_ms === null)
      throw new Error('unit has an untimed descendant');
    if (row.end_ms <= accum.time) {
      accum.reparents.push({ id: row.id, parentId: unit.id });
      db.prepare('UPDATE units SET parent_unit_id = ? WHERE id = ?').run(leftId, row.id);
    } else if (row.start_ms >= accum.time) {
      accum.reparents.push({ id: row.id, parentId: unit.id });
      db.prepare('UPDATE units SET parent_unit_id = ? WHERE id = ?').run(rightId, row.id);
    } else {
      const childTexts = textsOf(db, row.id);
      const childBody = childTexts.find((item) => item.layer_id === row.layer_id)?.body ?? '';
      splitOne(db, accum, row, {
        textLayerId: row.layer_id,
        cutIndex: childBody.length,
        source: childBody,
        parentLeft: leftId,
        parentRight: rightId,
        consumeTextDraft: false,
      });
    }
  }
  db.prepare('DELETE FROM units WHERE id = ?').run(unit.id);
  return { leftId, rightId };
}

function insertHalf(
  db: SqliteDatabase,
  input: {
    id: string;
    unit: LiveUnit;
    parentId: string | null;
    startMs: number;
    endMs: number;
    sortOrder: number;
    keepGraph: boolean;
    now: string;
  },
): void {
  db.prepare(
    `INSERT INTO units (
      id, layer_id, speaker_id, parent_unit_id, start_ms, end_ms, confidence, skip_processing,
      sort_order, created_at, updated_at, analysis_graph_json, analysis_generation,
      graph_fingerprint
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.unit.layer_id,
    input.unit.speaker_id,
    input.parentId,
    input.startMs,
    input.endMs,
    input.unit.skip_processing,
    input.sortOrder,
    input.now,
    input.now,
    input.keepGraph ? input.unit.analysis_graph_json : null,
    input.keepGraph ? input.unit.analysis_generation : 0,
    input.keepGraph ? input.unit.graph_fingerprint : '',
  );
}

function moveTexts(
  db: SqliteDatabase,
  leftId: string,
  rightId: string,
  texts: TextRow[],
  cut: { textLayerId: string; cutIndex: number; source: string },
  now: string,
): void {
  let sawCut = false;
  for (const row of texts) {
    if (row.layer_id !== cut.textLayerId) {
      db.prepare('UPDATE unit_texts SET unit_id = ? WHERE id = ?').run(leftId, row.id);
      continue;
    }
    sawCut = true;
    const leftBody = cut.source.slice(0, cut.cutIndex);
    const rightBody = cut.source.slice(cut.cutIndex);
    const inherit = row.self_certainty;
    if (leftBody === '' && rightBody !== '') {
      if (textAudioCount(db, row.id) > 0) {
        const carrierId = randomUUID();
        db.prepare(
          `INSERT INTO unit_texts (id, unit_id, layer_id, role, body, self_certainty, updated_at)
           VALUES (?, ?, ?, ?, '', NULL, ?)`,
        ).run(carrierId, leftId, row.layer_id, row.role, now);
        db.prepare('UPDATE unit_text_audios SET unit_text_id = ? WHERE unit_text_id = ?').run(
          carrierId,
          row.id,
        );
      }
      db.prepare(
        `UPDATE unit_texts
         SET unit_id = ?, body = ?, self_certainty = ?, updated_at = ?
         WHERE id = ?`,
      ).run(rightId, rightBody, inherit, now, row.id);
      continue;
    }
    if (rightBody === '') {
      db.prepare(
        `UPDATE unit_texts
         SET unit_id = ?, body = ?, self_certainty = ?, provenance_json = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        leftId,
        leftBody,
        leftBody === '' ? null : inherit,
        leftBody === row.body ? row.provenance_json : null,
        now,
        row.id,
      );
      continue;
    }
    db.prepare(
      `UPDATE unit_texts
       SET unit_id = ?, body = ?, self_certainty = ?, provenance_json = NULL, updated_at = ?
       WHERE id = ?`,
    ).run(leftId, leftBody, inherit, now, row.id);
    assertUnitTextRoleFree(db, rightId, row.role, row.layer_id);
    db.prepare(
      `INSERT INTO unit_texts (id, unit_id, layer_id, role, body, self_certainty, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(randomUUID(), rightId, row.layer_id, row.role, rightBody, inherit, now);
  }
  if (sawCut) return;
  const leftBody = cut.source.slice(0, cut.cutIndex);
  const rightBody = cut.source.slice(cut.cutIndex);
  const role = layerRole(db, cut.textLayerId);
  if (leftBody !== '') insertText(db, leftId, cut.textLayerId, role, leftBody, now);
  if (rightBody !== '') insertText(db, rightId, cut.textLayerId, role, rightBody, now);
}

function moveDrafts(
  db: SqliteDatabase,
  oldId: string,
  leftId: string,
  rightId: string,
  textLayerId: string,
  startMs: number,
  endMs: number,
  consumeTextDraft: boolean,
): void {
  if (consumeTextDraft) {
    db.prepare('DELETE FROM unit_text_drafts WHERE unit_id = ? AND layer_id = ?').run(
      oldId,
      textLayerId,
    );
  }
  db.prepare('UPDATE unit_text_drafts SET unit_id = ? WHERE unit_id = ?').run(leftId, oldId);
  const drafts = db
    .prepare('SELECT edge, base_ms FROM unit_time_drafts WHERE unit_id = ?')
    .all(oldId) as { edge: string; base_ms: number }[];
  for (const draft of drafts) {
    const target = draft.edge === 'start' ? leftId : rightId;
    db.prepare('UPDATE unit_time_drafts SET unit_id = ? WHERE unit_id = ? AND edge = ?').run(
      target,
      oldId,
      draft.edge,
    );
    if (draft.edge === 'start' && draft.base_ms !== startMs) {
      throw new Error('time draft conflicts');
    }
    if (draft.edge === 'end' && draft.base_ms !== endMs) throw new Error('time draft conflicts');
  }
}

function copyUnitFields(db: SqliteDatabase, oldId: string, leftId: string, rightId: string): void {
  const rows = db
    .prepare(
      `SELECT definition_id, value_json, updated_at
       FROM custom_field_values WHERE target_type = 'unit' AND target_id = ?`,
    )
    .all(oldId) as { definition_id: string; value_json: string; updated_at: string }[];
  const insert = db.prepare(
    `INSERT INTO custom_field_values (definition_id, target_type, target_id, value_json, updated_at)
     VALUES (?, 'unit', ?, ?, ?)`,
  );
  for (const row of rows) {
    insert.run(row.definition_id, leftId, row.value_json, row.updated_at);
    insert.run(row.definition_id, rightId, row.value_json, row.updated_at);
  }
  db.prepare(`DELETE FROM custom_field_values WHERE target_type = 'unit' AND target_id = ?`).run(
    oldId,
  );
  if (
    missingFields(db, 'unit', leftId).length > 0 ||
    missingFields(db, 'unit', rightId).length > 0
  ) {
    throw new Error('unit is missing a required field');
  }
}

function sourceText(
  db: SqliteDatabase,
  unitId: string,
  layerId: string,
  rawInput: string | undefined,
): string {
  const stored = db
    .prepare('SELECT body FROM unit_texts WHERE unit_id = ? AND layer_id = ?')
    .get(unitId, layerId) as { body: string } | undefined;
  const body = stored?.body ?? '';
  const draft = db
    .prepare(`SELECT raw_input, base_body FROM unit_text_drafts WHERE unit_id = ? AND layer_id = ?`)
    .get(unitId, layerId) as { raw_input: string; base_body: string } | undefined;
  if (draft && draft.base_body !== body) throw new Error('text draft conflicts');
  const expected = draft?.raw_input ?? body;
  if (rawInput !== undefined && rawInput !== expected) throw new Error('split base changed');
  return rawInput ?? expected;
}

function assertTimeDrafts(
  db: SqliteDatabase,
  unitId: string,
  startMs: number,
  endMs: number,
): void {
  const rows = db
    .prepare('SELECT edge, base_ms FROM unit_time_drafts WHERE unit_id = ?')
    .all(unitId) as { edge: string; base_ms: number }[];
  for (const row of rows) {
    if (row.edge === 'start' && row.base_ms !== startMs) throw new Error('time draft conflicts');
    if (row.edge === 'end' && row.base_ms !== endMs) throw new Error('time draft conflicts');
  }
}

function assertDescendants(db: SqliteDatabase, unitId: string, time: number): void {
  const rows = db
    .prepare(
      `WITH RECURSIVE kids AS (
         SELECT id, start_ms, end_ms FROM units WHERE parent_unit_id = ?
         UNION ALL
         SELECT units.id, units.start_ms, units.end_ms
         FROM units JOIN kids ON units.parent_unit_id = kids.id
       )
       SELECT start_ms, end_ms FROM kids`,
    )
    .all(unitId) as { start_ms: number | null; end_ms: number | null }[];
  for (const row of rows) {
    if (row.start_ms === null || row.end_ms === null) {
      throw new Error('unit has an untimed descendant');
    }
    if (row.start_ms < time && row.end_ms > time) assertMargins(row.start_ms, row.end_ms, time);
  }
}

function assertMargins(startMs: number, endMs: number, time: number): void {
  if (time - startMs < MIN_SPLIT_MS || endMs - time < MIN_SPLIT_MS) {
    throw new Error('split point is outside the unit');
  }
}

function presetFor(requested: readonly UnitSplitPreset[], oldId: string): UnitSplitPreset {
  return (
    requested.find((row) => row.oldId === oldId) ?? {
      oldId,
      leftId: randomUUID(),
      rightId: randomUUID(),
    }
  );
}

function writeMaps(
  db: SqliteDatabase,
  operationId: string,
  oldId: string,
  leftId: string,
  rightId: string,
  now: string,
): void {
  const insert = db.prepare(
    `INSERT INTO unit_span_maps (operation_id, kind, old_id, new_id, created_at)
     VALUES (?, 'split', ?, ?, ?)`,
  );
  insert.run(operationId, oldId, leftId, now);
  insert.run(operationId, oldId, rightId, now);
}

function splitStillAfter(db: SqliteDatabase, undo: UnitSplitUndo): boolean {
  return (
    generationOf(db, undo.manuscriptId) === undo.manuscriptGeneration &&
    fingerprintOf(db, undo.createdIds) === undo.fingerprint
  );
}

function fingerprintOf(db: SqliteDatabase, ids: readonly string[]): string {
  const parts = [...ids].sort().map((id) => ({
    id,
    unit: db
      .prepare(
        `SELECT start_ms, end_ms, speaker_id, skip_processing
         FROM units WHERE id = ?`,
      )
      .get(id),
    texts: db
      .prepare(
        `SELECT layer_id, body, self_certainty FROM unit_texts WHERE unit_id = ? ORDER BY layer_id`,
      )
      .all(id),
    notes: db
      .prepare('SELECT id, attachment, unit_text_id FROM notes WHERE unit_id = ? ORDER BY id')
      .all(id),
    tokens: db.prepare('SELECT id FROM tokens WHERE unit_id = ? ORDER BY id').all(id),
    drafts: db
      .prepare(
        'SELECT layer_id, raw_input FROM unit_text_drafts WHERE unit_id = ? ORDER BY layer_id',
      )
      .all(id),
    times: db
      .prepare(
        'SELECT edge, raw_input, base_ms FROM unit_time_drafts WHERE unit_id = ? ORDER BY edge',
      )
      .all(id),
    children: db.prepare('SELECT id FROM units WHERE parent_unit_id = ? ORDER BY id').all(id),
    candidates: db
      .prepare('SELECT id, kind, status FROM analysis_candidates WHERE unit_id = ? ORDER BY id')
      .all(id),
    fields: db
      .prepare(
        `SELECT definition_id, value_json FROM custom_field_values
         WHERE target_type = 'unit' AND target_id = ? ORDER BY definition_id`,
      )
      .all(id),
    clips: db
      .prepare(
        `SELECT unit_text_audios.id AS id, unit_text_audios.unit_text_id AS textId,
                unit_text_audios.file_id AS fileId, unit_text_audios.position AS position
         FROM unit_text_audios
         JOIN unit_texts ON unit_texts.id = unit_text_audios.unit_text_id
         WHERE unit_texts.unit_id = ?
         ORDER BY unit_text_audios.position, unit_text_audios.id`,
      )
      .all(id),
  }));
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function liveUnit(db: SqliteDatabase, id: string): LiveUnit {
  const row = db
    .prepare(
      `SELECT id, layer_id, speaker_id, parent_unit_id, start_ms, end_ms, confidence,
              skip_processing, sort_order, created_at,
              analysis_graph_json, analysis_generation, graph_fingerprint
       FROM units WHERE id = ?`,
    )
    .get(id) as LiveUnit | undefined;
  if (!row) throw new Error('unit is missing');
  return row;
}

function textsOf(db: SqliteDatabase, unitId: string): TextRow[] {
  return db
    .prepare(
      `SELECT id, layer_id, role, body, self_certainty, provenance_json
       FROM unit_texts WHERE unit_id = ?`,
    )
    .all(unitId) as TextRow[];
}

function textDraftsOf(db: SqliteDatabase, unitId: string): TextDraftRow[] {
  return db
    .prepare(
      `SELECT unit_id, layer_id, raw_input, base_body, provenance_json, updated_at
       FROM unit_text_drafts WHERE unit_id = ?`,
    )
    .all(unitId) as TextDraftRow[];
}

function receiptsOf(db: SqliteDatabase, unitId: string): SaveReceiptRow[] {
  return db
    .prepare(
      `SELECT operation_id, digest, unit_id, layer_id, committed_at
       FROM text_save_receipts WHERE unit_id = ?`,
    )
    .all(unitId) as SaveReceiptRow[];
}

function readGraphText(json: string | null): string | null {
  if (json === null) return null;
  const parsed = JSON.parse(json) as { text?: unknown };
  return typeof parsed.text === 'string' ? parsed.text : null;
}

function capturedMaterial(
  db: SqliteDatabase,
  unitId: string,
  keepGraph: boolean,
  graphText: string | null,
) {
  if (keepGraph || graphText === null) return null;
  try {
    return readAnalysisMaterial(db, unitId);
  } catch {
    return null;
  }
}

function analysisTargets(
  db: SqliteDatabase,
  unitId: string,
  graph: Parameters<typeof nodeIdsOf>[0],
  json: string,
): string[] {
  const tokenIds = (
    db.prepare('SELECT id FROM tokens WHERE unit_id = ?').all(unitId) as { id: string }[]
  ).map((row) => row.id);
  const morphemeIds =
    tokenIds.length === 0
      ? []
      : (
          db
            .prepare(
              `SELECT id FROM morphemes WHERE token_id IN (${tokenIds.map(() => '?').join(', ')})`,
            )
            .all(...tokenIds) as { id: string }[]
        ).map((row) => row.id);
  return [
    ...new Set([
      ...(graph ? nodeIdsOf(graph) : nodeIdsFromJson(json)),
      ...tokenIds,
      ...morphemeIds,
    ]),
  ];
}

function nodeIdsFromJson(json: string): string[] {
  const parsed = JSON.parse(json) as { nodes?: { id?: unknown }[] };
  return (parsed.nodes ?? []).flatMap((node) => (typeof node.id === 'string' ? [node.id] : []));
}

function layerRole(db: SqliteDatabase, layerId: string): string {
  const row = db.prepare('SELECT content_type FROM layers WHERE id = ?').get(layerId) as
    { content_type: string } | undefined;
  if (!row) throw new Error('unit is missing');
  return row.content_type;
}

function insertText(
  db: SqliteDatabase,
  unitId: string,
  layerId: string,
  role: string,
  body: string,
  now: string,
  selfCertainty: string | null = null,
): void {
  assertUnitTextRoleFree(db, unitId, role, layerId);
  db.prepare(
    `INSERT INTO unit_texts (id, unit_id, layer_id, role, body, self_certainty, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), unitId, layerId, role, body, selfCertainty, now);
}

function parkUnit(db: SqliteDatabase, id: string): void {
  const row = db.prepare('SELECT layer_id FROM units WHERE id = ?').get(id) as
    { layer_id: string } | undefined;
  if (!row) return;
  db.prepare('UPDATE units SET start_ms = NULL, end_ms = NULL, sort_order = ? WHERE id = ?').run(
    nextSort(db, row.layer_id),
    id,
  );
}

function insertUnitRow(db: SqliteDatabase, removed: RemovedUnit): void {
  const unit = removed.unit;
  db.prepare(
    `INSERT INTO units (
      id, layer_id, speaker_id, parent_unit_id, start_ms, end_ms, confidence, skip_processing,
      sort_order, created_at, updated_at, analysis_graph_json, analysis_generation,
      graph_fingerprint
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    unit.id,
    unit.layer_id,
    unit.speaker_id,
    unit.parent_unit_id,
    unit.start_ms,
    unit.end_ms,
    unit.confidence ?? null,
    unit.skip_processing ?? 0,
    unit.sort_order,
    unit.created_at,
    unit.updated_at,
    unit.analysis_graph_json,
    unit.analysis_generation,
    unit.graph_fingerprint,
  );
}

function insertRemovedContents(db: SqliteDatabase, removed: RemovedUnit): void {
  const unitId = removed.unit.id;
  // A clearing split detaches these rows and keeps their ids. Drop the detached copies so the snapshot can restore them.
  for (const link of removed.links) {
    db.prepare('DELETE FROM token_lexeme_links WHERE id = ?').run(link.id);
  }
  db.prepare('DELETE FROM units WHERE id = ?').run(unitId);
  insertRemovedUnit(db, removed);
}

function restoreDrafts(db: SqliteDatabase, undo: UnitSplitUndo): void {
  const text = db.prepare(
    `INSERT INTO unit_text_drafts (
       unit_id, layer_id, raw_input, base_body, provenance_json, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const row of undo.textDrafts) {
    text.run(
      row.unit_id,
      row.layer_id,
      row.raw_input,
      row.base_body,
      row.provenance_json,
      row.updated_at,
    );
  }
  const receipt = db.prepare(
    `INSERT INTO text_save_receipts (operation_id, digest, unit_id, layer_id, committed_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  for (const row of undo.saveReceipts) {
    receipt.run(row.operation_id, row.digest, row.unit_id, row.layer_id, row.committed_at);
  }
}

function nextSort(db: SqliteDatabase, layerId: string): number {
  const row = db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM units WHERE layer_id = ?')
    .get(layerId) as { next: number };
  return row.next;
}

function manuscriptOf(
  db: SqliteDatabase,
  unitId: string,
): { manuscriptId: string; generation: number } {
  const row = db
    .prepare(
      `SELECT manuscripts.id AS manuscriptId, manuscripts.generation AS generation
       FROM units
       JOIN layers ON layers.id = units.layer_id
       JOIN manuscripts ON manuscripts.id = layers.manuscript_id
       WHERE units.id = ?`,
    )
    .get(unitId) as { manuscriptId: string; generation: number } | undefined;
  if (!row) throw new Error('unit is missing');
  return row;
}

function generationOf(db: SqliteDatabase, manuscriptId: string): number {
  const row = db.prepare('SELECT generation FROM manuscripts WHERE id = ?').get(manuscriptId) as
    { generation: number } | undefined;
  if (!row) throw new Error('unit is missing');
  return row.generation;
}

function bumpGeneration(db: SqliteDatabase, manuscriptId: string, now: string): void {
  db.prepare('UPDATE manuscripts SET generation = generation + 1, updated_at = ? WHERE id = ?').run(
    now,
    manuscriptId,
  );
}
