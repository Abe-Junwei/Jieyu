import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  clearAnalysisProjection,
  insertReviewSnapshot,
  readAnalysisMaterial,
} from './analysisCandidates';
import { queueUnreferencedAttachment } from './attachments';
import { missingUnitFields, writeRequiredFieldValues } from './customFields';
import { getSettings, replaceSettings } from './settings';
import { audiosOfText, insertTextAudio } from './unitTextAudios';
import {
  deleteUnitTree,
  insertRemovedUnit,
  nodeIdsOf,
  readRemovedUnit,
  shiftSortOrders,
  type RemovedUnit,
} from './unitSpan';
import { TEXT_AUDIO_CAP } from '../../utils/textAudioCap';
import { readStoredUnit, type Unit } from './units';

type SqliteDatabase = InstanceType<typeof Database>;

export interface UnitMergeInput {
  textOverrides?: { layerId: string; text: string }[];
  keepId: string;
  removeId: string;
  operationId?: string;
  separator?: string;
  discardAudioIds?: string[];
  baseline?: string;
  /** Redo reuses the id from the first merge. */
  newId?: string;
  /** Visible text frozen when the confirm dialog opened, for this layer only. */
  textLayerId?: string;
  keepText?: string;
  removeText?: string;
}

interface TextDraftRow {
  unit_id: string;
  layer_id: string;
  raw_input: string;
  base_body: string;
  provenance_json: string | null;
  updated_at: string;
}

interface ChildUnit {
  id: string;
  layer_id: string;
  speaker_id: string | null;
  parent_unit_id: string;
  start_ms: number | null;
  end_ms: number | null;
}

export interface UnitMergeUndo {
  textOverrides?: { layerId: string; text: string }[];
  operationId: string;
  newId: string;
  manuscriptId: string;
  manuscriptGeneration: number;
  earlier: RemovedUnit;
  later: RemovedUnit;
  separator: string;
  discardAudioIds: string[];
  fingerprint: string;
  children: { id: string; parentId: string }[];
  drafts: TextDraftRow[];
  refs: MovedRef[];
  saveReceipts: SaveReceiptRow[];
  textLayerId?: string;
  keepText?: string;
  removeText?: string;
}

interface SaveReceiptRow {
  operation_id: string;
  digest: string;
  unit_id: string;
  layer_id: string;
  committed_at: string;
}

interface MovedRef {
  definitionId: string;
  targetType: string;
  targetId: string;
  valueJson: string;
  nextJson: string;
  updatedAt: string;
}

type Side = RemovedUnit;
type TextRow = RemovedUnit['texts'][number];

export interface MergeClip {
  id: string;
  unitId: string;
  layerId: string;
  fileId: string;
}

export interface MergeTextPreview {
  layerId: string;
  name: Record<string, string>;
  official: string;
  draft: string | null;
  result: string;
}

export interface MergePreview {
  texts: MergeTextPreview[];
  keepId: string;
  removeId: string;
  gapMs: number;
  noteCount: number;
  separator: string;
  baseline: string;
  earlier: MergeClip[];
  later: MergeClip[];
}

export function mergePreview(
  db: SqliteDatabase,
  input: { keepId: string; removeId: string; discardAudioIds?: string[] },
): MergePreview {
  const [earlier, later] = orderedPair(db, input.keepId, input.removeId);
  assertPair(db, earlier, later);
  const end = earlier.unit.end_ms as number;
  const start = later.unit.start_ms as number;
  return {
    keepId: earlier.unit.id,
    removeId: later.unit.id,
    gapMs: start - end,
    noteCount: noteCountOf(db, earlier.unit.id, later.unit.id),
    separator: ' ',
    baseline: mergeBaseline(db, input),
    texts: previewTexts(db, earlier, later),
    earlier: clipsOf(db, earlier.unit.id),
    later: clipsOf(db, later.unit.id),
  };
}

function previewTexts(db: SqliteDatabase, earlier: Side, later: Side): MergeTextPreview[] {
  const drafts = draftsOf(db, earlier.unit.id, later.unit.id);
  const layerIds = new Set(
    [...earlier.texts, ...later.texts, ...drafts].map((row) => row.layer_id),
  );
  const separator = ' ';
  const join = (left: string, right: string) =>
    left !== '' && right !== '' ? left + separator + right : left + right;
  return [...layerIds].map((layerId) => {
    const left = earlier.texts.find((row) => row.layer_id === layerId)?.body ?? '';
    const right = later.texts.find((row) => row.layer_id === layerId)?.body ?? '';
    const ld = drafts.find((row) => row.unit_id === earlier.unit.id && row.layer_id === layerId);
    const rd = drafts.find((row) => row.unit_id === later.unit.id && row.layer_id === layerId);
    const layer = db.prepare('SELECT name_json FROM layers WHERE id = ?').get(layerId) as {
      name_json: string;
    };
    return {
      layerId,
      name: JSON.parse(layer.name_json) as Record<string, string>,
      official: join(left, right),
      draft: ld || rd ? join(ld?.raw_input ?? left, rd?.raw_input ?? right) : null,
      result: join(ld?.raw_input ?? left, rd?.raw_input ?? right),
    };
  });
}

