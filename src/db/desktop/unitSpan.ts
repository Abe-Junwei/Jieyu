import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  analysisGraphFingerprint,
  type AnalysisGraphPayload,
} from '../../annotation/analysisGraphDomain';
import { assertUnitTextRoleFree, getUnit, type Unit } from './units';

type SqliteDatabase = InstanceType<typeof Database>;

const MIN_SPLIT_SPAN = 0.05;

export interface UnitSplitUndo {
  unitId: string;
  createdId: string;
  startTime: number;
  splitTime: number;
  restoredEnd: number;
  text: string;
  speakerId: string | null;
  parentUnitId: string | null;
  manuscriptId: string;
  manuscriptGeneration: number;
  noteIds: string[];
  tokenIds: string[];
  morphemeIds: string[];
  linkIds: string[];
}

interface UnitRow {
  id: string;
  layer_id: string;
  speaker_id: string | null;
  parent_unit_id: string | null;
  start_time: number;
  end_time: number;
  created_at: string;
  updated_at: string;
  analysis_graph_json: string | null;
  analysis_generation: number;
  graph_fingerprint: string;
}

interface TextRow {
  id: string;
  role: string;
  body: string;
  provenance_json: string | null;
  updated_at: string;
}

interface TokenRow {
  id: string;
  token_index: number;
  form_json: string;
  gloss_json: string;
  pos: string | null;
  provenance_json: string | null;
  created_at: string;
  updated_at: string;
}

interface MorphemeRow {
  id: string;
  token_id: string;
  morpheme_index: number;
  form_json: string;
  gloss_json: string;
  pos: string | null;
  provenance_json: string | null;
  surface_parts_json: string;
  created_at: string;
  updated_at: string;
}

interface NoteRow {
  id: string;
  anchor_kind: string;
  project_id: string | null;
  manuscript_id: string | null;
  layer_id: string | null;
  unit_id: string | null;
  unit_text_id: string | null;
  token_id: string | null;
  morpheme_id: string | null;
  node_id: string | null;
  view: string | null;
  content_json: string;
  category: string | null;
  provenance_json: string | null;
  attachment: string;
  created_at: string;
  updated_at: string;
}

interface LinkRow {
  id: string;
  target_type: string;
  target_id: string;
  lexeme_id: string;
  sense_id: string | null;
  role: string | null;
  confidence: number | null;
  provenance_json: string | null;
  attachment: string;
  created_at: string;
  updated_at: string;
}

interface CandidateRow {
  id: string;
  kind: string;
  status: string;
  graph_json: string;
  graph_fingerprint: string;
  manuscript_generation: number;
  analysis_generation: number;
  lifecycle_generation: number;
  text: string;
  projection_json: string;
  links_json: string;
  notes_json: string;
  definition_revisions_json: string;
  redacted_definition_ids_json: string;
  actor_json: string | null;
  created_at: string;
  updated_at: string;
}

interface FieldRow {
  definition_id: string;
  target_type: string;
  target_id: string;
  value_json: string;
  updated_at: string;
}

interface BatchRow {
  id: string;
  source_kind: string;
  created_at: string;
}

interface LocalIdRow {
  batch_id: string;
  scope: string;
  local_id: string;
  project_id: string;
}

interface AcceptanceRow {
  id: string;
  operation_id: string;
  run_id: string;
  candidate_id: string;
  created_at: string;
}

interface RemovedUnit {
  unit: UnitRow;
  texts: TextRow[];
  tokens: TokenRow[];
  morphemes: MorphemeRow[];
  notes: NoteRow[];
  links: LinkRow[];
  candidates: CandidateRow[];
  fields: FieldRow[];
  batches: BatchRow[];
  localIds: LocalIdRow[];
  acceptances: AcceptanceRow[];
}

export interface UnitMergeUndo {
  keepId: string;
  removeId: string;
  keepStart: number;
  keepEnd: number;
  keepText: string;
  keepFingerprint: string;
  mergedStart: number;
  mergedEnd: number;
  manuscriptId: string;
  manuscriptGeneration: number;
  removed: RemovedUnit;
}

