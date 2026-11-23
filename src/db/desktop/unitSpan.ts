import type Database from 'better-sqlite3';
import { queueUnreferencedAttachment, retainReferencedAttachment } from './attachments';
import { assertUnitTextRoleFree } from './units';
import {
  audiosOfUnit,
  fileIdsOfUnit,
  insertTextAudio,
  type StoredTextAudio,
} from './unitTextAudios';

type SqliteDatabase = InstanceType<typeof Database>;

interface UnitRow {
  id: string;
  layer_id: string;
  speaker_id: string | null;
  parent_unit_id: string | null;
  start_ms: number | null;
  end_ms: number | null;
  confidence: number | null;
  skip_processing: number;
  self_certainty: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  analysis_graph_json: string | null;
  analysis_generation: number;
  graph_fingerprint: string;
}

interface TextRow {
  id: string;
  layer_id: string;
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

interface TimeDraftRow {
  unit_id: string;
  edge: string;
  raw_input: string;
  base_ms: number;
  issue: string | null;
  updated_at: string;
}

export interface RemovedUnit {
  unit: UnitRow;
  texts: TextRow[];
  audios: StoredTextAudio[];
  tokens: TokenRow[];
  morphemes: MorphemeRow[];
  notes: NoteRow[];
  links: LinkRow[];
  candidates: CandidateRow[];
  fields: FieldRow[];
  batches: BatchRow[];
  localIds: LocalIdRow[];
  acceptances: AcceptanceRow[];
  timeDrafts: TimeDraftRow[];
}

export function readRemovedUnit(db: SqliteDatabase, unitId: string): RemovedUnit {
  const unit = db
    .prepare(
      `SELECT id, layer_id, speaker_id, parent_unit_id, start_ms, end_ms, confidence, skip_processing,
              self_certainty, sort_order, created_at, updated_at, analysis_graph_json,
              analysis_generation, graph_fingerprint
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
        `SELECT id, layer_id, role, body, provenance_json, updated_at
         FROM unit_texts WHERE unit_id = ?`,
      )
      .all(unitId) as TextRow[],
    audios: audiosOfUnit(db, unitId),
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
    timeDrafts: db
      .prepare(
        `SELECT unit_id, edge, raw_input, base_ms, issue, updated_at
         FROM unit_time_drafts WHERE unit_id = ?`,
      )
      .all(unitId) as TimeDraftRow[],
  };
}

export function insertRemovedUnit(db: SqliteDatabase, removed: RemovedUnit): void {
  const unit = removed.unit;
  db.prepare(
    `INSERT INTO units (
      id, layer_id, speaker_id, parent_unit_id, start_ms, end_ms, confidence, skip_processing,
      self_certainty, sort_order, created_at, updated_at, analysis_graph_json, analysis_generation,
      graph_fingerprint
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    unit.id,
    unit.layer_id,
    unit.speaker_id,
    unit.parent_unit_id,
    unit.start_ms,
    unit.end_ms,
    unit.confidence ?? null,
    unit.skip_processing ?? 0,
    unit.self_certainty ?? null,
    unit.sort_order,
    unit.created_at,
    unit.updated_at,
    unit.analysis_graph_json,
    unit.analysis_generation,
    unit.graph_fingerprint,
  );
  const insertText = db.prepare(
    `INSERT INTO unit_texts (
       id, unit_id, layer_id, role, body, provenance_json, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const row of removed.texts) {
    assertUnitTextRoleFree(db, unit.id, row.role, row.layer_id);
    insertText.run(
      row.id,
      unit.id,
      row.layer_id,
      row.role,
      row.body,
      row.provenance_json,
      row.updated_at,
    );
  }
  for (const row of removed.audios) {
    insertTextAudio(db, row);
    retainReferencedAttachment(db, row.file_id);
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
  const insertTimeDraft = db.prepare(
    `INSERT INTO unit_time_drafts (unit_id, edge, raw_input, base_ms, issue, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const row of removed.timeDrafts) {
    insertTimeDraft.run(unit.id, row.edge, row.raw_input, row.base_ms, row.issue, row.updated_at);
  }
}

export function deleteUnitTree(db: SqliteDatabase, unitId: string): void {
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
  const clips = fileIdsOfUnit(db, unitId);
  db.prepare('DELETE FROM unit_texts WHERE unit_id = ?').run(unitId);
  for (const fileId of clips) queueUnreferencedAttachment(db, fileId);
  db.prepare('DELETE FROM unit_text_drafts WHERE unit_id = ?').run(unitId);
  db.prepare('DELETE FROM unit_time_drafts WHERE unit_id = ?').run(unitId);
  db.prepare('DELETE FROM text_save_receipts WHERE unit_id = ?').run(unitId);
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

export function nodeIdsOf(json: string | null): string[] {
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
      .all(...tokenIds) as { id: string }[]
  ).map((row) => row.id);
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

/** Two-phase renumber so UNIQUE(layer_id, sort_order) never sees a collision. */
export function shiftSortOrders(
  db: SqliteDatabase,
  layerId: string,
  sortOrder: number,
  direction: 'up' | 'down',
  excludeIds: readonly string[],
  compare: 'gt' | 'gte',
): void {
  const cmp = compare === 'gt' ? '>' : '>=';
  const exclude =
    excludeIds.length === 0 ? '' : ` AND id NOT IN (${excludeIds.map(() => '?').join(', ')})`;
  const bump = 1_000_000;
  const settle = direction === 'down' ? bump + 1 : bump - 1;
  db.prepare(
    `UPDATE units SET sort_order = sort_order + ?
     WHERE layer_id = ? AND sort_order ${cmp} ?${exclude}`,
  ).run(bump, layerId, sortOrder, ...excludeIds);
  db.prepare(
    `UPDATE units SET sort_order = sort_order - ?
     WHERE layer_id = ? AND sort_order >= ?${exclude}`,
  ).run(settle, layerId, bump, ...excludeIds);
}
