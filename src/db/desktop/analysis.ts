import type Database from 'better-sqlite3';
import {
  analysisGraphFingerprint,
  validateAnalysisGraphPayload,
  type AnalysisGraphDomain,
  type AnalysisGraphNode,
  type AnalysisGraphPayload,
  type AnalysisGraphSurfacePart,
} from '../../annotation/analysisGraphDomain';
import {
  projectAnalysisGraph,
  type ProjectedMorpheme,
  type ProjectedToken,
} from '../../annotation/analysisGraphDomainProjection';
import { getAnalysisRoot, type AnalysisRoot } from './units';

type SqliteDatabase = InstanceType<typeof Database>;

export interface AnalysisApplyResult {
  root: AnalysisRoot;
  tokens: ProjectedToken[];
  morphemes: ProjectedMorpheme[];
}

interface MapChange {
  action: 'node.setMapValue' | 'node.removeMapKey' | 'node.clearMap';
  nodeId: string;
  field: 'form' | 'gloss';
  key?: string;
  value?: string;
}

interface FieldChange {
  action: 'node.setField' | 'node.removeField';
  nodeId: string;
  field: string;
  value?: string;
}

interface ReorderChange {
  action: 'node.reorder';
  indexes: { nodeId: string; index: number }[];
}

type AnalysisChange = MapChange | FieldChange | ReorderChange;

const SET_FIELDS = new Set(['pos', 'languageId', 'lexemeId']);

