import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { JieyuAnchoredNote } from '../dmlexTypes';
import { parseStoredJieyuLexeme } from '../dmlexEntrySchema';
import { provenanceSchema } from '../provenanceSchema';
import { lexemeExtensionForSave, splitLexemeExtension } from './customFields';

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

export type ContentNoteAnchor =
  | { kind: 'project' }
  | { kind: 'manuscript'; manuscriptId: string }
  | { kind: 'layer'; layerId: string }
  | { kind: 'unit'; unitId: string }
  | { kind: 'token'; unitId: string; nodeId: string }
  | { kind: 'morpheme'; unitId: string; nodeId: string; parentNodeId?: string }
  | { kind: 'tier_timeline'; unitId: string; layerId: string }
  | { kind: 'tier_waveform'; unitId: string; layerId: string }
  | { kind: 'translation_comment'; unitTextId: string }
  | { kind: 'content_row'; unitTextId: string }
  | { kind: 'graph_node'; unitId: string; nodeId: string }
  | { kind: 'cell'; unitId: string; layerId: string; cellKey: string };

export interface ContentNoteWrite {
  id?: string;
  anchor: ContentNoteAnchor;
  content: Record<string, string>;
  category?: ContentNoteCategory | null;
  provenance?: unknown | null;
}

export interface ContentNote {
  id: string;
  anchorKind: ContentNoteAnchor['kind'];
  projectId: string | null;
  manuscriptId: string | null;
  layerId: string | null;
  unitId: string | null;
  nodeId: string | null;
  unitTextId: string | null;
  textRole: string | null;
  cellKey: string | null;
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
  node_id: string | null;
  unit_text_id: string | null;
  text_role: string | null;
  cell_key: string | null;
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
  nodeId: string | null;
  unitTextId: string | null;
  textRole: string | null;
  cellKey: string | null;
}

