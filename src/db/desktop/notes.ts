import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { JieyuAnchoredNote } from '../dmlexTypes';
import { parseStoredJieyuLexeme } from '../dmlexEntrySchema';
import { provenanceSchema } from '../provenanceSchema';
import {
  lexemeExtensionForSave,
  splitLexemeExtension,
  writeRequiredFieldValues,
} from './customFields';

type SqliteDatabase = InstanceType<typeof Database>;

const CATEGORIES = [
  'comment',
  'question',
  'todo',
  'linguistic',
  'fieldwork',
  'correction',
  'topic',
] as const;

export type ContentNoteCategory = (typeof CATEGORIES)[number];

export type ContentNoteView = 'timeline' | 'waveform';

export type ContentNoteAnchor =
  | { kind: 'project' }
  | { kind: 'manuscript'; manuscriptId: string }
  | { kind: 'layer'; layerId: string }
  | { kind: 'unit'; unitId: string; view?: ContentNoteView }
  | { kind: 'unit_text'; unitTextId: string }
  | { kind: 'token'; unitId: string; tokenId: string }
  | { kind: 'morpheme'; unitId: string; morphemeId: string }
  | { kind: 'analysis_node'; unitId: string; nodeId: string };

export interface ContentNoteWrite {
  id?: string;
  anchor: ContentNoteAnchor;
  content: Record<string, string>;
  category?: ContentNoteCategory | null;
  provenance?: unknown | null;
  fieldValues?: Record<string, unknown>;
}

export interface ContentNoteRevision {
  id: string;
  content?: Record<string, string>;
  category?: ContentNoteCategory | null;
}

export interface ContentNote {
  id: string;
  anchorKind: ContentNoteAnchor['kind'];
  projectId: string | null;
  manuscriptId: string | null;
  layerId: string | null;
  unitId: string | null;
  unitTextId: string | null;
  tokenId: string | null;
  morphemeId: string | null;
  nodeId: string | null;
  view: ContentNoteView | null;
  content: Record<string, string>;
  category: ContentNoteCategory | null;
  provenance: unknown | null;
  attachment: 'active' | 'detached';
  createdAt: string;
  updatedAt: string;
}

export interface ContentNoteQuery {
  anchorKind?: ContentNoteAnchor['kind'];
  manuscriptId?: string;
  unitId?: string;
  nodeId?: string;
  layerId?: string;
  attachment?: 'active' | 'detached' | 'any';
}