export function applyAnalysis(
  db: SqliteDatabase,
  input: {
    unitId: string;
    expected: {
      manuscriptGeneration: number;
      analysisGeneration: number;
      graphFingerprint: string;
    };
    changes: unknown[];
  },
  afterWrite?: () => void,
): AnalysisApplyResult {
  const changes = parseChanges(input.changes);
  const reorderOnly = changes.every((change) => change.action === 'node.reorder');
  if (!reorderOnly && changes.some((change) => change.action === 'node.reorder')) {
    throw new Error('reorder cannot be combined with another edit');
  }
  const write = db.transaction(() => {
    const current = getAnalysisRoot(db, input.unitId);
    if (!current?.graph) throw new Error('analysis graph is missing');
    const manuscriptGeneration = readManuscriptGeneration(db, input.unitId);
    if (
      manuscriptGeneration !== input.expected.manuscriptGeneration ||
      current.analysisGeneration !== input.expected.analysisGeneration ||
      current.graphFingerprint !== input.expected.graphFingerprint
    ) {
      throw new Error('analysis credentials do not match');
    }
    const nextGraph = structuredClone(current.graph);
    for (const change of changes) applyChange(nextGraph, change);
    const graph = validateAnalysisGraphPayload(nextGraph, current.graph.text);
    const fingerprint = analysisGraphFingerprint(graph);
    const generation = reorderOnly ? current.analysisGeneration : current.analysisGeneration + 1;
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE units
       SET analysis_graph_json = ?, analysis_generation = ?, graph_fingerprint = ?, updated_at = ?
       WHERE id = ?`,
    ).run(JSON.stringify(graph), generation, fingerprint, now, input.unitId);
    const projected = projectAnalysisGraph(graph, input.unitId);
    replaceProjection(db, input.unitId, projected.tokens, projected.morphemes);
    afterWrite?.();
    const stored = getAnalysisRoot(db, input.unitId);
    const readBack = readProjection(db, input.unitId);
    if (
      !stored?.graph ||
      stored.analysisGeneration !== generation ||
      stored.graphFingerprint !== fingerprint ||
      JSON.stringify(stored.graph) !== JSON.stringify(graph) ||
      JSON.stringify(readBack) !== JSON.stringify(projected)
    ) {
      throw new Error('analysis apply readback failed');
    }
    return { root: stored, tokens: readBack.tokens, morphemes: readBack.morphemes };
  });
  return write();
}

function readManuscriptGeneration(db: SqliteDatabase, unitId: string): number {
  const row = db
    .prepare(
      `SELECT manuscripts.generation AS generation
       FROM units
       JOIN layers ON layers.id = units.layer_id
       JOIN manuscripts ON manuscripts.id = layers.manuscript_id
       WHERE units.id = ?`,
    )
    .get(unitId) as { generation: number } | undefined;
  if (!row) throw new Error('unit is missing');
  return row.generation;
}

export function replaceProjection(
  db: SqliteDatabase,
  unitId: string,
  tokens: ProjectedToken[],
  morphemes: ProjectedMorpheme[],
): void {
  db.prepare(
    `DELETE FROM morphemes
     WHERE token_id IN (SELECT id FROM tokens WHERE unit_id = ?)`,
  ).run(unitId);
  db.prepare('DELETE FROM tokens WHERE unit_id = ?').run(unitId);
  const insertToken = db.prepare(
    `INSERT INTO tokens (
      id, unit_id, token_index, form_json, gloss_json, pos, provenance_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const token of tokens) {
    insertToken.run(
      token.id,
      token.unitId,
      token.tokenIndex,
      JSON.stringify(token.form),
      JSON.stringify(token.gloss),
      token.pos,
      token.provenance === null ? null : JSON.stringify(token.provenance),
      token.createdAt,
      token.updatedAt,
    );
  }
  const insertMorpheme = db.prepare(
    `INSERT INTO morphemes (
      id, token_id, morpheme_index, form_json, gloss_json, pos, provenance_json,
      surface_parts_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const morpheme of morphemes) {
    insertMorpheme.run(
      morpheme.id,
      morpheme.tokenId,
      morpheme.morphemeIndex,
      JSON.stringify(morpheme.form),
      JSON.stringify(morpheme.gloss),
      morpheme.pos,
      morpheme.provenance === null ? null : JSON.stringify(morpheme.provenance),
      JSON.stringify(morpheme.surfaceParts),
      morpheme.createdAt,
      morpheme.updatedAt,
    );
  }
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
  const tokens = tokenRows.map((row) => ({
    id: row.id,
    unitId: row.unit_id,
    tokenIndex: row.token_index,
    form: JSON.parse(row.form_json) as Record<string, string>,
    gloss: JSON.parse(row.gloss_json) as Record<string, string>,
    pos: row.pos,
    provenance: row.provenance_json === null ? null : (JSON.parse(row.provenance_json) as unknown),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
  const morphemeRows = db
    .prepare(
      `SELECT morphemes.id, morphemes.token_id, morphemes.morpheme_index, morphemes.form_json,
              morphemes.gloss_json, morphemes.pos, morphemes.provenance_json,
              morphemes.surface_parts_json, morphemes.created_at, morphemes.updated_at
       FROM morphemes
       JOIN tokens ON tokens.id = morphemes.token_id
       WHERE tokens.unit_id = ?
       ORDER BY morphemes.token_id, morphemes.morpheme_index, morphemes.id`,
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
  const morphemes = morphemeRows.map((row) => ({
    id: row.id,
    tokenId: row.token_id,
    morphemeIndex: row.morpheme_index,
    form: JSON.parse(row.form_json) as Record<string, string>,
    gloss: JSON.parse(row.gloss_json) as Record<string, string>,
    pos: row.pos,
    provenance: row.provenance_json === null ? null : (JSON.parse(row.provenance_json) as unknown),
    surfaceParts: JSON.parse(row.surface_parts_json) as AnalysisGraphSurfacePart[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
  return { tokens, morphemes };
}

function applyChange(graph: AnalysisGraphPayload, change: AnalysisChange): void {
  if (change.action === 'node.reorder') {
    for (const item of change.indexes) {
      const node = requireLinear(graph, item.nodeId);
      if (node.domain === undefined) throw new Error('token domain is missing');
      node.domain.index = item.index;
    }
    rewriteNext(graph);
    return;
  }
  const node = requireLinear(graph, change.nodeId);
  if (node.domain === undefined) throw new Error('token domain is missing');
  let field: string;
  if (change.action === 'node.setField' || change.action === 'node.removeField') {
    applyField(node, change);
    field = change.field;
  } else if (
    change.action === 'node.setMapValue' ||
    change.action === 'node.removeMapKey' ||
    change.action === 'node.clearMap'
  ) {
    applyMap(node.domain, change);
    field =
      change.action === 'node.clearMap' || change.key === undefined
        ? change.field
        : `${change.field}:${change.key}`;
  } else {
    throw new Error('analysis change is invalid');
  }
  node.domain.edits = [
    ...(node.domain.edits ?? []),
    { at: new Date().toISOString(), actorType: 'human', fields: [field] },
  ];
  if (node.residue !== undefined) {
    node.residue = node.residue.map((item) => ({ ...item, review: 'needs-review' as const }));
  }
}

function applyMap(domain: AnalysisGraphDomain, change: MapChange): void {
  if (change.action === 'node.clearMap') {
    if (change.field === 'form') domain.form = {};
    else domain.gloss = {};
    return;
  }
  if (change.key === undefined || change.key.length === 0)
    throw new Error('analysis map key is missing');
  const map = change.field === 'form' ? domain.form : (domain.gloss ?? {});
  if (change.action === 'node.removeMapKey') {
    if (!(change.key in map)) throw new Error('analysis map key is missing');
    const next = { ...map };
    delete next[change.key];
    if (change.field === 'form') domain.form = next;
    else domain.gloss = next;
    return;
  }
  if (typeof change.value !== 'string') throw new Error('analysis map value must be a string');
  const next = { ...map, [change.key]: change.value };
  if (change.field === 'form') domain.form = next;
  else domain.gloss = next;
}

function applyField(node: AnalysisGraphNode, change: FieldChange): void {
  if (node.domain === undefined) throw new Error('token domain is missing');
  if (change.action === 'node.removeField') {
    if (change.field !== 'gloss') throw new Error('analysis field cannot be removed');
    delete node.domain.gloss;
    return;
  }
  if (!SET_FIELDS.has(change.field)) throw new Error('analysis field cannot be set');
  if (change.field === 'languageId' && node.type !== 'token') {
    throw new Error('languageId is only valid on a token');
  }
  if (typeof change.value !== 'string' || change.value.length === 0) {
    throw new Error('analysis field value is missing');
  }
  if (change.field === 'pos') node.domain.pos = change.value;
  else if (change.field === 'lexemeId') node.domain.lexemeId = change.value;
  else node.domain.languageId = change.value;
}

function rewriteNext(graph: AnalysisGraphPayload): void {
  const nextRelations = graph.relations.filter((relation) => relation.type === 'next');
  if (nextRelations.length === 0) return;
  const memberIds = new Set<string>();
  for (const relation of nextRelations) {
    memberIds.add(relation.sourceId);
    memberIds.add(relation.targetId);
  }
  const members = graph.nodes.filter((node) => memberIds.has(node.id));
  if (members.length !== nextRelations.length + 1)
    throw new Error('analysis next chain is not linear');
  const incoming = new Set(nextRelations.map((relation) => relation.targetId));
  const starts = members.filter((node) => !incoming.has(node.id));
  if (starts.length !== 1 || starts[0] === undefined)
    throw new Error('analysis next chain is not linear');
  const ordered: AnalysisGraphNode[] = [];
  let cursor: string | undefined = starts[0].id;
  const bySource = new Map(nextRelations.map((relation) => [relation.sourceId, relation]));
  while (cursor !== undefined) {
    const node = members.find((item) => item.id === cursor);
    if (node === undefined || ordered.includes(node))
      throw new Error('analysis next chain is not linear');
    ordered.push(node);
    cursor = bySource.get(cursor)?.targetId;
  }
  if (ordered.length !== members.length) throw new Error('analysis next chain is not linear');
  const byIndex = [...ordered].sort(
    (left, right) => (left.domain?.index ?? 0) - (right.domain?.index ?? 0),
  );
  for (let index = 0; index < nextRelations.length; index += 1) {
    const relation = bySource.get(ordered[index]?.id ?? '');
    const source = byIndex[index];
    const target = byIndex[index + 1];
    if (relation === undefined || source === undefined || target === undefined) {
      throw new Error('analysis next chain is not linear');
    }
    relation.sourceId = source.id;
    relation.targetId = target.id;
  }
}

function requireLinear(graph: AnalysisGraphPayload, nodeId: string): AnalysisGraphNode {
  const node = graph.nodes.find((item) => item.id === nodeId);
  if (!node) throw new Error(`analysis node is missing: ${nodeId}`);
  if (node.type !== 'token' && node.type !== 'morpheme') {
    throw new Error('analysis edit requires a token or morpheme');
  }
  return node;
}

function parseChanges(value: unknown[]): AnalysisChange[] {
  if (value.length === 0) throw new Error('analysis edit is empty');
  return value.map(parseChange);
}

function parseChange(value: unknown): AnalysisChange {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('analysis change is invalid');
  }
  const change = value as Record<string, unknown>;
  const action = change.action;
  if (action === 'node.reorder') {
    if (!Array.isArray(change.indexes) || change.indexes.length === 0) {
      throw new Error('analysis reorder is empty');
    }
    return {
      action,
      indexes: change.indexes.map((item) => {
        if (typeof item !== 'object' || item === null)
          throw new Error('analysis reorder is invalid');
        const row = item as Record<string, unknown>;
        if (typeof row.nodeId !== 'string' || row.nodeId.length === 0) {
          throw new Error('analysis reorder is invalid');
        }
        if (typeof row.index !== 'number' || !Number.isInteger(row.index) || row.index < 0) {
          throw new Error('analysis reorder is invalid');
        }
        return { nodeId: row.nodeId, index: row.index };
      }),
    };
  }
  if (
    action !== 'node.setMapValue' &&
    action !== 'node.removeMapKey' &&
    action !== 'node.clearMap' &&
    action !== 'node.setField' &&
    action !== 'node.removeField'
  ) {
    throw new Error('analysis change is invalid');
  }
  if (typeof change.nodeId !== 'string' || change.nodeId.length === 0) {
    throw new Error('analysis node is missing');
  }
  if (action === 'node.setField' || action === 'node.removeField') {
    if (typeof change.field !== 'string') throw new Error('analysis field is missing');
    const fieldChange: FieldChange = { action, nodeId: change.nodeId, field: change.field };
    if (typeof change.value === 'string') fieldChange.value = change.value;
    return fieldChange;
  }
  if (change.field !== 'form' && change.field !== 'gloss')
    throw new Error('analysis map field is invalid');
  const mapChange: MapChange = { action, nodeId: change.nodeId, field: change.field };
  if (typeof change.key === 'string') mapChange.key = change.key;
  if (typeof change.value === 'string') mapChange.value = change.value;
  return mapChange;
}
