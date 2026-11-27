import { randomUUID } from 'node:crypto';
import {
  clearAnalysisProjection,
  insertReviewSnapshot,
  readAnalysisMaterial,
} from './analysisCandidates';
import { queueUnreferencedAttachment } from './attachments';
import { missingUnitFields, writeRequiredFieldValues } from './customFields';
import { audiosOfText, insertTextAudio } from './unitTextAudios';
import { mergeLayerSelfCertainty } from './unitTextSelfCertainty';
import { deleteUnitTree, insertRemovedUnit, shiftSortOrders } from './unitSpan';
import { TEXT_AUDIO_CAP } from '../../utils/textAudioCap';
import { readStoredUnit, type Unit } from './units';
import { mergeBaseline } from './unitMergePreview';
import { afterFingerprint, refsIntact } from './unitMergeSnapshot';
import {
  assertChildren,
  childrenOf,
  chosenSeparator,
  draftsOf,
  fieldMap,
  manuscriptOf,
  bumpGeneration,
  noteCount,
  orderedSources,
  receiptsOf,
  storeSeparator,
  type Side,
  type TextRow,
  type TextDraftRow,
  type SqliteDatabase,
  type UnitMergeInput,
  type UnitMergeUndo,
  type MovedRef,
} from './unitMergeShared';

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
          ...(input.unitIds === undefined ? {} : { unitIds: input.unitIds }),
          keepId: input.keepId,
          removeId: input.removeId,
          ...(input.discardAudioIds === undefined
            ? {}
            : { discardAudioIds: input.discardAudioIds }),
        })
    ) {
      throw new Error('merge baseline changed');
    }
    const sources = orderedSources(db, input);
    const earlier = sources[0]!;
    const later = sources[sources.length - 1]!;
    const ids = sources.map((side) => side.unit.id);
    const children = sources.flatMap((side) => childrenOf(db, side.unit.id, side.unit.id));
    const start = earlier.unit.start_ms as number;
    const end = later.unit.end_ms as number;
    assertChildren(children, start, end);
    const separator = chosenSeparator(db, input.separator);
    const drafts = sources.flatMap((side) => draftsOf(db, side.unit.id, side.unit.id));
    if (drafts.length > 0 && input.baseline === undefined && input.newId === undefined)
      throw new Error('merge drafts require confirmation');
    const saveReceipts = sources.flatMap((side) => receiptsOf(db, side.unit.id, side.unit.id));
    const editor = editorText(input);
    const plan = textPlan(
      db,
      sources,
      drafts,
      separator,
      input.discardAudioIds ?? [],
      editor,
      input.textOverrides ?? [],
    );
    const body = plan.bodyOf(earlier.unit.layer_id);
    const kept = sources.filter((side) => side.unit.analysis_graph_json !== null);
    const keepSide =
      kept.length === 1 && graphText(kept[0]!.unit.analysis_graph_json) === body ? kept[0]! : null;
    const keepGraph = keepSide === earlier ? 'earlier' : keepSide === later ? 'later' : null;
    const materials = new Map<string, ReturnType<typeof readAnalysisMaterial>>();
    for (const side of sources) {
      if (side.unit.analysis_graph_json === null || side === keepSide) continue;
      materials.set(side.unit.id, readAnalysisMaterial(db, side.unit.id));
    }
    const newId = input.newId ?? randomUUID();
    const operationId = input.operationId ?? randomUUID();
    const now = new Date().toISOString();
    const place = manuscriptOf(db, earlier.unit.id);
    for (const id of ids) parkUnits(db, id, id);
    for (const side of sources.slice(1).reverse()) {
      shiftSortOrders(db, earlier.unit.layer_id, side.unit.sort_order, 'down', ids, 'gt');
    }
    insertMergedUnit(db, newId, earlier, later, start, end, keepGraph, now);
    db.prepare('UPDATE units SET skip_processing = ? WHERE id = ?').run(
      sources.some((side) => side.unit.skip_processing === 1) ? 1 : 0,
      newId,
    );
    if (keepSide && keepGraph === null)
      db.prepare(
        'UPDATE units SET analysis_graph_json = ?, analysis_generation = ?, graph_fingerprint = ? WHERE id = ?',
      ).run(
        keepSide.unit.analysis_graph_json,
        keepSide.unit.analysis_generation,
        keepSide.unit.graph_fingerprint,
        newId,
      );
    for (const id of ids)
      db.prepare('UPDATE units SET parent_unit_id = ? WHERE parent_unit_id = ?').run(newId, id);
    writeTexts(db, newId, plan, now);
    writeTextRowMaps(db, operationId, plan, now);
    for (const side of sources) {
      archiveGraphs(db, side, side, newId, side === keepSide ? 'earlier' : null, materials);
      db.prepare('UPDATE analysis_candidates SET unit_id = ? WHERE unit_id = ?').run(
        newId,
        side.unit.id,
      );
      db.prepare('UPDATE notes SET unit_id = ? WHERE unit_id = ?').run(newId, side.unit.id);
    }
    db.prepare(
      "UPDATE analysis_candidates SET status = 'rejected', updated_at = ? WHERE unit_id = ? AND kind = 'suggestion' AND status = 'pending'",
    ).run(now, newId);
    for (const move of plan.noteMoves) {
      db.prepare('UPDATE notes SET unit_text_id = ? WHERE unit_text_id = ?').run(
        move.to,
        move.from,
      );
    }
    writeRequiredFieldValues(db, 'unit', newId, mergedFields(db, ids, newId));
    const refs = retargetInbound(db, ids, newId);
    for (const id of ids) {
      deleteUnitTree(db, id);
      db.prepare(
        "INSERT INTO unit_span_maps (operation_id, kind, old_id, new_id, created_at) VALUES (?, 'merge', ?, ?, ?)",
      ).run(operationId, id, newId, now);
    }
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
        sources,
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
    const sources = undo.sources ?? [undo.earlier, undo.later];
    for (const side of sources.slice(1))
      shiftSortOrders(db, layerId, side.unit.sort_order, 'up', [], 'gte');
    for (const side of sources) insertRemovedUnit(db, side);
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
    undo.redoBaseline = mergeBaseline(db, {
      keepId: undo.earlier.unit.id,
      removeId: undo.later.unit.id,
      unitIds: sources.map((side) => side.unit.id),
      discardAudioIds: undo.discardAudioIds,
    });
    return earlier;
  });
  return write();
}