export function splitUnit(
  db: SqliteDatabase,
  input: { unitId: string; time: number },
  afterWrite?: () => void,
): { left: Unit; right: Unit; undo: UnitSplitUndo } {
  if (!Number.isFinite(input.time)) throw new Error('split point is outside the unit');
  const write = db.transaction(() => {
    const existing = requireLiveUnit(db, input.unitId);
    if (
      input.time - existing.startTime < MIN_SPLIT_SPAN ||
      existing.endTime - input.time < MIN_SPLIT_SPAN
    ) {
      throw new Error('split point is outside the unit');
    }
    const place = manuscriptOf(db, existing.id);
    const createdId = randomUUID();
    const now = new Date().toISOString();
    db.prepare('UPDATE units SET end_time = ?, updated_at = ? WHERE id = ?').run(
      input.time,
      now,
      existing.id,
    );
    db.prepare(
      `INSERT INTO units (
        id, layer_id, speaker_id, parent_unit_id, start_time, end_time, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      createdId,
      existing.layerId,
      existing.speakerId,
      existing.parentUnitId,
      input.time,
      existing.endTime,
      now,
      now,
    );
    assertUnitTextRoleFree(db, createdId, 'transcription');
    db.prepare(
      `INSERT INTO unit_texts (id, unit_id, role, body, updated_at)
       VALUES (?, ?, 'transcription', ?, ?)`,
    ).run(randomUUID(), createdId, existing.text, now);
    const copied = copyAssociations(db, existing.id, createdId);
    bumpGeneration(db, place.manuscriptId, now);
    afterWrite?.();
    const left = getUnit(db, existing.id);
    const right = getUnit(db, createdId);
    const generation = generationOf(db, place.manuscriptId);
    if (
      !left ||
      !right ||
      left.endTime !== input.time ||
      left.text !== existing.text ||
      right.startTime !== input.time ||
      right.endTime !== existing.endTime ||
      right.text !== existing.text ||
      generation !== place.generation + 1 ||
      countTokens(db, createdId) !== copied.tokenIds.length
    ) {
      throw new Error('unit split readback failed');
    }
    return {
      left,
      right,
      undo: {
        unitId: existing.id,
        createdId,
        startTime: existing.startTime,
        splitTime: input.time,
        restoredEnd: existing.endTime,
        text: existing.text,
        speakerId: existing.speakerId,
        parentUnitId: existing.parentUnitId,
        manuscriptId: place.manuscriptId,
        manuscriptGeneration: generation,
        ...copied,
      },
    };
  });
  return write();
}

export function undoSplit(db: SqliteDatabase, undo: UnitSplitUndo, afterWrite?: () => void): Unit {
  const write = db.transaction(() => {
    if (!splitStillAfter(db, undo)) throw new Error('unit split undo is stale');
    const now = new Date().toISOString();
    deleteUnitTree(db, undo.createdId);
    db.prepare('UPDATE units SET end_time = ?, updated_at = ? WHERE id = ?').run(
      undo.restoredEnd,
      now,
      undo.unitId,
    );
    bumpGeneration(db, undo.manuscriptId, now);
    afterWrite?.();
    const unit = getUnit(db, undo.unitId);
    const created = getUnit(db, undo.createdId);
    if (
      !unit ||
      created !== null ||
      unit.startTime !== undo.startTime ||
      unit.endTime !== undo.restoredEnd ||
      unit.text !== undo.text ||
      generationOf(db, undo.manuscriptId) !== undo.manuscriptGeneration + 1 ||
      countTokens(db, undo.createdId) !== 0
    ) {
      throw new Error('unit split undo readback failed');
    }
    return unit;
  });
  return write();
}

export function mergeUnits(
  db: SqliteDatabase,
  input: { keepId: string; removeId: string },
  afterWrite?: () => void,
): { unit: Unit; undo: UnitMergeUndo } {
  const write = db.transaction(() => {
    const keep = requireLiveUnit(db, input.keepId);
    const remove = requireLiveUnit(db, input.removeId);
    if (keep.id === remove.id || keep.layerId !== remove.layerId) {
      throw new Error('units are not in the same layer');
    }
    const adjacent = keep.endTime === remove.startTime || remove.endTime === keep.startTime;
    if (!adjacent) throw new Error('units are not adjacent');
    const place = manuscriptOf(db, keep.id);
    const keepFingerprint = fingerprintOf(db, keep.id);
    const removed = readRemovedUnit(db, remove.id);
    const mergedStart = Math.min(keep.startTime, remove.startTime);
    const mergedEnd = Math.max(keep.endTime, remove.endTime);
    const now = new Date().toISOString();
    db.prepare('UPDATE units SET start_time = ?, end_time = ?, updated_at = ? WHERE id = ?').run(
      mergedStart,
      mergedEnd,
      now,
      keep.id,
    );
    deleteUnitTree(db, remove.id);
    bumpGeneration(db, place.manuscriptId, now);
    afterWrite?.();
    const unit = getUnit(db, keep.id);
    const gone = getUnit(db, remove.id);
    if (
      !unit ||
      gone !== null ||
      unit.startTime !== mergedStart ||
      unit.endTime !== mergedEnd ||
      unit.text !== keep.text ||
      fingerprintOf(db, keep.id) !== keepFingerprint ||
      generationOf(db, place.manuscriptId) !== place.generation + 1
    ) {
      throw new Error('unit merge readback failed');
    }
    return {
      unit,
      undo: {
        keepId: keep.id,
        removeId: remove.id,
        keepStart: keep.startTime,
        keepEnd: keep.endTime,
        keepText: keep.text,
        keepFingerprint,
        mergedStart,
        mergedEnd,
        manuscriptId: place.manuscriptId,
        manuscriptGeneration: place.generation + 1,
        removed,
      },
    };
  });
  return write();
}

export function undoMerge(db: SqliteDatabase, undo: UnitMergeUndo, afterWrite?: () => void): Unit {
  const write = db.transaction(() => {
    if (!mergeStillAfter(db, undo)) throw new Error('unit merge undo is stale');
    const now = new Date().toISOString();
    db.prepare('UPDATE units SET start_time = ?, end_time = ?, updated_at = ? WHERE id = ?').run(
      undo.keepStart,
      undo.keepEnd,
      now,
      undo.keepId,
    );
    insertRemovedUnit(db, undo.removed);
    bumpGeneration(db, undo.manuscriptId, now);
    afterWrite?.();
    const keep = getUnit(db, undo.keepId);
    const removed = getUnit(db, undo.removeId);
    if (
      !keep ||
      !removed ||
      keep.startTime !== undo.keepStart ||
      keep.endTime !== undo.keepEnd ||
      keep.text !== undo.keepText ||
      fingerprintOf(db, undo.keepId) !== undo.keepFingerprint ||
      removed.startTime !== undo.removed.unit.start_time ||
      removed.endTime !== undo.removed.unit.end_time ||
      removed.text !== undo.removed.texts.find((row) => row.role === 'transcription')?.body ||
      generationOf(db, undo.manuscriptId) !== undo.manuscriptGeneration + 1
    ) {
      throw new Error('unit merge undo readback failed');
    }
    return keep;
  });
  return write();
}

function requireLiveUnit(db: SqliteDatabase, id: string): Unit {
  const unit = getUnit(db, id);
  if (!unit) throw new Error('unit is missing');
  return unit;
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

function fingerprintOf(db: SqliteDatabase, unitId: string): string {
  const row = db.prepare('SELECT graph_fingerprint FROM units WHERE id = ?').get(unitId) as
    { graph_fingerprint: string } | undefined;
  return row?.graph_fingerprint ?? '';
}

function countTokens(db: SqliteDatabase, unitId: string): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM tokens WHERE unit_id = ?').get(unitId) as {
    n: number;
  };
  return row.n;
}

function copyAssociations(
  db: SqliteDatabase,
  fromId: string,
  toId: string,
): Pick<UnitSplitUndo, 'noteIds' | 'tokenIds' | 'morphemeIds' | 'linkIds'> {
  const tokenRows = db
    .prepare(
      `SELECT id, token_index, form_json, gloss_json, pos, provenance_json, created_at, updated_at
       FROM tokens WHERE unit_id = ? ORDER BY token_index, id`,
    )
    .all(fromId) as TokenRow[];
  const tokenMap = new Map<string, string>();
  const insertToken = db.prepare(
    `INSERT INTO tokens (
      id, unit_id, token_index, form_json, gloss_json, pos, provenance_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const row of tokenRows) {
    const id = randomUUID();
    tokenMap.set(row.id, id);
    insertToken.run(
      id,
      toId,
      row.token_index,
      row.form_json,
      row.gloss_json,
      row.pos,
      row.provenance_json,
      row.created_at,
      row.updated_at,
    );
  }
  const morphemeMap = new Map<string, string>();
  const morphemes =
    tokenRows.length === 0
      ? []
      : morphemesOf(
          db,
          tokenRows.map((row) => row.id),
        );
  const insertMorpheme = db.prepare(
    `INSERT INTO morphemes (
      id, token_id, morpheme_index, form_json, gloss_json, pos, provenance_json,
      surface_parts_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const row of morphemes) {
    const tokenId = tokenMap.get(row.token_id);
    if (tokenId === undefined) continue;
    const id = randomUUID();
    morphemeMap.set(row.id, id);
    insertMorpheme.run(
      id,
      tokenId,
      row.morpheme_index,
      row.form_json,
      row.gloss_json,
      row.pos,
      row.provenance_json,
      retargetSurface(row.surface_parts_json, tokenMap),
      row.created_at,
      row.updated_at,
    );
  }
  const linkIds: string[] = [];
  const insertLink = db.prepare(
    `INSERT INTO token_lexeme_links (
      id, target_type, target_id, lexeme_id, sense_id, role, confidence, provenance_json,
      attachment, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const [fromTarget, toTarget] of [...tokenMap, ...morphemeMap]) {
    const links = db
      .prepare(
        `SELECT id, target_type, target_id, lexeme_id, sense_id, role, confidence, provenance_json,
                attachment, created_at, updated_at
         FROM token_lexeme_links WHERE target_id = ? AND attachment = 'active'`,
      )
      .all(fromTarget) as LinkRow[];
    for (const link of links) {
      const id = randomUUID();
      linkIds.push(id);
      insertLink.run(
        id,
        link.target_type,
        toTarget,
        link.lexeme_id,
        link.sense_id,
        link.role,
        link.confidence,
        link.provenance_json,
        'active',
        link.created_at,
        link.updated_at,
      );
    }
  }
  const noteIds: string[] = [];
  const insertNote = db.prepare(
    `INSERT INTO notes (
      id, anchor_kind, project_id, manuscript_id, layer_id, unit_id, unit_text_id,
      token_id, morpheme_id, node_id, view, content_json, category, provenance_json,
      attachment, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const note of notesOf(db, fromId)) {
    const tokenId = note.token_id === null ? null : (tokenMap.get(note.token_id) ?? null);
    const morphemeId =
      note.morpheme_id === null ? null : (morphemeMap.get(note.morpheme_id) ?? null);
    if (note.anchor_kind === 'analysis_node' || note.anchor_kind === 'unit_text') continue;
    if (note.anchor_kind === 'token' && tokenId === null) continue;
    if (note.anchor_kind === 'morpheme' && (tokenId === null || morphemeId === null)) continue;
    if (
      note.anchor_kind !== 'unit' &&
      note.anchor_kind !== 'token' &&
      note.anchor_kind !== 'morpheme'
    ) {
      continue;
    }
    const id = randomUUID();
    noteIds.push(id);
    insertNote.run(
      id,
      note.anchor_kind,
      note.project_id,
      note.manuscript_id,
      null,
      toId,
      null,
      tokenId,
      morphemeId,
      null,
      note.view,
      note.content_json,
      note.category,
      note.provenance_json,
      note.attachment,
      note.created_at,
      note.updated_at,
    );
  }
  copyGraph(db, fromId, toId, tokenMap, morphemeMap);
  return {
    noteIds,
    tokenIds: [...tokenMap.values()],
    morphemeIds: [...morphemeMap.values()],
    linkIds,
  };
}

function copyGraph(
  db: SqliteDatabase,
  fromId: string,
  toId: string,
  tokenMap: ReadonlyMap<string, string>,
  morphemeMap: ReadonlyMap<string, string>,
): void {
  const row = db.prepare('SELECT analysis_graph_json FROM units WHERE id = ?').get(fromId) as
    { analysis_graph_json: string | null } | undefined;
  if (row?.analysis_graph_json == null) return;
  const graph = JSON.parse(row.analysis_graph_json) as AnalysisGraphPayload;
  const idMap = new Map<string, string>([...tokenMap, ...morphemeMap]);
  for (const node of graph.nodes) {
    if (!idMap.has(node.id)) idMap.set(node.id, randomUUID());
  }
  const remap = (id: string) => idMap.get(id) ?? id;
  for (const node of graph.nodes) node.id = remap(node.id);
  for (const relation of graph.relations) {
    relation.id = randomUUID();
    relation.sourceId = remap(relation.sourceId);
    relation.targetId = remap(relation.targetId);
  }
  graph.id = randomUUID();
  db.prepare(
    `UPDATE units
     SET analysis_graph_json = ?, analysis_generation = 1, graph_fingerprint = ?
     WHERE id = ?`,
  ).run(JSON.stringify(graph), analysisGraphFingerprint(graph), toId);
}

function retargetSurface(json: string, tokenMap: ReadonlyMap<string, string>): string {
  const parts = JSON.parse(json) as { tokenId?: string }[];
  return JSON.stringify(
    parts.map((part) => {
      if (typeof part.tokenId !== 'string') return part;
      const tokenId = tokenMap.get(part.tokenId);
      return tokenId === undefined ? part : { ...part, tokenId };
    }),
  );
}

function splitStillAfter(db: SqliteDatabase, undo: UnitSplitUndo): boolean {
  const left = getUnit(db, undo.unitId);
  const right = getUnit(db, undo.createdId);
  if (
    !left ||
    !right ||
    left.startTime !== undo.startTime ||
    left.endTime !== undo.splitTime ||
    left.text !== undo.text ||
    left.speakerId !== undo.speakerId ||
    left.parentUnitId !== undo.parentUnitId ||
    right.startTime !== undo.splitTime ||
    right.endTime !== undo.restoredEnd ||
    right.text !== undo.text ||
    right.speakerId !== undo.speakerId ||
    right.parentUnitId !== undo.parentUnitId ||
    generationOf(db, undo.manuscriptId) !== undo.manuscriptGeneration
  ) {
    return false;
  }
  return (
    sameIds(idsOf(db, 'SELECT id FROM notes WHERE unit_id = ?', undo.createdId), undo.noteIds) &&
    sameIds(idsOf(db, 'SELECT id FROM tokens WHERE unit_id = ?', undo.createdId), undo.tokenIds) &&
    sameIds(morphemeIdsOf(db, undo.tokenIds), undo.morphemeIds) &&
    sameIds(linkIdsOf(db, [...undo.tokenIds, ...undo.morphemeIds]), undo.linkIds)
  );
}

function mergeStillAfter(db: SqliteDatabase, undo: UnitMergeUndo): boolean {
  const keep = getUnit(db, undo.keepId);
  return (
    keep !== null &&
    getUnit(db, undo.removeId) === null &&
    keep.startTime === undo.mergedStart &&
    keep.endTime === undo.mergedEnd &&
    keep.text === undo.keepText &&
    fingerprintOf(db, undo.keepId) === undo.keepFingerprint &&
    generationOf(db, undo.manuscriptId) === undo.manuscriptGeneration
  );
}

function readRemovedUnit(db: SqliteDatabase, unitId: string): RemovedUnit {
  const unit = db
    .prepare(
      `SELECT id, layer_id, speaker_id, parent_unit_id, start_time, end_time, created_at, updated_at,
              analysis_graph_json, analysis_generation, graph_fingerprint
       FROM units WHERE id = ?`,
    )
    .get(unitId) as UnitRow | undefined;
  if (!unit) throw new Error('unit is missing');
  const tokenIds = idsOf(db, 'SELECT id FROM tokens WHERE unit_id = ?', unitId);
  const morphemeIds = morphemeIdsOf(db, tokenIds);
  const noteIds = idsOf(db, 'SELECT id FROM notes WHERE unit_id = ?', unitId);
  const batches = db
    .prepare('SELECT id, source_kind, created_at FROM reception_batches WHERE unit_id = ?')
    .all(unitId) as BatchRow[];
  return {
    unit,
    texts: db
      .prepare(
        `SELECT id, role, body, provenance_json, updated_at FROM unit_texts WHERE unit_id = ?`,
      )
      .all(unitId) as TextRow[],
    tokens: db
      .prepare(
        `SELECT id, token_index, form_json, gloss_json, pos, provenance_json, created_at, updated_at
         FROM tokens WHERE unit_id = ?`,
      )
      .all(unitId) as TokenRow[],
    morphemes: morphemeIds.length === 0 ? [] : morphemesOf(db, tokenIds),
    notes: notesOf(db, unitId),
    links: linksOf(db, [...tokenIds, ...morphemeIds, ...nodeIdsOf(unit.analysis_graph_json)]),
    candidates: db
      .prepare(
        `SELECT id, kind, status, graph_json, graph_fingerprint, manuscript_generation,
                analysis_generation, lifecycle_generation, text, projection_json, links_json,
                notes_json, definition_revisions_json, redacted_definition_ids_json, actor_json,
                created_at, updated_at
         FROM analysis_candidates WHERE unit_id = ?`,
      )
      .all(unitId) as CandidateRow[],
    fields: fieldsOf(
      db,
      ['unit', unitId],
      noteIds.map((id) => ['note', id] as [string, string]),
    ),
    batches,
    localIds: batches.flatMap(
      (batch) =>
        db
          .prepare(
            'SELECT batch_id, scope, local_id, project_id FROM local_id_map WHERE batch_id = ?',
          )
          .all(batch.id) as LocalIdRow[],
    ),
    acceptances: db
      .prepare(
        `SELECT id, operation_id, run_id, candidate_id, created_at
         FROM transcription_acceptances WHERE unit_id = ?`,
      )
      .all(unitId) as AcceptanceRow[],
  };
}

function insertRemovedUnit(db: SqliteDatabase, removed: RemovedUnit): void {
  const unit = removed.unit;
  db.prepare(
    `INSERT INTO units (
      id, layer_id, speaker_id, parent_unit_id, start_time, end_time, created_at, updated_at,
      analysis_graph_json, analysis_generation, graph_fingerprint
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    unit.id,
    unit.layer_id,
    unit.speaker_id,
    unit.parent_unit_id,
    unit.start_time,
    unit.end_time,
    unit.created_at,
    unit.updated_at,
    unit.analysis_graph_json,
    unit.analysis_generation,
    unit.graph_fingerprint,
  );
  const insertText = db.prepare(
    `INSERT INTO unit_texts (id, unit_id, role, body, provenance_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const row of removed.texts) {
    assertUnitTextRoleFree(db, unit.id, row.role);
    insertText.run(row.id, unit.id, row.role, row.body, row.provenance_json, row.updated_at);
  }
  const insertToken = db.prepare(
    `INSERT INTO tokens (
      id, unit_id, token_index, form_json, gloss_json, pos, provenance_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const row of removed.tokens) {
    insertToken.run(
      row.id,
      unit.id,
      row.token_index,
      row.form_json,
      row.gloss_json,
      row.pos,
      row.provenance_json,
      row.created_at,
      row.updated_at,
    );
  }
  const insertMorpheme = db.prepare(
    `INSERT INTO morphemes (
      id, token_id, morpheme_index, form_json, gloss_json, pos, provenance_json,
      surface_parts_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const row of removed.morphemes) {
    insertMorpheme.run(
      row.id,
      row.token_id,
      row.morpheme_index,
      row.form_json,
      row.gloss_json,
      row.pos,
      row.provenance_json,
      row.surface_parts_json,
      row.created_at,
      row.updated_at,
    );
  }
  const insertNote = db.prepare(
    `INSERT INTO notes (
      id, anchor_kind, project_id, manuscript_id, layer_id, unit_id, unit_text_id,
      token_id, morpheme_id, node_id, view, content_json, category, provenance_json,
      attachment, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const row of removed.notes) insertNote.run(...noteValues(row));
  const insertLink = db.prepare(
    `INSERT INTO token_lexeme_links (
      id, target_type, target_id, lexeme_id, sense_id, role, confidence, provenance_json,
      attachment, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const row of removed.links) {
    insertLink.run(
      row.id,
      row.target_type,
      row.target_id,
      row.lexeme_id,
      row.sense_id,
      row.role,
      row.confidence,
      row.provenance_json,
      row.attachment,
      row.created_at,
      row.updated_at,
    );
  }
  const insertCandidate = db.prepare(
    `INSERT INTO analysis_candidates (
      id, unit_id, kind, status, graph_json, graph_fingerprint, manuscript_generation,
      analysis_generation, lifecycle_generation, text, projection_json, links_json, notes_json,
      definition_revisions_json, redacted_definition_ids_json, actor_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const row of removed.candidates) {
    insertCandidate.run(
      row.id,
      unit.id,
      row.kind,
      row.status,
      row.graph_json,
      row.graph_fingerprint,
      row.manuscript_generation,
      row.analysis_generation,
      row.lifecycle_generation,
      row.text,
      row.projection_json,
      row.links_json,
      row.notes_json,
      row.definition_revisions_json,
      row.redacted_definition_ids_json,
      row.actor_json,
      row.created_at,
      row.updated_at,
    );
  }
  const insertField = db.prepare(
    `INSERT INTO custom_field_values (definition_id, target_type, target_id, value_json, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  for (const row of removed.fields) {
    insertField.run(
      row.definition_id,
      row.target_type,
      row.target_id,
      row.value_json,
      row.updated_at,
    );
  }
  const insertBatch = db.prepare(
    `INSERT INTO reception_batches (id, unit_id, source_kind, created_at) VALUES (?, ?, ?, ?)`,
  );
  for (const row of removed.batches)
    insertBatch.run(row.id, unit.id, row.source_kind, row.created_at);
  const insertLocal = db.prepare(
    `INSERT INTO local_id_map (batch_id, scope, local_id, project_id) VALUES (?, ?, ?, ?)`,
  );
  for (const row of removed.localIds) {
    insertLocal.run(row.batch_id, row.scope, row.local_id, row.project_id);
  }
  const insertAcceptance = db.prepare(
    `INSERT INTO transcription_acceptances (
      id, operation_id, run_id, candidate_id, unit_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const row of removed.acceptances) {
    insertAcceptance.run(
      row.id,
      row.operation_id,
      row.run_id,
      row.candidate_id,
      unit.id,
      row.created_at,
    );
  }
}

function deleteUnitTree(db: SqliteDatabase, unitId: string): void {
  const tokenIds = idsOf(db, 'SELECT id FROM tokens WHERE unit_id = ?', unitId);
  const morphemeIds = morphemeIdsOf(db, tokenIds);
  const noteIds = idsOf(db, 'SELECT id FROM notes WHERE unit_id = ?', unitId);
  const graph = db.prepare('SELECT analysis_graph_json FROM units WHERE id = ?').get(unitId) as
    { analysis_graph_json: string | null } | undefined;
  const targets = [...tokenIds, ...morphemeIds, ...nodeIdsOf(graph?.analysis_graph_json ?? null)];
  for (const targetId of targets) {
    db.prepare('DELETE FROM token_lexeme_links WHERE target_id = ?').run(targetId);
  }
  for (const noteId of noteIds) {
    db.prepare(`DELETE FROM custom_field_values WHERE target_type = 'note' AND target_id = ?`).run(
      noteId,
    );
  }
  db.prepare(`DELETE FROM custom_field_values WHERE target_type = 'unit' AND target_id = ?`).run(
    unitId,
  );
  db.prepare('DELETE FROM notes WHERE unit_id = ?').run(unitId);
  if (morphemeIds.length > 0) {
    db.prepare(`DELETE FROM morphemes WHERE id IN (${marks(morphemeIds)})`).run(...morphemeIds);
  }
  db.prepare('DELETE FROM tokens WHERE unit_id = ?').run(unitId);
  db.prepare('DELETE FROM analysis_candidates WHERE unit_id = ?').run(unitId);
  const batches = idsOf(db, 'SELECT id FROM reception_batches WHERE unit_id = ?', unitId);
  for (const batchId of batches) {
    db.prepare('DELETE FROM local_id_map WHERE batch_id = ?').run(batchId);
  }
  db.prepare('DELETE FROM reception_batches WHERE unit_id = ?').run(unitId);
  db.prepare('DELETE FROM transcription_acceptances WHERE unit_id = ?').run(unitId);
  db.prepare('DELETE FROM unit_texts WHERE unit_id = ?').run(unitId);
  db.prepare('DELETE FROM units WHERE id = ?').run(unitId);
}

function notesOf(db: SqliteDatabase, unitId: string): NoteRow[] {
  return db
    .prepare(
      `SELECT id, anchor_kind, project_id, manuscript_id, layer_id, unit_id, unit_text_id,
              token_id, morpheme_id, node_id, view, content_json, category, provenance_json,
              attachment, created_at, updated_at
       FROM notes WHERE unit_id = ?`,
    )
    .all(unitId) as NoteRow[];
}

function morphemesOf(db: SqliteDatabase, tokenIds: readonly string[]): MorphemeRow[] {
  if (tokenIds.length === 0) return [];
  return db
    .prepare(
      `SELECT id, token_id, morpheme_index, form_json, gloss_json, pos, provenance_json,
              surface_parts_json, created_at, updated_at
       FROM morphemes WHERE token_id IN (${marks(tokenIds)})`,
    )
    .all(...tokenIds) as MorphemeRow[];
}

function linksOf(db: SqliteDatabase, targetIds: readonly string[]): LinkRow[] {
  const seen = new Set<string>();
  const links: LinkRow[] = [];
  const select = db.prepare(
    `SELECT id, target_type, target_id, lexeme_id, sense_id, role, confidence, provenance_json,
            attachment, created_at, updated_at
     FROM token_lexeme_links WHERE target_id = ?`,
  );
  for (const targetId of targetIds) {
    for (const row of select.all(targetId) as LinkRow[]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      links.push(row);
    }
  }
  return links;
}

function fieldsOf(
  db: SqliteDatabase,
  unit: [string, string],
  notes: readonly [string, string][],
): FieldRow[] {
  const select = db.prepare(
    `SELECT definition_id, target_type, target_id, value_json, updated_at
     FROM custom_field_values WHERE target_type = ? AND target_id = ?`,
  );
  return [unit, ...notes].flatMap((pair) => select.all(...pair) as FieldRow[]);
}

function nodeIdsOf(json: string | null): string[] {
  if (json === null) return [];
  const parsed = JSON.parse(json) as { nodes?: { id?: unknown }[] };
  if (!Array.isArray(parsed.nodes)) return [];
  return parsed.nodes.flatMap((node) => (typeof node.id === 'string' ? [node.id] : []));
}

function idsOf(db: SqliteDatabase, sql: string, id: string): string[] {
  return (db.prepare(sql).all(id) as { id: string }[]).map((row) => row.id);
}

function morphemeIdsOf(db: SqliteDatabase, tokenIds: readonly string[]): string[] {
  if (tokenIds.length === 0) return [];
  return (
    db
      .prepare(`SELECT id FROM morphemes WHERE token_id IN (${marks(tokenIds)})`)
      .all(...tokenIds) as {
      id: string;
    }[]
  ).map((row) => row.id);
}

function linkIdsOf(db: SqliteDatabase, targetIds: readonly string[]): string[] {
  return linksOf(db, targetIds).map((row) => row.id);
}

function sameIds(actual: readonly string[], expected: readonly string[]): boolean {
  if (actual.length !== expected.length) return false;
  const wanted = [...expected].sort();
  return [...actual].sort().every((id, index) => id === wanted[index]);
}

function marks(ids: readonly string[]): string {
  return ids.map(() => '?').join(', ');
}

function noteValues(row: NoteRow): unknown[] {
  return [
    row.id,
    row.anchor_kind,
    row.project_id,
    row.manuscript_id,
    row.layer_id,
    row.unit_id,
    row.unit_text_id,
    row.token_id,
    row.morpheme_id,
    row.node_id,
    row.view,
    row.content_json,
    row.category,
    row.provenance_json,
    row.attachment,
    row.created_at,
    row.updated_at,
  ];
}