export interface AnalysisNoteSnapshot {
  id: string;
  targetType: string;
  targetId: string;
  tokenId?: string;
  body: string;
  content?: Record<string, string>;
  category?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface NoteRow {
  id: string;
  anchor_kind: ContentNoteAnchor['kind'];
  project_id: string | null;
  manuscript_id: string | null;
  layer_id: string | null;
  unit_id: string | null;
  unit_text_id: string | null;
  token_id: string | null;
  morpheme_id: string | null;
  node_id: string | null;
  view: ContentNoteView | null;
  content_json: string;
  category: ContentNoteCategory | null;
  provenance_json: string | null;
  attachment: 'active' | 'detached';
  created_at: string;
  updated_at: string;
}

interface Place {
  projectId: string | null;
  manuscriptId: string | null;
  layerId: string | null;
  unitId: string | null;
  unitTextId: string | null;
  tokenId: string | null;
  morphemeId: string | null;
  nodeId: string | null;
  view: ContentNoteView | null;
}

const NOTE_COLUMNS = `id, anchor_kind, project_id, manuscript_id, layer_id, unit_id,
  unit_text_id, token_id, morpheme_id, node_id, view, content_json, category, provenance_json,
  attachment, created_at, updated_at`;

export function createContentNote(db: SqliteDatabase, input: ContentNoteWrite): ContentNote {
  const write = db.transaction(() => {
    const id = noteId(input.id);
    if (db.prepare('SELECT 1 FROM notes WHERE id = ?').get(id) !== undefined) {
      throw new Error('note id is duplicated');
    }
    const now = new Date().toISOString();
    const place = resolveAnchor(db, input.anchor);
    db.prepare(
      `INSERT INTO notes (
        id, anchor_kind, project_id, manuscript_id, layer_id, unit_id, unit_text_id,
        token_id, morpheme_id, node_id, view, content_json, category, provenance_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.anchor.kind,
      place.projectId,
      place.manuscriptId,
      place.layerId,
      place.unitId,
      place.unitTextId,
      place.tokenId,
      place.morphemeId,
      place.nodeId,
      place.view,
      contentJson(input.content),
      categoryOf(input.category),
      provenanceJson(input.provenance),
      now,
      now,
    );
    writeRequiredFieldValues(db, 'note', id, input.fieldValues);
    const stored = readContentNote(db, id);
    if (stored === null) throw new Error('note readback failed');
    return stored;
  });
  return write();
}

export function readContentNote(db: SqliteDatabase, id: string): ContentNote | null {
  const row = db.prepare(`SELECT ${NOTE_COLUMNS} FROM notes WHERE id = ?`).get(id) as
    NoteRow | undefined;
  return row === undefined ? null : mapNote(row);
}

export function updateContentNote(db: SqliteDatabase, input: ContentNoteRevision): ContentNote {
  const id = noteId(input.id);
  if (input.content === undefined && input.category === undefined) {
    throw new Error('note revision is empty');
  }
  const write = db.transaction(() => {
    const existing = readContentNote(db, id);
    if (existing === null) throw new Error('note is missing');
    db.prepare(`UPDATE notes SET content_json = ?, category = ?, updated_at = ? WHERE id = ?`).run(
      input.content === undefined ? contentJson(existing.content) : contentJson(input.content),
      input.category === undefined ? existing.category : categoryOf(input.category),
      new Date().toISOString(),
      id,
    );
    const stored = readContentNote(db, id);
    if (stored === null) throw new Error('note readback failed');
    return stored;
  });
  return write();
}

export function deleteContentNote(db: SqliteDatabase, id: string): { id: string } {
  const note = noteId(id);
  const write = db.transaction(() => {
    if (readContentNote(db, note) === null) throw new Error('note is missing');
    const place = db
      .prepare('SELECT manuscript_id AS manuscriptId FROM notes WHERE id = ?')
      .get(note) as { manuscriptId: string | null };
    if (place.manuscriptId !== null) {
      const manuscript = db
        .prepare('SELECT deleted_at AS deletedAt FROM manuscripts WHERE id = ?')
        .get(place.manuscriptId) as { deletedAt: string | null } | undefined;
      if (manuscript !== undefined && manuscript.deletedAt !== null) {
        throw new Error('manuscript is deleted');
      }
    }
    db.prepare('DELETE FROM notes WHERE id = ?').run(note);
    if (readContentNote(db, note) !== null) throw new Error('note readback failed');
    return { id: note };
  });
  return write();
}

export function listContentNotes(db: SqliteDatabase, query: ContentNoteQuery = {}): ContentNote[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (query.anchorKind !== undefined) {
    clauses.push('anchor_kind = ?');
    params.push(query.anchorKind);
  }
  if (query.manuscriptId !== undefined) {
    clauses.push('manuscript_id = ?');
    params.push(query.manuscriptId);
  }
  if (query.unitId !== undefined) {
    clauses.push('unit_id = ?');
    params.push(query.unitId);
  }
  if (query.nodeId !== undefined) {
    if (query.unitId === undefined) throw new Error('note query needs a unit');
    clauses.push('node_id = ?');
    params.push(query.nodeId);
  }
  if (query.layerId !== undefined) {
    clauses.push('layer_id = ?');
    params.push(query.layerId);
  }
  clauses.push(`(
    manuscript_id IS NULL OR manuscript_id NOT IN (
      SELECT id FROM manuscripts WHERE deleted_at IS NOT NULL
    )
  )`);
  const attachment = query.attachment ?? 'any';
  if (attachment !== 'any') {
    clauses.push('attachment = ?');
    params.push(attachment);
  }
  const where = clauses.length === 0 ? '' : `WHERE ${clauses.join(' AND ')}`;
  const rows = db
    .prepare(`SELECT ${NOTE_COLUMNS} FROM notes ${where} ORDER BY id`)
    .all(...params) as NoteRow[];
  return rows.map(mapNote);
}

export function readActiveAnalysisNotes(
  db: SqliteDatabase,
  unitId: string,
  targetIds: readonly string[],
): AnalysisNoteSnapshot[] {
  const select = db.prepare(
    `SELECT id, anchor_kind, token_id, morpheme_id, node_id, content_json, category,
            created_at, updated_at
     FROM notes
     WHERE unit_id = ? AND attachment = 'active' AND (
       (anchor_kind = 'token' AND token_id = ?)
       OR (anchor_kind = 'morpheme' AND morpheme_id = ?)
       OR (anchor_kind = 'analysis_node' AND node_id = ?)
     )
     ORDER BY id`,
  );
  const notes: AnalysisNoteSnapshot[] = [];
  for (const targetId of targetIds) {
    const rows = select.all(unitId, targetId, targetId, targetId) as {
      id: string;
      anchor_kind: string;
      token_id: string | null;
      morpheme_id: string | null;
      node_id: string | null;
      content_json: string;
      category: string | null;
      created_at: string;
      updated_at: string;
    }[];
    for (const row of rows) {
      const content = parseContent(row.content_json);
      const target =
        row.anchor_kind === 'token'
          ? row.token_id
          : row.anchor_kind === 'morpheme'
            ? row.morpheme_id
            : row.node_id;
      if (target === null) continue;
      notes.push({
        id: row.id,
        targetType: row.anchor_kind,
        targetId: target,
        ...(row.anchor_kind === 'morpheme' && row.token_id !== null
          ? { tokenId: row.token_id }
          : {}),
        body: analysisNoteBody(content),
        content,
        category: row.category,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    }
  }
  return notes;
}

/** Restores the anchor and attachment of an existing analysis note. Does not write its body. */
export function restoreAnalysisNote(
  db: SqliteDatabase,
  note: AnalysisNoteSnapshot,
  unitId: string,
  attachment: 'active' | 'detached',
  _candidateCreatedAt: string,
  now: string,
): void {
  const existing = db
    .prepare('SELECT token_id, manuscript_id FROM notes WHERE id = ?')
    .get(note.id) as { token_id: string | null; manuscript_id: string | null } | undefined;
  if (existing === undefined) return;
  const unit = unitPlace(db, unitId);
  if (existing.manuscript_id !== unit.manuscriptId) {
    db.prepare('UPDATE notes SET attachment = ?, updated_at = ? WHERE id = ?').run(
      'detached',
      now,
      note.id,
    );
    return;
  }
  const place = restoredAnalysisPlace(note, existing.token_id);
  const next =
    attachment === 'active' && analysisTargetMatches(db, unitId, place) ? 'active' : 'detached';
  db.prepare(
    `UPDATE notes SET
      anchor_kind = ?, unit_id = ?, token_id = ?, morpheme_id = ?, node_id = ?,
      layer_id = NULL, unit_text_id = NULL, view = NULL,
      attachment = ?, updated_at = ?
    WHERE id = ?`,
  ).run(place.kind, unitId, place.tokenId, place.morphemeId, place.nodeId, next, now, note.id);
}

export function detachAnalysisNotes(
  db: SqliteDatabase,
  unitId: string,
  targetIds: readonly string[],
  now: string,
): void {
  const note = db.prepare(
    `UPDATE notes SET attachment = 'detached', updated_at = ?
     WHERE unit_id = ? AND attachment = 'active' AND (
       (anchor_kind = 'token' AND token_id = ?)
       OR (anchor_kind = 'morpheme' AND morpheme_id = ?)
       OR (anchor_kind = 'analysis_node' AND node_id = ?)
     )`,
  );
  for (const targetId of targetIds) note.run(now, unitId, targetId, targetId, targetId);
}

export function detachProjectionNotes(db: SqliteDatabase, unitId: string, now: string): void {
  db.prepare(
    `UPDATE notes SET attachment = 'detached', updated_at = ?
     WHERE unit_id = ? AND attachment = 'active' AND anchor_kind IN ('token', 'morpheme')`,
  ).run(now, unitId);
}

export function detachNotesForDeletedTarget(
  db: SqliteDatabase,
  target:
    | { kind: 'layer'; layerId: string }
    | { kind: 'unit'; unitId: string }
    | { kind: 'unit_text'; unitTextId: string },
  now: string,
): void {
  if (target.kind === 'unit_text') {
    db.prepare(
      `UPDATE notes SET attachment = 'detached', updated_at = ?
       WHERE unit_text_id = ? AND attachment = 'active'`,
    ).run(now, target.unitTextId);
    return;
  }
  if (target.kind === 'unit') {
    db.prepare(
      `UPDATE notes SET attachment = 'detached', updated_at = ?
       WHERE unit_id = ? AND attachment = 'active'`,
    ).run(now, target.unitId);
    return;
  }
  db.prepare(
    `UPDATE notes SET attachment = 'detached', updated_at = ?
     WHERE attachment = 'active' AND (
       layer_id = ?
       OR unit_id IN (SELECT id FROM units WHERE layer_id = ?)
     )`,
  ).run(now, target.layerId, target.layerId);
}

export function deleteManuscriptNotes(db: SqliteDatabase, manuscriptId: string): void {
  db.prepare('DELETE FROM notes WHERE manuscript_id = ?').run(manuscriptId);
}

export function saveLexemeNote(
  db: SqliteDatabase,
  input: {
    lexemeId: string;
    id?: string;
    senseId?: string;
    content: Record<string, string>;
    category?: ContentNoteCategory | null;
    provenance?: unknown | null;
  },
): JieyuAnchoredNote {
  const write = db.transaction(() => {
    const row = db
      .prepare('SELECT kind, entry_json, jieyu_json FROM lexemes WHERE id = ?')
      .get(input.lexemeId) as
      { kind: string; entry_json: string | null; jieyu_json: string } | undefined;
    if (row === undefined || row.kind !== 'entry' || row.entry_json === null) {
      throw new Error('note target is missing');
    }
    const entry = JSON.parse(row.entry_json) as { senses?: unknown };
    const senseIds = senseIdsOf(entry.senses);
    const scope = input.senseId === undefined ? 'lexeme' : 'sense';
    if (scope === 'sense' && !senseIds.includes(input.senseId ?? '')) {
      throw new Error('sense is missing');
    }
    const stored = JSON.parse(row.jieyu_json) as unknown;
    const domain = parseStoredJieyuLexeme(splitLexemeExtension(stored));
    const notes = [...(domain.anchoredNotes ?? [])];
    const now = new Date().toISOString();
    const id = noteId(input.id);
    const category = categoryOf(input.category);
    const provenance =
      input.provenance === undefined || input.provenance === null
        ? undefined
        : provenanceSchema.strict().parse(input.provenance);
    const index = notes.findIndex((item) => item.id === id);
    const createdAt = index >= 0 ? (notes[index]?.createdAt ?? now) : now;
    if (index >= 0) {
      const previous = notes[index];
      if (
        previous !== undefined &&
        (previous.scope !== scope || previous.senseId !== input.senseId)
      ) {
        throw new Error('note id is duplicated');
      }
    }
    const record = {
      id,
      scope,
      content: JSON.parse(contentJson(input.content)) as Record<string, string>,
      createdAt,
      updatedAt: now,
      ...(scope === 'sense' && input.senseId !== undefined ? { senseId: input.senseId } : {}),
      ...(category === null ? {} : { category }),
      ...(provenance === undefined ? {} : { provenance }),
    };
    const nextNotes =
      index >= 0
        ? notes.map((item, itemIndex) => (itemIndex === index ? record : item))
        : [...notes, record];
    const next = { ...domain, anchoredNotes: nextNotes };
    parseStoredJieyuLexeme(next);
    const merged = lexemeExtensionForSave(row.jieyu_json, next, senseIds);
    db.prepare('UPDATE lexemes SET jieyu_json = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(merged),
      now,
      input.lexemeId,
    );
    const written = listLexemeNotes(db, input.lexemeId).find((item) => item.id === id);
    if (written === undefined) throw new Error('note readback failed');
    return written;
  });
  return write();
}

export function listLexemeNotes(db: SqliteDatabase, lexemeId: string): JieyuAnchoredNote[] {
  const row = db.prepare('SELECT kind, jieyu_json FROM lexemes WHERE id = ?').get(lexemeId) as
    { kind: string; jieyu_json: string } | undefined;
  if (row === undefined || row.kind !== 'entry') throw new Error('note target is missing');
  const domain = parseStoredJieyuLexeme(
    splitLexemeExtension(JSON.parse(row.jieyu_json) as unknown),
  );
  return (domain.anchoredNotes ?? []).map((note) => {
    const stored: JieyuAnchoredNote = {
      id: note.id,
      scope: note.scope,
      content: note.content,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    };
    if (note.senseId !== undefined) stored.senseId = note.senseId;
    if (note.category !== undefined) stored.category = note.category;
    if (note.provenance !== undefined) stored.provenance = note.provenance;
    return stored;
  });
}

export function analysisNoteBody(content: Record<string, string>): string {
  if (Object.prototype.hasOwnProperty.call(content, 'default')) return content.default ?? '';
  const first = Object.keys(content).sort()[0];
  return first === undefined ? '' : (content[first] ?? '');
}

function resolveAnchor(db: SqliteDatabase, anchor: ContentNoteAnchor): Place {
  const projectId = savedProjectId(db);
  const empty: Place = {
    projectId,
    manuscriptId: null,
    layerId: null,
    unitId: null,
    unitTextId: null,
    tokenId: null,
    morphemeId: null,
    nodeId: null,
    view: null,
  };
  switch (anchor.kind) {
    case 'project': {
      if (projectId === null) throw new Error('note target is missing');
      return empty;
    }
    case 'manuscript': {
      requireManuscript(db, anchor.manuscriptId);
      return { ...empty, manuscriptId: anchor.manuscriptId };
    }
    case 'layer': {
      const layer = layerPlace(db, anchor.layerId);
      return { ...empty, manuscriptId: layer.manuscriptId, layerId: anchor.layerId };
    }
    case 'unit': {
      const unit = unitPlace(db, anchor.unitId);
      return {
        ...empty,
        manuscriptId: unit.manuscriptId,
        unitId: anchor.unitId,
        view: anchor.view ?? null,
      };
    }
    case 'unit_text': {
      const text = textPlace(db, anchor.unitTextId);
      return {
        ...empty,
        manuscriptId: text.manuscriptId,
        unitId: text.unitId,
        unitTextId: anchor.unitTextId,
      };
    }
    case 'token': {
      const token = tokenPlace(db, anchor.tokenId);
      if (token.unitId !== anchor.unitId) throw new Error('note target is missing');
      return {
        ...empty,
        manuscriptId: token.manuscriptId,
        unitId: anchor.unitId,
        tokenId: anchor.tokenId,
      };
    }
    case 'morpheme': {
      const morpheme = morphemePlace(db, anchor.morphemeId);
      if (morpheme.unitId !== anchor.unitId) throw new Error('note target is missing');
      return {
        ...empty,
        manuscriptId: morpheme.manuscriptId,
        unitId: anchor.unitId,
        tokenId: morpheme.tokenId,
        morphemeId: anchor.morphemeId,
      };
    }
    case 'analysis_node': {
      requireGraphNode(db, anchor.unitId, anchor.nodeId);
      return {
        ...empty,
        manuscriptId: unitPlace(db, anchor.unitId).manuscriptId,
        unitId: anchor.unitId,
        nodeId: anchor.nodeId,
      };
    }
    default: {
      const unreachable: never = anchor;
      throw new Error(`note anchor is invalid: ${String(unreachable)}`);
    }
  }
}

function savedProjectId(db: SqliteDatabase): string | null {
  const rows = db.prepare('SELECT id FROM project').all() as { id: string }[];
  if (rows.length > 1) throw new Error('project ownership is ambiguous');
  return rows[0]?.id ?? null;
}

function requireManuscript(db: SqliteDatabase, manuscriptId: string): void {
  const row = db.prepare('SELECT 1 FROM manuscripts WHERE id = ?').get(manuscriptId);
  if (row === undefined) throw new Error('note target is missing');
}

function unitPlace(db: SqliteDatabase, unitId: string): { manuscriptId: string } {
  const row = db
    .prepare(
      `SELECT layers.manuscript_id AS manuscriptId
       FROM units JOIN layers ON layers.id = units.layer_id
       WHERE units.id = ?`,
    )
    .get(unitId) as { manuscriptId: string } | undefined;
  if (row === undefined) throw new Error('note target is missing');
  return row;
}

function layerPlace(db: SqliteDatabase, layerId: string): { manuscriptId: string } {
  const row = db
    .prepare('SELECT manuscript_id AS manuscriptId FROM layers WHERE id = ?')
    .get(layerId) as { manuscriptId: string } | undefined;
  if (row === undefined) throw new Error('note target is missing');
  return row;
}

function textPlace(
  db: SqliteDatabase,
  unitTextId: string,
): { unitId: string; role: string; manuscriptId: string } {
  const row = db
    .prepare(
      `SELECT unit_texts.unit_id AS unitId, unit_texts.role AS role, layers.manuscript_id AS manuscriptId
       FROM unit_texts
       JOIN units ON units.id = unit_texts.unit_id
       JOIN layers ON layers.id = units.layer_id
       WHERE unit_texts.id = ?`,
    )
    .get(unitTextId) as { unitId: string; role: string; manuscriptId: string } | undefined;
  if (row === undefined) throw new Error('note target is missing');
  return row;
}

function tokenPlace(db: SqliteDatabase, tokenId: string): { unitId: string; manuscriptId: string } {
  const row = db
    .prepare(
      `SELECT tokens.unit_id AS unitId, layers.manuscript_id AS manuscriptId
       FROM tokens
       JOIN units ON units.id = tokens.unit_id
       JOIN layers ON layers.id = units.layer_id
       WHERE tokens.id = ?`,
    )
    .get(tokenId) as { unitId: string; manuscriptId: string } | undefined;
  if (row === undefined) throw new Error('note target is missing');
  return row;
}

function morphemePlace(
  db: SqliteDatabase,
  morphemeId: string,
): { unitId: string; manuscriptId: string; tokenId: string } {
  const row = db
    .prepare(
      `SELECT tokens.unit_id AS unitId, layers.manuscript_id AS manuscriptId,
              morphemes.token_id AS tokenId
       FROM morphemes
       JOIN tokens ON tokens.id = morphemes.token_id
       JOIN units ON units.id = tokens.unit_id
       JOIN layers ON layers.id = units.layer_id
       WHERE morphemes.id = ?`,
    )
    .get(morphemeId) as { unitId: string; manuscriptId: string; tokenId: string } | undefined;
  if (row === undefined) throw new Error('note target is missing');
  return row;
}

function requireGraphNode(db: SqliteDatabase, unitId: string, nodeId: string): void {
  const row = db.prepare('SELECT analysis_graph_json FROM units WHERE id = ?').get(unitId) as
    { analysis_graph_json: string | null } | undefined;
  if (row?.analysis_graph_json == null) throw new Error('note target is missing');
  const parsed = JSON.parse(row.analysis_graph_json) as { nodes?: unknown };
  if (!Array.isArray(parsed.nodes)) throw new Error('note target is missing');
  const found = parsed.nodes.some(
    (item) => typeof item === 'object' && item !== null && (item as { id?: unknown }).id === nodeId,
  );
  if (!found) throw new Error('note target is missing');
}

function restoredAnalysisPlace(
  note: AnalysisNoteSnapshot,
  storedTokenId: string | null,
): {
  kind: 'token' | 'morpheme' | 'analysis_node';
  tokenId: string | null;
  morphemeId: string | null;
  nodeId: string | null;
} {
  if (note.targetType === 'token') {
    return { kind: 'token', tokenId: note.targetId, morphemeId: null, nodeId: null };
  }
  if (note.targetType === 'morpheme') {
    const tokenId = note.tokenId ?? storedTokenId;
    if (tokenId === null) throw new Error('analysis note target is invalid');
    return { kind: 'morpheme', tokenId, morphemeId: note.targetId, nodeId: null };
  }
  if (note.targetType === 'analysis_node') {
    return { kind: 'analysis_node', tokenId: null, morphemeId: null, nodeId: note.targetId };
  }
  throw new Error('analysis note target is invalid');
}

function analysisTargetMatches(
  db: SqliteDatabase,
  unitId: string,
  place: {
    kind: 'token' | 'morpheme' | 'analysis_node';
    tokenId: string | null;
    morphemeId: string | null;
    nodeId: string | null;
  },
): boolean {
  if (place.kind === 'token' && place.tokenId !== null) {
    const row = db.prepare('SELECT unit_id FROM tokens WHERE id = ?').get(place.tokenId) as
      { unit_id: string } | undefined;
    return row?.unit_id === unitId;
  }
  if (place.kind === 'morpheme' && place.morphemeId !== null && place.tokenId !== null) {
    const row = db
      .prepare(
        `SELECT morphemes.token_id AS tokenId, tokens.unit_id AS unitId
         FROM morphemes JOIN tokens ON tokens.id = morphemes.token_id
         WHERE morphemes.id = ?`,
      )
      .get(place.morphemeId) as { tokenId: string; unitId: string } | undefined;
    return row?.tokenId === place.tokenId && row.unitId === unitId;
  }
  if (place.kind === 'analysis_node' && place.nodeId !== null) {
    const row = db.prepare('SELECT analysis_graph_json FROM units WHERE id = ?').get(unitId) as
      { analysis_graph_json: string | null } | undefined;
    if (row?.analysis_graph_json == null) return false;
    const parsed = JSON.parse(row.analysis_graph_json) as { nodes?: unknown };
    return (
      Array.isArray(parsed.nodes) &&
      parsed.nodes.some(
        (item) =>
          typeof item === 'object' &&
          item !== null &&
          (item as { id?: unknown }).id === place.nodeId,
      )
    );
  }
  return false;
}

function mapNote(row: NoteRow): ContentNote {
  return {
    id: row.id,
    anchorKind: row.anchor_kind,
    projectId: row.project_id,
    manuscriptId: row.manuscript_id,
    layerId: row.layer_id,
    unitId: row.unit_id,
    unitTextId: row.unit_text_id,
    tokenId: row.token_id,
    morphemeId: row.morpheme_id,
    nodeId: row.node_id,
    view: row.view,
    content: parseContent(row.content_json),
    category: row.category,
    provenance: row.provenance_json === null ? null : (JSON.parse(row.provenance_json) as unknown),
    attachment: row.attachment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseContent(value: string): Record<string, string> {
  const parsed = JSON.parse(value) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('note content is invalid');
  }
  const content: Record<string, string> = {};
  for (const [key, item] of Object.entries(parsed)) {
    if (typeof item !== 'string') throw new Error('note content is invalid');
    content[key] = item;
  }
  return content;
}

function contentJson(content: Record<string, string>): string {
  if (typeof content !== 'object' || content === null || Array.isArray(content)) {
    throw new Error('note content is invalid');
  }
  const keys = Object.keys(content);
  if (keys.length === 0) throw new Error('note content is invalid');
  const out: Record<string, string> = {};
  for (const key of keys) {
    if (key.length === 0 || typeof content[key] !== 'string')
      throw new Error('note content is invalid');
    out[key] = content[key];
  }
  return JSON.stringify(out);
}

function categoryOf(value: string | null | undefined): ContentNoteCategory | null {
  if (value === undefined || value === null) return null;
  const found = CATEGORIES.find((item) => item === value);
  if (found === undefined) throw new Error('note category is invalid');
  return found;
}

function provenanceJson(value: unknown | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const parsed = provenanceSchema.strict().safeParse(value);
  if (!parsed.success) throw new Error('note provenance is invalid');
  return JSON.stringify(parsed.data);
}

function noteId(id: string | undefined): string {
  if (id === undefined) return randomUUID();
  if (id.length === 0 || id.length > 128 || id.trim() !== id) throw new Error('note id is invalid');
  return id;
}

function senseIdsOf(senses: unknown): string[] {
  if (!Array.isArray(senses)) return [];
  return senses.flatMap((sense) => {
    if (typeof sense !== 'object' || sense === null) return [];
    const id = (sense as { id?: unknown }).id;
    return typeof id === 'string' ? [id] : [];
  });
}
