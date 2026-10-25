import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  validateAnalysisGraphPayload,
  type AnalysisGraphPayload,
  type AnalysisGraphSurfacePart,
} from '../../annotation/analysisGraphDomain';
import type {
  ProjectedMorpheme,
  ProjectedToken,
} from '../../annotation/analysisGraphDomainProjection';
import { currentDefinitionRevisions, type StoredDefinitionRevision } from './customFields';

type SqliteDatabase = InstanceType<typeof Database>;

export interface AnalysisAssociationLink {
  id: string;
  targetType: string;
  targetId: string;
  lexemeId: string;
  senseId: string | null;
  role: string | null;
  confidence: number | null;
  provenance: unknown | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisAssociationNote {
  id: string;
  targetType: string;
  targetId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisMaterial {
  unitId: string;
  text: string;
  graph: AnalysisGraphPayload | null;
  graphFingerprint: string;
  analysisGeneration: number;
  manuscriptId: string;
  manuscriptGeneration: number;
  projection: { tokens: ProjectedToken[]; morphemes: ProjectedMorpheme[] };
  links: AnalysisAssociationLink[];
  notes: AnalysisAssociationNote[];
}

export interface AnalysisCandidateRecord {
  id: string;
  unitId: string;
  kind: 'suggestion' | 'review-snapshot';
  status: 'pending' | 'rejected' | 'accepted' | 'stored';
  graph: AnalysisGraphPayload;
  /** Fingerprint of the analysis this record was bound to when it was saved. */
  graphFingerprint: string;
  manuscriptGeneration: number;
  analysisGeneration: number;
  text: string;
  projection: { tokens: ProjectedToken[]; morphemes: ProjectedMorpheme[] };
  links: AnalysisAssociationLink[];
  notes: AnalysisAssociationNote[];
  definitionRevisions: StoredDefinitionRevision[];
  redactedDefinitionIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface CandidateInsert {
  unitId: string;
  kind: AnalysisCandidateRecord['kind'];
  status: AnalysisCandidateRecord['status'];
  graph: AnalysisGraphPayload;
  graphFingerprint: string;
  manuscriptGeneration: number;
  analysisGeneration: number;
  text: string;
  projection: AnalysisMaterial['projection'];
  links: AnalysisAssociationLink[];
  notes: AnalysisAssociationNote[];
}

interface MaterialRow {
  analysis_graph_json: string | null;
  analysis_generation: number;
  graph_fingerprint: string;
  text: string;
  manuscript_id: string;
  manuscript_generation: number;
}

interface CandidateRow {
  id: string;
  unit_id: string;
  kind: string;
  status: string;
  graph_json: string;
  graph_fingerprint: string;
  manuscript_generation: number;
  analysis_generation: number;
  text: string;
  projection_json: string;
  links_json: string;
  notes_json: string;
  definition_revisions_json: string;
  redacted_definition_ids_json: string;
  created_at: string;
  updated_at: string;
}

const MATERIAL = `
SELECT units.analysis_graph_json, units.analysis_generation, units.graph_fingerprint,
       unit_texts.body AS text, manuscripts.id AS manuscript_id,
       manuscripts.generation AS manuscript_generation
FROM units
JOIN layers ON layers.id = units.layer_id
JOIN manuscripts ON manuscripts.id = layers.manuscript_id
JOIN unit_texts ON unit_texts.unit_id = units.id AND unit_texts.role = 'transcription'
WHERE units.id = ?
`;

export function readAnalysisMaterial(db: SqliteDatabase, unitId: string): AnalysisMaterial {
  const row = db.prepare(MATERIAL).get(unitId) as MaterialRow | undefined;
  if (!row) throw new Error('unit is missing');
  const graph =
    row.analysis_graph_json === null
      ? null
      : validateAnalysisGraphPayload(JSON.parse(row.analysis_graph_json) as unknown, row.text);
  const nodeIds = graph === null ? [] : graph.nodes.map((node) => node.id);
  return {
    unitId,
    text: row.text,
    graph,
    graphFingerprint: row.graph_fingerprint,
    analysisGeneration: row.analysis_generation,
    manuscriptId: row.manuscript_id,
    manuscriptGeneration: row.manuscript_generation,
    projection: readProjection(db, unitId),
    links: readLinks(db, nodeIds),
    notes: readNotes(db, nodeIds),
  };
}

export function insertAnalysisCandidate(
  db: SqliteDatabase,
  input: CandidateInsert,
): AnalysisCandidateRecord {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO analysis_candidates (
      id, unit_id, kind, status, graph_json, graph_fingerprint, manuscript_generation,
      analysis_generation, text, projection_json, links_json, notes_json,
      definition_revisions_json, redacted_definition_ids_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.unitId,
    input.kind,
    input.status,
    JSON.stringify(input.graph),
    input.graphFingerprint,
    input.manuscriptGeneration,
    input.analysisGeneration,
    input.text,
    JSON.stringify(input.projection),
    JSON.stringify(input.links),
    JSON.stringify(input.notes),
    JSON.stringify(currentDefinitionRevisions(db)),
    '[]',
    now,
    now,
  );
  const stored = getAnalysisCandidate(db, id);
  if (!stored) throw new Error('analysis candidate readback failed');
  return stored;
}

export function insertReviewSnapshot(db: SqliteDatabase, material: AnalysisMaterial): string {
  if (material.graph === null) throw new Error('analysis graph is missing');
  return insertAnalysisCandidate(db, {
    unitId: material.unitId,
    kind: 'review-snapshot',
    status: 'stored',
    graph: material.graph,
    graphFingerprint: material.graphFingerprint,
    manuscriptGeneration: material.manuscriptGeneration,
    analysisGeneration: material.analysisGeneration,
    text: material.text,
    projection: material.projection,
    links: material.links,
    notes: material.notes,
  }).id;
}

export function rejectOtherPendingSuggestions(
  db: SqliteDatabase,
  unitId: string,
  keepId: string,
): void {
  db.prepare(
    `UPDATE analysis_candidates
     SET status = 'rejected', updated_at = ?
     WHERE unit_id = ? AND kind = 'suggestion' AND status = 'pending' AND id <> ?`,
  ).run(new Date().toISOString(), unitId, keepId);
}

export function markSuggestionAccepted(db: SqliteDatabase, id: string): void {
  db.prepare(
    `UPDATE analysis_candidates
     SET status = 'accepted', updated_at = ?
     WHERE id = ? AND kind = 'suggestion' AND status = 'pending'`,
  ).run(new Date().toISOString(), id);
  if (getAnalysisCandidate(db, id)?.status !== 'accepted') {
    throw new Error('analysis suggestion readback failed');
  }
}

export function getAnalysisCandidate(
  db: SqliteDatabase,
  id: string,
): AnalysisCandidateRecord | null {
  const row = db.prepare('SELECT * FROM analysis_candidates WHERE id = ?').get(id) as
    CandidateRow | undefined;
  if (!row) return null;
  return mapCandidate(row);
}

export function listAnalysisCandidates(
  db: SqliteDatabase,
  unitId: string,
): AnalysisCandidateRecord[] {
  const rows = db
    .prepare('SELECT * FROM analysis_candidates WHERE unit_id = ? ORDER BY created_at, id')
    .all(unitId) as CandidateRow[];
  return rows.map(mapCandidate);
}

export function clearAnalysisProjection(db: SqliteDatabase, unitId: string): void {
  db.prepare(
    'DELETE FROM morphemes WHERE token_id IN (SELECT id FROM tokens WHERE unit_id = ?)',
  ).run(unitId);
  db.prepare('DELETE FROM tokens WHERE unit_id = ?').run(unitId);
}

export function detachAnalysisAssociations(
  db: SqliteDatabase,
  targetIds: readonly string[],
  now: string,
): void {
  const link = db.prepare(
    `UPDATE token_lexeme_links
     SET attachment = 'detached', updated_at = ?
     WHERE target_id = ? AND attachment = 'active'`,
  );
  const note = db.prepare(
    `UPDATE notes SET attachment = 'detached', updated_at = ? WHERE target_id = ? AND attachment = 'active'`,
  );
  for (const targetId of targetIds) {
    link.run(now, targetId);
    note.run(now, targetId);
  }
}

export function nodeIdsOf(graph: AnalysisGraphPayload | null): string[] {
  return graph === null ? [] : graph.nodes.map((node) => node.id);
}

function mapCandidate(row: CandidateRow): AnalysisCandidateRecord {
  const kind = row.kind === 'suggestion' || row.kind === 'review-snapshot' ? row.kind : null;
  const status =
    row.status === 'pending' ||
    row.status === 'rejected' ||
    row.status === 'accepted' ||
    row.status === 'stored'
      ? row.status
      : null;
  if (kind === null || status === null) throw new Error('analysis candidate is invalid');
  const projection = JSON.parse(row.projection_json) as AnalysisMaterial['projection'];
  const links = JSON.parse(row.links_json) as AnalysisAssociationLink[];
  const notes = JSON.parse(row.notes_json) as AnalysisAssociationNote[];
  if (!Array.isArray(links) || !Array.isArray(notes))
    throw new Error('analysis candidate is invalid');
  return {
    id: row.id,
    unitId: row.unit_id,
    kind,
    status,
    graph: validateAnalysisGraphPayload(JSON.parse(row.graph_json) as unknown, row.text),
    graphFingerprint: row.graph_fingerprint,
    manuscriptGeneration: row.manuscript_generation,
    analysisGeneration: row.analysis_generation,
    text: row.text,
    projection,
    links,
    notes,
    definitionRevisions: storedRevisions(row.definition_revisions_json),
    redactedDefinitionIds: storedIds(row.redacted_definition_ids_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function storedIds(json: string): string[] {
  const parsed = JSON.parse(json) as unknown;
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
    throw new Error('analysis candidate is invalid');
  }
  return parsed;
}

function storedRevisions(json: string): StoredDefinitionRevision[] {
  const parsed = JSON.parse(json) as unknown;
  if (!Array.isArray(parsed)) throw new Error('analysis candidate is invalid');
  return parsed.map((item) => {
    if (typeof item !== 'object' || item === null) throw new Error('analysis candidate is invalid');
    const record = item as Record<string, unknown>;
    if (
      typeof record.definitionId !== 'string' ||
      typeof record.revision !== 'number' ||
      typeof record.fieldType !== 'string' ||
      !Array.isArray(record.values)
    ) {
      throw new Error('analysis candidate is invalid');
    }
    return {
      definitionId: record.definitionId,
      revision: record.revision,
      fieldType: record.fieldType,
      values: record.values.map((value) => storedValue(value)),
    };
  });
}

function storedValue(value: unknown): StoredDefinitionRevision['values'][number] {
  if (typeof value !== 'object' || value === null) throw new Error('analysis candidate is invalid');
  const record = value as Record<string, unknown>;
  if (
    typeof record.targetType !== 'string' ||
    typeof record.targetId !== 'string' ||
    !('value' in record)
  ) {
    throw new Error('analysis candidate is invalid');
  }
  const captured: StoredDefinitionRevision['values'][number] = {
    targetType: record.targetType,
    targetId: record.targetId,
    value: record.value,
  };
  if (typeof record.lexemeId === 'string') captured.lexemeId = record.lexemeId;
  if (typeof record.unitId === 'string') captured.unitId = record.unitId;
  return captured;
}

function readProjection(
  db: SqliteDatabase,
  unitId: string,
): { tokens: ProjectedToken[]; morphemes: ProjectedMorpheme[] } {
  const tokenRows = db
    .prepare(
      `SELECT id, unit_id, token_index, form_json, gloss_json, pos, provenance_json, created_at, updated_at
       FROM tokens WHERE unit_id = ? ORDER BY token_index, id`,
    )
    .all(unitId) as {
    id: string;
    unit_id: string;
    token_index: number;
    form_json: string;
    gloss_json: string;
    pos: string | null;
    provenance_json: string | null;
    created_at: string;
    updated_at: string;
  }[];
  const morphemeRows = db
    .prepare(
      `SELECT id, token_id, morpheme_index, form_json, gloss_json, pos, provenance_json,
              surface_parts_json, created_at, updated_at
       FROM morphemes
       WHERE token_id IN (SELECT id FROM tokens WHERE unit_id = ?)
       ORDER BY morpheme_index, id`,
    )
    .all(unitId) as {
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
  }[];
  return {
    tokens: tokenRows.map((row) => ({
      id: row.id,
      unitId: row.unit_id,
      tokenIndex: row.token_index,
      form: objectJson(row.form_json),
      gloss: objectJson(row.gloss_json),
      pos: row.pos,
      provenance:
        row.provenance_json === null ? null : (JSON.parse(row.provenance_json) as unknown),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    morphemes: morphemeRows.map((row) => ({
      id: row.id,
      tokenId: row.token_id,
      morphemeIndex: row.morpheme_index,
      form: objectJson(row.form_json),
      gloss: objectJson(row.gloss_json),
      pos: row.pos,
      provenance:
        row.provenance_json === null ? null : (JSON.parse(row.provenance_json) as unknown),
      surfaceParts: JSON.parse(row.surface_parts_json) as AnalysisGraphSurfacePart[],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
}

function readLinks(db: SqliteDatabase, targetIds: readonly string[]): AnalysisAssociationLink[] {
  const select = db.prepare(
    `SELECT id, target_type, target_id, lexeme_id, sense_id, role, confidence, provenance_json,
            created_at, updated_at
     FROM token_lexeme_links WHERE target_id = ? AND attachment = 'active' ORDER BY id`,
  );
  const links: AnalysisAssociationLink[] = [];
  for (const targetId of targetIds) {
    const rows = select.all(targetId) as {
      id: string;
      target_type: string;
      target_id: string;
      lexeme_id: string;
      sense_id: string | null;
      role: string | null;
      confidence: number | null;
      provenance_json: string | null;
      created_at: string;
      updated_at: string;
    }[];
    for (const row of rows) {
      links.push({
        id: row.id,
        targetType: row.target_type,
        targetId: row.target_id,
        lexemeId: row.lexeme_id,
        senseId: row.sense_id,
        role: row.role,
        confidence: row.confidence,
        provenance:
          row.provenance_json === null ? null : (JSON.parse(row.provenance_json) as unknown),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    }
  }
  return links;
}

function readNotes(db: SqliteDatabase, targetIds: readonly string[]): AnalysisAssociationNote[] {
  const select = db.prepare(
    `SELECT id, target_type, target_id, body, created_at, updated_at
     FROM notes WHERE target_id = ? AND attachment = 'active' ORDER BY id`,
  );
  const notes: AnalysisAssociationNote[] = [];
  for (const targetId of targetIds) {
    const rows = select.all(targetId) as {
      id: string;
      target_type: string;
      target_id: string;
      body: string;
      created_at: string;
      updated_at: string;
    }[];
    for (const row of rows) {
      notes.push({
        id: row.id,
        targetType: row.target_type,
        targetId: row.target_id,
        body: row.body,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    }
  }
  return notes;
}

function objectJson(value: string): Record<string, string> {
  const parsed = JSON.parse(value) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('analysis projection is invalid');
  }
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(parsed)) {
    if (typeof item !== 'string') throw new Error('analysis projection is invalid');
    out[key] = item;
  }
  return out;
}