interface PlannedText {
  surviving: TextRow | null;
  insertId: string | null;
  layerId: string;
  role: string;
  body: string;
  selfCertainty: string | null;
  provenance: string | null;
  clips: { id: string; unit_text_id: string; file_id: string; position: number }[];
  dropIds: string[];
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
  sources: Side[],
  drafts: TextDraftRow[],
  separator: string,
  discardAudioIds: string[],
  editor: EditorText | undefined,
  overrides: { layerId: string; text: string }[],
): TextPlan {
  const discard = new Set(discardAudioIds);
  const keys = new Set(
    sources.flatMap((side) => side.texts.map((row) => `${row.layer_id}\n${row.role}`)),
  );
  for (const draft of drafts) keys.add(`${draft.layer_id}\n${layerRole(db, draft.layer_id)}`);
  if (editor) keys.add(`${editor.layerId}\n${layerRole(db, editor.layerId)}`);
  if (new Set(overrides.map((row) => row.layerId)).size !== overrides.length)
    throw new Error('duplicate merge layer');
  for (const row of overrides)
    if (![...keys].some((key) => key.split('\n')[0] === row.layerId))
      throw new Error('merge layer is missing');
  const rows: TextPlan['rows'] = [],
    noteMoves: TextPlan['noteMoves'] = [];
  const bodies = new Map<string, string>();
  for (const key of keys) {
    const [layerId, role] = key.split('\n');
    if (layerId === undefined || layerId === '' || role === undefined || role === '')
      throw new Error('unit merge readback failed');
    const texts = sources.map((side) =>
      side.texts.find((row) => row.layer_id === layerId && row.role === role),
    );
    const pending = sources.map((side) =>
      drafts.find((row) => row.unit_id === side.unit.id && row.layer_id === layerId),
    );
    const parts = sources.map((side, i) =>
      editor?.layerId === layerId && [editor.keepId, editor.removeId].includes(side.unit.id)
        ? side.unit.id === editor.keepId
          ? editor.keep
          : editor.remove
        : (pending[i]?.raw_input ?? texts[i]?.body ?? ''),
    );
    const existing = texts.filter((row): row is TextRow => row !== undefined);
    const keep = (row: TextRow) =>
      audiosOfText(db, row.id).length > 0 ||
      noteCount(db, row.id) > 0 ||
      row.self_certainty !== null;
    if (parts.every((part) => part === '') && !existing.some(keep)) continue;
    const surviving =
      existing.find(keep) ?? existing.find((row) => row.body !== '') ?? existing[0] ?? null;
    const mergedBody = parts.filter((part) => part !== '').join(separator);
    const override = overrides.find((row) => row.layerId === layerId);
    const body = override?.text ?? mergedBody;
    const changed =
      (override !== undefined && body !== mergedBody) ||
      (editor?.layerId === layerId &&
        sources.some(
          (side, i) =>
            [editor.keepId, editor.removeId].includes(side.unit.id) &&
            parts[i] !== (texts[i]?.body ?? ''),
        ));
    const seen = new Set<string>();
    const clips = existing
      .flatMap((row) => audiosOfText(db, row.id))
      .filter((clip) => {
        if (discard.has(clip.id) || seen.has(clip.file_id)) return false;
        seen.add(clip.file_id);
        return true;
      });
    if (clips.length > TEXT_AUDIO_CAP) throw new Error('too many recordings');
    const dropIds = existing.filter((row) => row.id !== surviving?.id).map((row) => row.id);
    for (const from of dropIds) if (surviving) noteMoves.push({ from, to: surviving.id });
    const marked = texts.map((row) => row?.self_certainty ?? null);
    const selfCertainty =
      changed || pending.some(Boolean)
        ? null
        : marked.reduce((a, b) => mergeLayerSelfCertainty(a, b));
    const nonempty = parts.map((part, i) => (part !== '' ? i : -1)).filter((i) => i >= 0);
    const single = nonempty.length === 1 ? nonempty[0]! : -1;
    const provenance =
      changed || nonempty.length > 1
        ? null
        : single >= 0
          ? (pending[single]?.provenance_json ?? texts[single]?.provenance_json ?? null)
          : (surviving?.provenance_json ?? null);
    rows.push({
      surviving,
      insertId: surviving ? null : randomUUID(),
      layerId,
      role,
      body,
      selfCertainty,
      provenance,
      clips,
      dropIds,
    });
    bodies.set(layerId, body);
  }
  return { rows, noteMoves, bodyOf: (layerId) => bodies.get(layerId) ?? '' };
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
    if (row.surviving === null) continue;
    for (const id of row.dropIds) insert.run(operationId, id, row.surviving.id, now);
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
    `INSERT INTO unit_texts (id, unit_id, layer_id, role, body, self_certainty, provenance_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const row of plan.rows) {
    const surviving = row.surviving;
    if (surviving === null) {
      if (row.insertId === null) throw new Error('unit merge readback failed');
      insert.run(
        row.insertId,
        newId,
        row.layerId,
        row.role,
        row.body,
        row.selfCertainty,
        row.provenance,
        now,
      );
      continue;
    }
    const all = [
      ...audiosOfText(db, surviving.id),
      ...row.dropIds.flatMap((id) => audiosOfText(db, id)),
    ];
    const keepFiles = new Set(row.clips.map((clip) => clip.file_id));
    for (const clip of all) {
      db.prepare('DELETE FROM unit_text_audios WHERE id = ?').run(clip.id);
      if (!keepFiles.has(clip.file_id)) queueUnreferencedAttachment(db, clip.file_id);
    }
    db.prepare(
      `UPDATE unit_texts
       SET unit_id = ?, body = ?, self_certainty = ?, provenance_json = ?, updated_at = ?
       WHERE id = ?`,
    ).run(newId, row.body, row.selfCertainty, row.provenance, now, surviving.id);
    row.clips.forEach((clip, index) => {
      insertTextAudio(db, { ...clip, unit_text_id: surviving.id, position: index + 1 });
    });
  }
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
  for (const [name, side] of earlier === later
    ? [['earlier', earlier] as const]
    : [['earlier', earlier] as const, ['later', later] as const]) {
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

function mergedFields(db: SqliteDatabase, ids: string[], newId: string): Record<string, unknown> {
  const from = new Set(ids),
    merged: Record<string, unknown> = {};
  for (const id of ids)
    for (const [key, value] of Object.entries(retargetFields(fieldMap(db, id), from, newId))) {
      if (key in merged && JSON.stringify(merged[key]) !== JSON.stringify(value))
        throw new Error('custom fields differ');
      merged[key] = value;
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

function retargetInbound(db: SqliteDatabase, ids: string[], newId: string): MovedRef[] {
  const from = new Set(ids);
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
  db.prepare(
    `INSERT INTO units (
      id, layer_id, speaker_id, parent_unit_id, start_ms, end_ms, confidence, skip_processing,
      sort_order, created_at, updated_at, analysis_graph_json, analysis_generation,
      graph_fingerprint
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId,
    earlier.unit.layer_id,
    earlier.unit.speaker_id,
    earlier.unit.parent_unit_id,
    start,
    end,
    earlier.unit.skip_processing === 1 || later.unit.skip_processing === 1 ? 1 : 0,
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