export function mergeBaseline(
  db: SqliteDatabase,
  input: { keepId: string; removeId: string; discardAudioIds?: string[] },
): string {
  const [earlier, later] = orderedPair(db, input.keepId, input.removeId);
  const children = childrenOf(db, earlier.unit.id, later.unit.id);
  const payload = {
    ids: [earlier.unit.id, later.unit.id],
    units: [earlier.unit, later.unit].map((unit) => ({
      speaker: unit.speaker_id,
      start: unit.start_ms,
      end: unit.end_ms,
      parent: unit.parent_unit_id,
      fingerprint: unit.graph_fingerprint,
    })),
    between: betweenIds(db, earlier, later),
    children: children.map((child) => ({
      id: child.id,
      parent: child.parent_unit_id,
      start: child.start_ms,
      end: child.end_ms,
      texts: textsOf(db, child.id),
    })),
    texts: [earlier, later].map((side) =>
      side.texts.map((row) => ({
        id: row.id,
        layer: row.layer_id,
        body: row.body,
        provenance: row.provenance_json,
      })),
    ),
    drafts: draftsOf(db, earlier.unit.id, later.unit.id),
    fields: [earlier, later].map((side) => fieldMap(db, side.unit.id)),
    clips: [earlier, later].map((side) =>
      side.texts.map((row) => audiosOfText(db, row.id).map((clip) => clip.id)),
    ),
    discard: [...(input.discardAudioIds ?? [])].sort(),
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function mergeUnits(
  db: SqliteDatabase,
  input: UnitMergeInput,
  afterWrite?: () => void,
): { unit: Unit; undo: UnitMergeUndo } {
  const write = db.transaction(() => {
    if (
      input.baseline !== undefined &&
      input.baseline !==
        mergeBaseline(db, {
          keepId: input.keepId,
          removeId: input.removeId,
          ...(input.discardAudioIds === undefined
            ? {}
            : { discardAudioIds: input.discardAudioIds }),
        })
    ) {
      throw new Error('merge baseline changed');
    }
    const [earlier, later] = orderedPair(db, input.keepId, input.removeId);
    assertPair(db, earlier, later);
    const children = childrenOf(db, earlier.unit.id, later.unit.id);
    const start = earlier.unit.start_ms as number;
    const end = later.unit.end_ms as number;
    assertChildren(children, start, end);
    const separator = chosenSeparator(db, input.separator);
    const drafts = draftsOf(db, earlier.unit.id, later.unit.id);
    if (drafts.length > 0 && input.baseline === undefined && input.newId === undefined)
      throw new Error('merge drafts require confirmation');
    const saveReceipts = receiptsOf(db, earlier.unit.id, later.unit.id);
    const editor = editorText(input);
    const plan = textPlan(
      db,
      earlier,
      later,
      drafts,
      separator,
      input.discardAudioIds ?? [],
      editor,
      input.textOverrides ?? [],
    );
    const body = plan.bodyOf(earlier.unit.layer_id);
    const keepGraph = keptGraph(earlier, later, body);
    const materials = new Map<string, ReturnType<typeof readAnalysisMaterial>>();
    for (const [name, side] of [
      ['earlier', earlier],
      ['later', later],
    ] as const) {
      if (side.unit.analysis_graph_json === null || name === keepGraph) continue;
      materials.set(side.unit.id, readAnalysisMaterial(db, side.unit.id));
    }
    const newId = input.newId ?? randomUUID();
    const operationId = input.operationId ?? randomUUID();
    const now = new Date().toISOString();
    const place = manuscriptOf(db, earlier.unit.id);
    parkUnits(db, earlier.unit.id, later.unit.id);
    shiftSortOrders(
      db,
      earlier.unit.layer_id,
      later.unit.sort_order,
      'down',
      [earlier.unit.id, later.unit.id],
      'gt',
    );
    insertMergedUnit(db, newId, earlier, later, start, end, keepGraph, now);
    db.prepare('UPDATE units SET parent_unit_id = ? WHERE parent_unit_id IN (?, ?)').run(
      newId,
      earlier.unit.id,
      later.unit.id,
    );
    writeTexts(db, newId, plan, now);
    writeTextRowMaps(db, operationId, plan, now);
    archiveGraphs(db, earlier, later, newId, keepGraph, materials);
    db.prepare('UPDATE analysis_candidates SET unit_id = ? WHERE unit_id IN (?, ?)').run(
      newId,
      earlier.unit.id,
      later.unit.id,
    );
    db.prepare(
      `UPDATE analysis_candidates
       SET status = 'rejected', updated_at = ?
       WHERE unit_id = ? AND kind = 'suggestion' AND status = 'pending'`,
    ).run(now, newId);
    db.prepare('UPDATE notes SET unit_id = ? WHERE unit_id IN (?, ?)').run(
      newId,
      earlier.unit.id,
      later.unit.id,
    );
    for (const move of plan.noteMoves) {
      db.prepare('UPDATE notes SET unit_text_id = ? WHERE unit_text_id = ?').run(
        move.to,
        move.from,
      );
    }
    writeRequiredFieldValues(
      db,
      'unit',
      newId,
      mergedFields(db, earlier.unit.id, later.unit.id, newId),
    );
    const refs = retargetInbound(db, earlier.unit.id, later.unit.id, newId);
    deleteUnitTree(db, earlier.unit.id);
    deleteUnitTree(db, later.unit.id);
    if (missingUnitFields(db, newId).length > 0)
      throw new Error('unit is missing a required field');
    storeSeparator(db, input.separator);
    bumpGeneration(db, place.manuscriptId, now);
    afterWrite?.();
    const unit = readStoredUnit(db, newId);
    if (
      !unit ||
      readStoredUnit(db, earlier.unit.id) !== null ||
      readStoredUnit(db, later.unit.id) !== null ||
      unit.startMs !== start ||
      unit.endMs !== end ||
      unit.text !== body
    ) {
      throw new Error('unit merge readback failed');
    }
    return {
      unit,
      undo: {
        operationId,
        ...(input.textOverrides === undefined ? {} : { textOverrides: input.textOverrides }),
        ...(editor === undefined
          ? {}
          : {
              textLayerId: editor.layerId,
              keepText: editor.keep,
              removeText: editor.remove,
            }),
        newId,
        manuscriptId: place.manuscriptId,
        manuscriptGeneration: place.generation + 1,
        earlier,
        later,
        separator,
        discardAudioIds: [...(input.discardAudioIds ?? [])],
        fingerprint: afterFingerprint(db, newId),
        children: children.map((child) => ({ id: child.id, parentId: child.parent_unit_id })),
        drafts,
        refs,
        saveReceipts,
      },
    };
  });
  return write();
}

export function undoMerge(db: SqliteDatabase, undo: UnitMergeUndo, afterWrite?: () => void): Unit {
  const write = db.transaction(() => {
    if (afterFingerprint(db, undo.newId) !== undo.fingerprint || !refsIntact(db, undo.refs)) {
      throw new Error('unit merge undo is stale');
    }
    const layerId = undo.earlier.unit.layer_id;
    deleteUnitTree(db, undo.newId);
    shiftSortOrders(db, layerId, undo.later.unit.sort_order, 'up', [], 'gte');
    insertRemovedUnit(db, undo.earlier);
    insertRemovedUnit(db, undo.later);
    const restoreParent = db.prepare('UPDATE units SET parent_unit_id = ? WHERE id = ?');
    for (const child of undo.children) restoreParent.run(child.parentId, child.id);
    const restoreDraft = db.prepare(
      `INSERT INTO unit_text_drafts (
        unit_id, layer_id, raw_input, base_body, provenance_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const draft of undo.drafts) {
      restoreDraft.run(
        draft.unit_id,
        draft.layer_id,
        draft.raw_input,
        draft.base_body,
        draft.provenance_json,
        draft.updated_at,
      );
    }
    const restoreReceipt = db.prepare(
      `INSERT INTO text_save_receipts (operation_id, digest, unit_id, layer_id, committed_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const row of undo.saveReceipts) {
      restoreReceipt.run(row.operation_id, row.digest, row.unit_id, row.layer_id, row.committed_at);
    }
    const restoreRef = db.prepare(
      `UPDATE custom_field_values
       SET value_json = ?, updated_at = ?
       WHERE definition_id = ? AND target_type = ? AND target_id = ?`,
    );
    for (const ref of undo.refs) {
      restoreRef.run(ref.valueJson, ref.updatedAt, ref.definitionId, ref.targetType, ref.targetId);
    }
    const now = new Date().toISOString();
    db.prepare('DELETE FROM unit_span_maps WHERE operation_id = ?').run(undo.operationId);
    bumpGeneration(db, undo.manuscriptId, now);
    afterWrite?.();
    const earlier = readStoredUnit(db, undo.earlier.unit.id);
    const later = readStoredUnit(db, undo.later.unit.id);
    if (!earlier || !later || readStoredUnit(db, undo.newId) !== null) {
      throw new Error('unit merge undo readback failed');
    }
    return earlier;
  });
  return write();
}

function orderedPair(db: SqliteDatabase, leftId: string, rightId: string): [Side, Side] {
  const left = readRemovedUnit(db, leftId);
  const right = readRemovedUnit(db, rightId);
  if (left.unit.id === right.unit.id) throw new Error('units are not in the same layer');
  const leftStart = left.unit.start_ms;
  const rightStart = right.unit.start_ms;
  if (leftStart === null || rightStart === null) return [left, right];
  return leftStart <= rightStart ? [left, right] : [right, left];
}

function assertPair(db: SqliteDatabase, earlier: Side, later: Side): void {
  if (earlier.unit.layer_id !== later.unit.layer_id) {
    throw new Error('units are not in the same layer');
  }
  if (earlier.unit.speaker_id !== later.unit.speaker_id) {
    throw new Error('units do not share a speaker');
  }
  if (earlier.unit.parent_unit_id !== later.unit.parent_unit_id) {
    throw new Error('units do not share a parent');
  }
  if (
    earlier.unit.start_ms === null ||
    earlier.unit.end_ms === null ||
    later.unit.start_ms === null ||
    later.unit.end_ms === null
  ) {
    throw new Error('units need a saved time');
  }
  if (earlier.unit.end_ms > later.unit.start_ms) throw new Error('units are not adjacent');
  if (later.unit.sort_order <= earlier.unit.sort_order) {
    throw new Error('timed units are out of sort order');
  }
  const drafted = db
    .prepare('SELECT COUNT(*) AS n FROM unit_time_drafts WHERE unit_id IN (?, ?)')
    .get(earlier.unit.id, later.unit.id) as { n: number };
  if (drafted.n > 0) throw new Error('unit has a time draft');
  if (betweenIds(db, earlier, later).length > 0) throw new Error('a unit sits between the pair');
}

function betweenIds(db: SqliteDatabase, earlier: Side, later: Side): string[] {
  if (earlier.unit.end_ms === null || later.unit.start_ms === null) return [];
  const rows = db
    .prepare(
      `SELECT id FROM units
       WHERE layer_id = ? AND id NOT IN (?, ?)
         AND start_ms IS NOT NULL
         AND start_ms >= ? AND end_ms <= ?
         AND ((speaker_id IS NULL AND ? IS NULL) OR speaker_id = ?)
       ORDER BY start_ms, id`,
    )
    .all(
      earlier.unit.layer_id,
      earlier.unit.id,
      later.unit.id,
      earlier.unit.end_ms,
      later.unit.start_ms,
      earlier.unit.speaker_id,
      earlier.unit.speaker_id,
    ) as { id: string }[];
  return rows.map((row) => row.id);
}

function childrenOf(db: SqliteDatabase, earlierId: string, laterId: string): ChildUnit[] {
  return db
    .prepare(
      `SELECT id, layer_id, speaker_id, parent_unit_id, start_ms, end_ms
       FROM units WHERE parent_unit_id IN (?, ?) ORDER BY id`,
    )
    .all(earlierId, laterId) as ChildUnit[];
}

function assertChildren(children: ChildUnit[], start: number, end: number): void {
  for (const child of children) {
    if (child.start_ms === null || child.end_ms === null) continue;
    if (child.start_ms < start || child.end_ms > end) {
      throw new Error('a child falls outside the merged span');
    }
  }
  for (let i = 0; i < children.length; i += 1) {
    for (let j = i + 1; j < children.length; j += 1) {
      const left = children[i];
      const right = children[j];
      if (!left || !right) continue;
      if (left.layer_id !== right.layer_id || left.speaker_id !== right.speaker_id) continue;
      if (
        left.start_ms === null ||
        left.end_ms === null ||
        right.start_ms === null ||
        right.end_ms === null
      ) {
        continue;
      }
      if (left.start_ms < right.end_ms && right.start_ms < left.end_ms) {
        throw new Error('child intervals overlap');
      }
    }
  }
}

interface PlannedText {
  surviving: TextRow | null;
  insertId: string | null;
  layerId: string;
  role: string;
  body: string;
  provenance: string | null;
  clips: { id: string; unit_text_id: string; file_id: string; position: number }[];
  dropId: string | null;
}

interface TextPlan {
  rows: PlannedText[];
  noteMoves: { from: string; to: string }[];
  bodyOf: (layerId: string) => string;
}

function editorText(input: UnitMergeInput): EditorText | undefined {
  const count = [input.textLayerId, input.keepText, input.removeText].filter(
    (value) => value !== undefined,
  ).length;
  if (count === 0) return undefined;
  if (
    count !== 3 ||
    input.textLayerId === undefined ||
    input.keepText === undefined ||
    input.removeText === undefined
  ) {
    throw new Error('merge text is incomplete');
  }
  return {
    layerId: input.textLayerId,
    keepId: input.keepId,
    removeId: input.removeId,
    keep: input.keepText,
    remove: input.removeText,
  };
}

interface EditorText {
  layerId: string;
  keepId: string;
  removeId: string;
  keep: string;
  remove: string;
}

function textPlan(
  db: SqliteDatabase,
  earlier: Side,
  later: Side,
  drafts: TextDraftRow[],
  separator: string,
  discardAudioIds: string[],
  editor: EditorText | undefined,
  overrides: { layerId: string; text: string }[],
): TextPlan {
  const discard = new Set(discardAudioIds);
  const keys = new Set<string>();
  for (const row of [...earlier.texts, ...later.texts]) keys.add(`${row.layer_id}\n${row.role}`);
  for (const draft of drafts) keys.add(`${draft.layer_id}\n${layerRole(db, draft.layer_id)}`);
  if (editor !== undefined) keys.add(`${editor.layerId}\n${layerRole(db, editor.layerId)}`);
  if (new Set(overrides.map((row) => row.layerId)).size !== overrides.length)
    throw new Error('duplicate merge layer');
  for (const row of overrides) {
    if (![...keys].some((key) => key.split('\n')[0] === row.layerId))
      throw new Error('merge layer is missing');
  }
  const rows: TextPlan['rows'] = [];
  const noteMoves: { from: string; to: string }[] = [];
  const bodies = new Map<string, string>();
  for (const key of keys) {
    const [layerId, role] = key.split('\n');
    if (layerId === undefined || role === undefined) throw new Error('unit merge readback failed');
    const left = earlier.texts.find((row) => row.layer_id === layerId && row.role === role);
    const right = later.texts.find((row) => row.layer_id === layerId && row.role === role);
    const leftDraft = drafts.find(
      (item) => item.unit_id === earlier.unit.id && item.layer_id === layerId,
    );
    const rightDraft = drafts.find(
      (item) => item.unit_id === later.unit.id && item.layer_id === layerId,
    );
    const overlay = editor !== undefined && layerId === editor.layerId ? editor : undefined;
    const leftBody =
      overlay === undefined
        ? (leftDraft?.raw_input ?? left?.body ?? '')
        : earlier.unit.id === overlay.keepId
          ? overlay.keep
          : overlay.remove;
    const rightBody =
      overlay === undefined
        ? (rightDraft?.raw_input ?? right?.body ?? '')
        : earlier.unit.id === overlay.keepId
          ? overlay.remove
          : overlay.keep;
    const leftClips = left === undefined ? [] : audiosOfText(db, left.id);
    const rightClips = right === undefined ? [] : audiosOfText(db, right.id);
    const leftNotes = left === undefined ? 0 : noteCount(db, left.id);
    const rightNotes = right === undefined ? 0 : noteCount(db, right.id);
    const leftKeep = leftClips.length > 0 || leftNotes > 0;
    const rightKeep = rightClips.length > 0 || rightNotes > 0;
    if (leftBody === '' && rightBody === '' && !leftKeep && !rightKeep) continue;
    const surviving =
      left !== undefined && (leftKeep || leftBody !== '' || right === undefined)
        ? left
        : (right ?? null);
    const mergedBody =
      leftBody !== '' && rightBody !== ''
        ? `${leftBody}${separator}${rightBody}`
        : leftBody + rightBody;
    const override = overrides.find((row) => row.layerId === layerId);
    const joined = override?.text ?? mergedBody;
    const officialChanged =
      (override !== undefined && override.text !== mergedBody) ||
      (overlay !== undefined &&
        (leftBody !== (left?.body ?? '') || rightBody !== (right?.body ?? '')));
    const provenance = officialChanged
      ? null
      : leftBody !== '' && rightBody !== ''
        ? null
        : leftBody !== ''
          ? leftDraft
            ? leftDraft.provenance_json
            : (left?.provenance_json ?? null)
          : rightBody !== ''
            ? rightDraft
              ? rightDraft.provenance_json
              : (right?.provenance_json ?? null)
            : (surviving?.provenance_json ?? null);
    const seen = new Set<string>();
    const clips = [];
    for (const clip of [...leftClips, ...rightClips]) {
      if (discard.has(clip.id) || seen.has(clip.file_id)) continue;
      seen.add(clip.file_id);
      clips.push(clip);
    }
    if (clips.length > TEXT_AUDIO_CAP) throw new Error('too many recordings');
    const dropId =
      left && right && surviving !== null && left.id !== right.id
        ? left.id === surviving.id
          ? right.id
          : left.id
        : null;
    if (dropId !== null && surviving !== null) noteMoves.push({ from: dropId, to: surviving.id });
    rows.push({
      surviving,
      insertId: surviving === null ? randomUUID() : null,
      layerId,
      role,
      body: joined,
      provenance,
      clips,
      dropId,
    });
    bodies.set(layerId, joined);
  }
  return {
    rows,
    noteMoves,
    bodyOf: (layerId: string) => bodies.get(layerId) ?? '',
  };
}

function writeTextRowMaps(
  db: SqliteDatabase,
  operationId: string,
  plan: TextPlan,
  now: string,
): void {
  const insert = db.prepare(
    `INSERT INTO unit_span_maps (operation_id, kind, old_id, new_id, created_at)
     VALUES (?, 'merge', ?, ?, ?)`,
  );
  for (const row of plan.rows) {
    if (row.dropId === null || row.surviving === null) continue;
    insert.run(operationId, row.dropId, row.surviving.id, now);
  }
}

function layerRole(db: SqliteDatabase, layerId: string): string {
  const row = db.prepare('SELECT content_type FROM layers WHERE id = ?').get(layerId) as
    { content_type: string } | undefined;
  if (row === undefined) throw new Error('text layer is missing');
  return row.content_type;
}

function writeTexts(db: SqliteDatabase, newId: string, plan: TextPlan, now: string): void {
  const insert = db.prepare(
    `INSERT INTO unit_texts (id, unit_id, layer_id, role, body, provenance_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const row of plan.rows) {
    const surviving = row.surviving;
    if (surviving === null) {
      if (row.insertId === null) throw new Error('unit merge readback failed');
      insert.run(row.insertId, newId, row.layerId, row.role, row.body, row.provenance, now);
      continue;
    }
    const all = [
      ...audiosOfText(db, surviving.id),
      ...(row.dropId === null ? [] : audiosOfText(db, row.dropId)),
    ];
    const keepFiles = new Set(row.clips.map((clip) => clip.file_id));
    for (const clip of all) {
      db.prepare('DELETE FROM unit_text_audios WHERE id = ?').run(clip.id);
      if (!keepFiles.has(clip.file_id)) queueUnreferencedAttachment(db, clip.file_id);
    }
    db.prepare(
      `UPDATE unit_texts SET unit_id = ?, body = ?, provenance_json = ?, updated_at = ? WHERE id = ?`,
    ).run(newId, row.body, row.provenance, now, surviving.id);
    row.clips.forEach((clip, index) => {
      insertTextAudio(db, { ...clip, unit_text_id: surviving.id, position: index + 1 });
    });
  }
}

function keptGraph(earlier: Side, later: Side, body: string): 'earlier' | 'later' | null {
  const left = earlier.unit.analysis_graph_json !== null;
  const right = later.unit.analysis_graph_json !== null;
  if (left === right) return null;
  const side = left ? earlier : later;
  return graphText(side.unit.analysis_graph_json) === body ? (left ? 'earlier' : 'later') : null;
}

function graphText(json: string | null): string | null {
  if (json === null) return null;
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== 'object' || parsed === null || !('text' in parsed)) return null;
  const text = (parsed as { text: unknown }).text;
  return typeof text === 'string' ? text : null;
}

function archiveGraphs(
  db: SqliteDatabase,
  earlier: Side,
  later: Side,
  newId: string,
  keep: 'earlier' | 'later' | null,
  materials: ReadonlyMap<string, ReturnType<typeof readAnalysisMaterial>>,
): void {
  for (const [name, side] of [
    ['earlier', earlier],
    ['later', later],
  ] as const) {
    const material = materials.get(side.unit.id);
    if (material !== undefined) {
      insertReviewSnapshot(db, { ...material, unitId: newId });
      clearAnalysisProjection(db, side.unit.id);
      continue;
    }
    if (name === keep) {
      db.prepare('UPDATE tokens SET unit_id = ? WHERE unit_id = ?').run(newId, side.unit.id);
      db.prepare(
        `UPDATE units
         SET analysis_graph_json = NULL, graph_fingerprint = '', analysis_generation = 0
         WHERE id = ?`,
      ).run(side.unit.id);
    }
  }
}

function mergedFields(
  db: SqliteDatabase,
  earlierId: string,
  laterId: string,
  newId: string,
): Record<string, unknown> {
  const from = new Set([earlierId, laterId]);
  const left = retargetFields(fieldMap(db, earlierId), from, newId);
  const right = retargetFields(fieldMap(db, laterId), from, newId);
  const merged: Record<string, unknown> = {};
  for (const id of new Set([...Object.keys(left), ...Object.keys(right)])) {
    const a = left[id];
    const b = right[id];
    if (a !== undefined && b !== undefined && JSON.stringify(a) !== JSON.stringify(b)) {
      throw new Error('custom fields differ');
    }
    const value = a !== undefined ? a : b;
    if (value !== undefined) merged[id] = value;
  }
  return merged;
}

function retargetFields(
  fields: Record<string, unknown>,
  from: ReadonlySet<string>,
  to: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [id, value] of Object.entries(fields)) next[id] = retargetValue(value, from, to);
  return next;
}

function retargetValue(value: unknown, from: ReadonlySet<string>, to: string): unknown {
  if (Array.isArray(value)) return value.map((item) => retargetValue(item, from, to));
  if (typeof value !== 'object' || value === null) return value;
  const record = { ...(value as Record<string, unknown>) };
  let changed = false;
  if (
    record.targetType === 'unit' &&
    typeof record.targetId === 'string' &&
    from.has(record.targetId)
  ) {
    record.targetId = to;
    changed = true;
  }
  if (typeof record.unitId === 'string' && from.has(record.unitId)) {
    record.unitId = to;
    changed = true;
  }
  return changed ? record : value;
}

function retargetInbound(
  db: SqliteDatabase,
  earlierId: string,
  laterId: string,
  newId: string,
): MovedRef[] {
  const from = new Set([earlierId, laterId]);
  const rows = db
    .prepare(
      `SELECT definition_id, target_type, target_id, value_json, updated_at
       FROM custom_field_values ORDER BY definition_id, target_type, target_id`,
    )
    .all() as {
    definition_id: string;
    target_type: string;
    target_id: string;
    value_json: string;
    updated_at: string;
  }[];
  const update = db.prepare(
    `UPDATE custom_field_values SET value_json = ?
     WHERE definition_id = ? AND target_type = ? AND target_id = ?`,
  );
  const moved: MovedRef[] = [];
  for (const row of rows) {
    if (row.target_type === 'unit' && from.has(row.target_id)) continue;
    const value = JSON.parse(row.value_json) as unknown;
    const next = retargetValue(value, from, newId);
    const nextJson = JSON.stringify(next);
    if (nextJson === JSON.stringify(value)) continue;
    moved.push({
      definitionId: row.definition_id,
      targetType: row.target_type,
      targetId: row.target_id,
      valueJson: row.value_json,
      nextJson,
      updatedAt: row.updated_at,
    });
    update.run(nextJson, row.definition_id, row.target_type, row.target_id);
  }
  return moved;
}

function refsIntact(db: SqliteDatabase, refs: readonly MovedRef[]): boolean {
  const read = db.prepare(
    `SELECT value_json FROM custom_field_values
     WHERE definition_id = ? AND target_type = ? AND target_id = ?`,
  );
  return refs.every((ref) => {
    const row = read.get(ref.definitionId, ref.targetType, ref.targetId) as
      { value_json: string } | undefined;
    return row?.value_json === ref.nextJson;
  });
}

function fieldMap(db: SqliteDatabase, unitId: string): Record<string, unknown> {
  const rows = db
    .prepare(
      `SELECT definition_id, value_json FROM custom_field_values
       WHERE target_type = 'unit' AND target_id = ? ORDER BY definition_id`,
    )
    .all(unitId) as { definition_id: string; value_json: string }[];
  const fields: Record<string, unknown> = {};
  for (const row of rows) fields[row.definition_id] = JSON.parse(row.value_json) as unknown;
  return fields;
}

function insertMergedUnit(
  db: SqliteDatabase,
  newId: string,
  earlier: Side,
  later: Side,
  start: number,
  end: number,
  keep: 'earlier' | 'later' | null,
  now: string,
): void {
  const graph = keep === 'earlier' ? earlier.unit : keep === 'later' ? later.unit : null;
  const certainty =
    earlier.unit.self_certainty !== null &&
    earlier.unit.self_certainty === later.unit.self_certainty
      ? earlier.unit.self_certainty
      : null;
  db.prepare(
    `INSERT INTO units (
      id, layer_id, speaker_id, parent_unit_id, start_ms, end_ms, confidence, skip_processing,
      self_certainty, sort_order, created_at, updated_at, analysis_graph_json, analysis_generation,
      graph_fingerprint
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId,
    earlier.unit.layer_id,
    earlier.unit.speaker_id,
    earlier.unit.parent_unit_id,
    start,
    end,
    earlier.unit.skip_processing === 1 || later.unit.skip_processing === 1 ? 1 : 0,
    certainty,
    earlier.unit.sort_order,
    earlier.unit.created_at,
    now,
    graph?.analysis_graph_json ?? null,
    graph?.analysis_generation ?? 0,
    graph?.graph_fingerprint ?? '',
  );
}

function parkUnits(db: SqliteDatabase, earlierId: string, laterId: string): void {
  db.prepare(
    `UPDATE units
     SET start_ms = NULL, end_ms = NULL, sort_order = sort_order + 1000000
     WHERE id IN (?, ?)`,
  ).run(earlierId, laterId);
}

function chosenSeparator(db: SqliteDatabase, separator: string | undefined): string {
  if (separator !== undefined) return separator;
  const stored = readSeparator(db);
  return stored ?? ' ';
}

function storeSeparator(db: SqliteDatabase, separator: string | undefined): void {
  if (separator === undefined) return;
  const project = db.prepare('SELECT id FROM project').get() as { id: string } | undefined;
  if (project === undefined) return;
  const settings = getSettings(db, project.id) ?? {};
  const stored = typeof settings.mergeSeparator === 'string' ? settings.mergeSeparator : ' ';
  if (separator === stored) return;
  replaceSettings(db, project.id, { ...settings, mergeSeparator: separator });
}

function readSeparator(db: SqliteDatabase): string | null {
  const project = db.prepare('SELECT id FROM project').get() as { id: string } | undefined;
  if (project === undefined) return null;
  const settings = getSettings(db, project.id);
  const value = settings?.mergeSeparator;
  return typeof value === 'string' ? value : null;
}

function draftsOf(db: SqliteDatabase, earlierId: string, laterId: string): TextDraftRow[] {
  return db
    .prepare(
      `SELECT unit_id, layer_id, raw_input, base_body, provenance_json, updated_at
       FROM unit_text_drafts WHERE unit_id IN (?, ?) ORDER BY unit_id, layer_id`,
    )
    .all(earlierId, laterId) as TextDraftRow[];
}

function receiptsOf(db: SqliteDatabase, earlierId: string, laterId: string): SaveReceiptRow[] {
  return db
    .prepare(
      `SELECT operation_id, digest, unit_id, layer_id, committed_at
       FROM text_save_receipts WHERE unit_id IN (?, ?) ORDER BY operation_id`,
    )
    .all(earlierId, laterId) as SaveReceiptRow[];
}

function textsOf(db: SqliteDatabase, unitId: string): { layer: string; body: string }[] {
  return db
    .prepare(
      `SELECT layer_id AS layer, body FROM unit_texts WHERE unit_id = ? ORDER BY layer_id, role`,
    )
    .all(unitId) as { layer: string; body: string }[];
}

function clipsOf(db: SqliteDatabase, unitId: string): MergeClip[] {
  return db
    .prepare(
      `SELECT unit_text_audios.id AS id, unit_texts.unit_id AS unitId,
              unit_texts.layer_id AS layerId, unit_text_audios.file_id AS fileId
       FROM unit_text_audios
       JOIN unit_texts ON unit_texts.id = unit_text_audios.unit_text_id
       WHERE unit_texts.unit_id = ?
       ORDER BY unit_text_audios.position, unit_text_audios.id`,
    )
    .all(unitId) as MergeClip[];
}

function noteCountOf(db: SqliteDatabase, earlierId: string, laterId: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT notes.id) AS n FROM notes
       WHERE notes.unit_id IN (?, ?)
          OR notes.unit_text_id IN (SELECT id FROM unit_texts WHERE unit_id IN (?, ?))`,
    )
    .get(earlierId, laterId, earlierId, laterId) as { n: number };
  return row.n;
}

function noteCount(db: SqliteDatabase, textId: string): number {
  return (
    db.prepare('SELECT COUNT(*) AS n FROM notes WHERE unit_text_id = ?').get(textId) as {
      n: number;
    }
  ).n;
}

function afterFingerprint(db: SqliteDatabase, unitId: string): string {
  if (readStoredUnit(db, unitId) === null) return '';
  const texts = textsOf(db, unitId);
  const clips = db
    .prepare(
      `SELECT unit_text_audios.id AS id
       FROM unit_text_audios
       JOIN unit_texts ON unit_texts.id = unit_text_audios.unit_text_id
       WHERE unit_texts.unit_id = ?
       ORDER BY unit_text_audios.unit_text_id, unit_text_audios.position`,
    )
    .all(unitId);
  const children = db
    .prepare(`SELECT id, start_ms, end_ms FROM units WHERE parent_unit_id = ? ORDER BY id`)
    .all(unitId) as { id: string; start_ms: number | null; end_ms: number | null }[];
  const childTexts = children.flatMap((child) =>
    textsOf(db, child.id).map((row) => ({ id: child.id, ...row })),
  );
  const drafts = db
    .prepare(`SELECT layer_id, raw_input FROM unit_text_drafts WHERE unit_id = ? ORDER BY layer_id`)
    .all(unitId);
  const graph = db
    .prepare(
      `SELECT analysis_graph_json, analysis_generation, graph_fingerprint
       FROM units WHERE id = ?`,
    )
    .get(unitId) as { analysis_graph_json: string | null };
  const tokenIds = (
    db.prepare('SELECT id FROM tokens WHERE unit_id = ? ORDER BY token_index').all(unitId) as {
      id: string;
    }[]
  ).map((row) => row.id);
  const morphemeIds =
    tokenIds.length === 0
      ? []
      : (
          db
            .prepare(
              `SELECT morphemes.id AS id FROM morphemes
               JOIN tokens ON tokens.id = morphemes.token_id
               WHERE tokens.unit_id = ? ORDER BY morphemes.id`,
            )
            .all(unitId) as { id: string }[]
        ).map((row) => row.id);
  const targets = [...tokenIds, ...morphemeIds, ...nodeIdsOf(graph.analysis_graph_json)];
  const links =
    targets.length === 0
      ? []
      : db
          .prepare(
            `SELECT id, target_id FROM token_lexeme_links
             WHERE target_id IN (${targets.map(() => '?').join(', ')}) ORDER BY id`,
          )
          .all(...targets);
  const kept = {
    texts,
    clips,
    children,
    childTexts,
    drafts,
    graph,
    notes: db
      .prepare(
        `SELECT id, unit_text_id, content_json, attachment FROM notes
         WHERE unit_id = ? ORDER BY id`,
      )
      .all(unitId),
    fields: db
      .prepare(
        `SELECT definition_id, target_type, target_id, value_json FROM custom_field_values
         WHERE (target_type = 'unit' AND target_id = ?)
            OR (target_type = 'note' AND target_id IN (SELECT id FROM notes WHERE unit_id = ?))
         ORDER BY definition_id, target_id`,
      )
      .all(unitId, unitId),
    candidates: db
      .prepare(
        `SELECT id, kind, status, graph_fingerprint FROM analysis_candidates
         WHERE unit_id = ? ORDER BY id`,
      )
      .all(unitId),
    tokenIds,
    morphemeIds,
    links,
    batches: db
      .prepare('SELECT id FROM reception_batches WHERE unit_id = ? ORDER BY id')
      .all(unitId),
    batchMaps: db
      .prepare(
        `SELECT local_id_map.batch_id, local_id_map.scope, local_id_map.local_id
         FROM local_id_map
         JOIN reception_batches ON reception_batches.id = local_id_map.batch_id
         WHERE reception_batches.unit_id = ?
         ORDER BY local_id_map.batch_id, local_id_map.scope, local_id_map.local_id`,
      )
      .all(unitId),
    acceptances: db
      .prepare('SELECT id FROM transcription_acceptances WHERE unit_id = ? ORDER BY id')
      .all(unitId),
    timeDrafts: db
      .prepare(
        `SELECT edge, raw_input, base_ms FROM unit_time_drafts
         WHERE unit_id = ? ORDER BY edge`,
      )
      .all(unitId),
    receipts: db
      .prepare(
        `SELECT operation_id, digest, layer_id FROM text_save_receipts
         WHERE unit_id = ? ORDER BY operation_id`,
      )
      .all(unitId),
  };
  return createHash('sha256').update(JSON.stringify(kept)).digest('hex');
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

function bumpGeneration(db: SqliteDatabase, manuscriptId: string, now: string): void {
  db.prepare('UPDATE manuscripts SET generation = generation + 1, updated_at = ? WHERE id = ?').run(
    now,
    manuscriptId,
  );
}