const NOTE_COLUMNS = `id, anchor_kind, project_id, manuscript_id, layer_id, unit_id, node_id,
  unit_text_id, text_role, cell_key, content_json, category, provenance_json, attachment,
  created_at, updated_at`;

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
        id, anchor_kind, project_id, manuscript_id, layer_id, unit_id, node_id,
        unit_text_id, text_role, cell_key, content_json, category, provenance_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.anchor.kind,
      place.projectId,
      place.manuscriptId,
      place.layerId,
      place.unitId,
      place.nodeId,
      place.unitTextId,
      place.textRole,
      place.cellKey,
      contentJson(input.content),
      categoryOf(input.category),
      provenanceJson(input.provenance),
      now,
      now,
    );
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
    clauses.push('node_id = ?');
    params.push(query.nodeId);
  }
  if (query.layerId !== undefined) {
    clauses.push('layer_id = ?');
    params.push(query.layerId);
  }
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
  targetIds: readonly string[],
): AnalysisNoteSnapshot[] {
  const select = db.prepare(
    `SELECT id, anchor_kind, node_id, content_json, category, created_at, updated_at
     FROM notes
     WHERE node_id = ? AND attachment = 'active' AND anchor_kind IN ('token', 'morpheme')
     ORDER BY id`,
  );
  const notes: AnalysisNoteSnapshot[] = [];
  for (const targetId of targetIds) {
    const rows = select.all(targetId) as {
      id: string;
      anchor_kind: string;
      node_id: string;
      content_json: string;
      category: string | null;
      created_at: string;
      updated_at: string;
    }[];
    for (const row of rows) {
      const content = parseContent(row.content_json);
      notes.push({
        id: row.id,
        targetType: row.anchor_kind,
        targetId: row.node_id,
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

/** Restores whether a token or morpheme note is still attached. Leaves a later body and category. */
export function restoreAnalysisNote(
  db: SqliteDatabase,
  note: AnalysisNoteSnapshot,
  unitId: string,
  attachment: 'active' | 'detached',
  candidateCreatedAt: string,
  now: string,
): void {
  if (note.targetType !== 'token' && note.targetType !== 'morpheme') {
    throw new Error('analysis note target is invalid');
  }
  const place = unitPlace(db, unitId);
  const existing = db.prepare('SELECT updated_at FROM notes WHERE id = ?').get(note.id) as
    { updated_at: string } | undefined;
  const content = noteContent(note);
  if (existing === undefined) {
    db.prepare(
      `INSERT INTO notes (
        id, anchor_kind, project_id, manuscript_id, unit_id, node_id, content_json, category,
        attachment, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      note.id,
      note.targetType,
      savedProjectId(db),
      place.manuscriptId,
      unitId,
      note.targetId,
      JSON.stringify(content),
      categoryOf(note.category),
      attachment,
      note.createdAt,
      now,
    );
    return;
  }
  const keep = existing.updated_at > candidateCreatedAt;
  db.prepare(
    `UPDATE notes SET
      anchor_kind = ?, unit_id = ?, node_id = ?,
      layer_id = NULL, unit_text_id = NULL, text_role = NULL, cell_key = NULL,
      content_json = CASE WHEN ? = 1 THEN content_json ELSE ? END,
      updated_at = CASE WHEN ? = 1 THEN updated_at ELSE ? END,
      attachment = ?
    WHERE id = ?`,
  ).run(
    note.targetType,
    unitId,
    note.targetId,
    keep ? 1 : 0,
    JSON.stringify(content),
    keep ? 1 : 0,
    now,
    attachment,
    note.id,
  );
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
    nodeId: null,
    unitTextId: null,
    textRole: null,
    cellKey: null,
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
      return { ...empty, manuscriptId: unit.manuscriptId, unitId: anchor.unitId };
    }
    case 'token':
      requireNode(db, anchor.unitId, anchor.nodeId, 'token');
      return {
        ...empty,
        manuscriptId: unitPlace(db, anchor.unitId).manuscriptId,
        unitId: anchor.unitId,
        nodeId: anchor.nodeId,
      };
    case 'morpheme': {
      const node = requireNode(db, anchor.unitId, anchor.nodeId, 'morpheme');
      if (anchor.parentNodeId !== undefined) {
        const parts = Array.isArray(node.surfaceParts) ? node.surfaceParts : [];
        if (!parts.some((part) => part.tokenId === anchor.parentNodeId)) {
          throw new Error('morpheme parent does not match');
        }
      }
      return {
        ...empty,
        manuscriptId: unitPlace(db, anchor.unitId).manuscriptId,
        unitId: anchor.unitId,
        nodeId: anchor.nodeId,
      };
    }
    case 'graph_node':
      requireNode(db, anchor.unitId, anchor.nodeId);
      return {
        ...empty,
        manuscriptId: unitPlace(db, anchor.unitId).manuscriptId,
        unitId: anchor.unitId,
        nodeId: anchor.nodeId,
      };
    case 'tier_timeline':
    case 'tier_waveform': {
      const unit = unitPlace(db, anchor.unitId);
      const layer = layerPlace(db, anchor.layerId);
      if (unit.manuscriptId !== layer.manuscriptId) {
        throw new Error('note target is in another manuscript');
      }
      return {
        ...empty,
        manuscriptId: unit.manuscriptId,
        unitId: anchor.unitId,
        layerId: anchor.layerId,
      };
    }
    case 'cell': {
      const unit = unitPlace(db, anchor.unitId);
      const layer = layerPlace(db, anchor.layerId);
      if (unit.manuscriptId !== layer.manuscriptId) {
        throw new Error('note target is in another manuscript');
      }
      return {
        ...empty,
        manuscriptId: unit.manuscriptId,
        unitId: anchor.unitId,
        layerId: anchor.layerId,
        cellKey: requiredKey(anchor.cellKey),
      };
    }
    case 'translation_comment':
    case 'content_row': {
      const text = textPlace(db, anchor.unitTextId);
      return {
        ...empty,
        manuscriptId: text.manuscriptId,
        unitId: text.unitId,
        unitTextId: anchor.unitTextId,
        textRole: anchor.kind === 'translation_comment' ? text.role : null,
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

function requireNode(
  db: SqliteDatabase,
  unitId: string,
  nodeId: string,
  type?: string,
): { surfaceParts?: { tokenId?: string }[] } {
  const row = db.prepare('SELECT analysis_graph_json FROM units WHERE id = ?').get(unitId) as
    { analysis_graph_json: string | null } | undefined;
  if (row?.analysis_graph_json == null) throw new Error('note target is missing');
  const parsed = JSON.parse(row.analysis_graph_json) as { nodes?: unknown };
  if (!Array.isArray(parsed.nodes)) throw new Error('note target is missing');
  const node = parsed.nodes.find(
    (item): item is { id?: unknown; type?: unknown; surfaceParts?: { tokenId?: string }[] } =>
      typeof item === 'object' && item !== null && (item as { id?: unknown }).id === nodeId,
  );
  if (node === undefined || (type !== undefined && node.type !== type)) {
    throw new Error('note target is missing');
  }
  return node;
}

function noteContent(note: AnalysisNoteSnapshot): Record<string, string> {
  if (note.content !== undefined && Object.keys(note.content).length > 0) return note.content;
  return { default: note.body };
}

function mapNote(row: NoteRow): ContentNote {
  return {
    id: row.id,
    anchorKind: row.anchor_kind,
    projectId: row.project_id,
    manuscriptId: row.manuscript_id,
    layerId: row.layer_id,
    unitId: row.unit_id,
    nodeId: row.node_id,
    unitTextId: row.unit_text_id,
    textRole: row.text_role,
    cellKey: row.cell_key,
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

function requiredKey(value: string): string {
  if (value.trim() !== value || value.length === 0) throw new Error('note anchor is invalid');
  return value;
}

function senseIdsOf(senses: unknown): string[] {
  if (!Array.isArray(senses)) return [];
  return senses.flatMap((sense) => {
    if (typeof sense !== 'object' || sense === null) return [];
    const id = (sense as { id?: unknown }).id;
    return typeof id === 'string' ? [id] : [];
  });
}
