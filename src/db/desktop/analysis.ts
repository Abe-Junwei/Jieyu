import type Database from 'better-sqlite3';
import {
  analysisGraphFingerprint,
  assertEditedSurfaceParts,
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
import { assertStoredCustomFields } from './customFields';
import { assertRetargetedReferences } from './referenceState';
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

interface DisplayChange {
  action: 'graph.setDisplayContext';
  formKey?: string;
  glossKey?: string;
}

interface SurfaceChange {
  action: 'node.setSurfaceParts' | 'node.clearSurfaceParts';
  nodeId: string;
  surfaceParts?: AnalysisGraphSurfacePart[];
}

interface CustomFieldChange {
  action: 'customField.set' | 'customField.remove';
  nodeId?: string;
  relationId?: string;
  definitionId: string;
  value?: unknown;
}

interface LinkFieldChange {
  action: 'link.setField';
  relationId: string;
  field: string;
  value?: unknown;
}

type AnalysisChange =
  | MapChange
  | FieldChange
  | ReorderChange
  | DisplayChange
  | SurfaceChange
  | CustomFieldChange
  | LinkFieldChange;

const SET_FIELDS = new Set(['pos', 'languageId', 'lexemeId']);
const REMOVABLE_FIELDS = new Set(['gloss', 'pos', 'languageId', 'lexemeId']);

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
    assertRetargetedReferences(db, current.graph, graph);
    assertTokenLanguages(db, current.graph, graph);
    assertEditedSurfaceParts(current.graph, graph);
    assertStoredCustomFields(db, graph, input.unitId, { prior: current.graph });
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
    syncProjectedLinks(db, graph);
    afterWrite?.();
    const stored = getAnalysisRoot(db, input.unitId);
    const readBack = readProjection(db, input.unitId);
    if (
      !stored?.graph ||
      stored.analysisGeneration !== generation ||
      stored.graphFingerprint !== fingerprint ||
      JSON.stringify(stored.graph) !== JSON.stringify(graph) ||
      JSON.stringify(orderedProjection(readBack)) !== JSON.stringify(orderedProjection(projected))
    ) {
      throw new Error('analysis apply readback failed');
    }
    return { root: stored, tokens: readBack.tokens, morphemes: readBack.morphemes };
  });
  return write();
}

function orderedProjection(value: { tokens: ProjectedToken[]; morphemes: ProjectedMorpheme[] }): {
  tokens: ProjectedToken[];
  morphemes: ProjectedMorpheme[];
} {
  return {
    tokens: [...value.tokens].sort((left, right) => {
      if (left.tokenIndex !== right.tokenIndex) return left.tokenIndex - right.tokenIndex;
      return left.id.localeCompare(right.id);
    }),
    morphemes: [...value.morphemes].sort((left, right) => {
      const token = left.tokenId.localeCompare(right.tokenId);
      if (token !== 0) return token;
      if (left.morphemeIndex !== right.morphemeIndex) {
        return left.morphemeIndex - right.morphemeIndex;
      }
      return left.id.localeCompare(right.id);
    }),
  };
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
  if (change.action === 'link.setField') {
    applyLinkField(graph, change);
    return;
  }
  if (change.action === 'graph.setDisplayContext') {
    graph.displayContext = {
      ...(change.formKey !== undefined ? { formKey: change.formKey } : {}),
      ...(change.glossKey !== undefined ? { glossKey: change.glossKey } : {}),
    };
    return;
  }
  if (change.action === 'node.reorder') {
    for (const item of change.indexes) {
      const node = requireLinear(graph, item.nodeId);
      if (node.domain === undefined) throw new Error('token domain is missing');
      node.domain.index = item.index;
    }
    rewriteNext(graph);
    return;
  }
  if (change.action === 'customField.set' || change.action === 'customField.remove') {
    applyCustomField(graph, change);
    return;
  }
  if (change.nodeId === undefined) throw new Error('analysis node is missing');
  const node = requireLinear(graph, change.nodeId);
  if (node.domain === undefined) throw new Error('token domain is missing');
  if (change.action === 'node.clearSurfaceParts') {
    delete node.surfaceParts;
    markContentEdit(node, 'surfaceParts');
    return;
  }
  if (change.action === 'node.setSurfaceParts') {
    node.surfaceParts = change.surfaceParts ?? [];
    markContentEdit(node, 'surfaceParts');
    return;
  }
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
  markContentEdit(node, field);
}

function applyCustomField(graph: AnalysisGraphPayload, change: CustomFieldChange): void {
  if (change.relationId !== undefined) {
    applyRelationCustomField(graph, change.relationId, change);
    return;
  }
  if (change.nodeId === undefined) throw new Error('analysis node is missing');
  const node = graph.nodes.find((item) => item.id === change.nodeId);
  if (node === undefined) throw new Error(`analysis node is missing: ${change.nodeId}`);
  const fields = { ...(node.customFields ?? {}) };
  if (change.action === 'customField.remove') {
    if (!(change.definitionId in fields)) throw new Error('custom field value is missing');
    delete fields[change.definitionId];
  } else {
    fields[change.definitionId] = change.value;
  }
  if (Object.keys(fields).length === 0) delete node.customFields;
  else node.customFields = fields;
  markContentEdit(node, `customField:${change.definitionId}`);
}

function applyRelationCustomField(
  graph: AnalysisGraphPayload,
  relationId: string,
  change: CustomFieldChange,
): void {
  const relation = graph.relations.find((item) => item.id === relationId);
  if (relation === undefined) throw new Error(`analysis relation is missing: ${relationId}`);
  const fields = { ...(relation.customFields ?? {}) };
  if (change.action === 'customField.remove') {
    if (!(change.definitionId in fields)) throw new Error('custom field value is missing');
    delete fields[change.definitionId];
  } else {
    fields[change.definitionId] = change.value;
  }
  if (Object.keys(fields).length === 0) delete relation.customFields;
  else relation.customFields = fields;
  if (relation.link === undefined) return;
  const at = new Date().toISOString();
  relation.link = {
    ...relation.link,
    updatedAt: at,
    edits: [
      ...(relation.link.edits ?? []),
      { at, actorType: 'human', fields: [`customField:${change.definitionId}`] },
    ],
  };
}

function markContentEdit(node: AnalysisGraphNode, field: string): void {
  if (node.domain !== undefined) {
    node.domain.edits = [
      ...(node.domain.edits ?? []),
      { at: new Date().toISOString(), actorType: 'human', fields: [field] },
    ];
  }
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
    if (!REMOVABLE_FIELDS.has(change.field)) throw new Error('analysis field cannot be removed');
    if (change.field === 'gloss') delete node.domain.gloss;
    else if (change.field === 'pos') delete node.domain.pos;
    else if (change.field === 'languageId') delete node.domain.languageId;
    else delete node.domain.lexemeId;
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

function applyLinkField(graph: AnalysisGraphPayload, change: LinkFieldChange): void {
  const relation = graph.relations.find((item) => item.id === change.relationId);
  if (relation?.link === undefined) throw new Error('analysis link is missing');
  if (change.field !== 'confidence' || typeof change.value !== 'number') {
    throw new Error('analysis field cannot be set');
  }
  if (change.value < 0 || change.value > 1) throw new Error('analysis field value is missing');
  const at = new Date().toISOString();
  relation.link = {
    ...relation.link,
    confidence: change.value,
    updatedAt: at,
    edits: [...(relation.link.edits ?? []), { at, actorType: 'human', fields: ['confidence'] }],
  };
}

export function assertTokenLanguages(
  db: SqliteDatabase,
  before: AnalysisGraphPayload | null,
  after: AnalysisGraphPayload,
): void {
  const previous = new Map((before?.nodes ?? []).map((node) => [node.id, node.domain?.languageId]));
  for (const node of after.nodes) {
    const languageId = node.type === 'token' ? node.domain?.languageId : undefined;
    if (languageId === undefined || previous.get(node.id) === languageId) continue;
    const row = db.prepare('SELECT id FROM languages WHERE id = ?').get(languageId);
    if (row === undefined) throw new Error('language is missing');
  }
}

export function syncProjectedLinks(db: SqliteDatabase, graph: AnalysisGraphPayload): void {
  const projected = graph.nodes.filter(
    (node) => (node.type === 'token' || node.type === 'morpheme') && node.domain !== undefined,
  );
  const ids = new Set(projected.map((node) => node.id));
  const desired = graph.relations.filter(
    (relation) =>
      relation.type === 'linksLexeme' && relation.link !== undefined && ids.has(relation.sourceId),
  );
  const now = new Date().toISOString();
  const upsert = db.prepare(
    `INSERT INTO token_lexeme_links (
      id, target_type, target_id, lexeme_id, sense_id, role, confidence, attachment, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      target_type = excluded.target_type,
      target_id = excluded.target_id,
      lexeme_id = excluded.lexeme_id,
      sense_id = excluded.sense_id,
      role = excluded.role,
      confidence = excluded.confidence,
      attachment = 'active',
      updated_at = excluded.updated_at`,
  );
  for (const relation of desired) {
    const source = projected.find((node) => node.id === relation.sourceId);
    if (source === undefined || relation.link === undefined) continue;
    upsert.run(
      relation.id,
      source.type,
      source.id,
      relation.link.lexemeId,
      relation.link.senseId ?? null,
      relation.link.role ?? null,
      relation.link.confidence ?? null,
      now,
      now,
    );
  }
  if (ids.size === 0) return;
  const targets = [...ids];
  const kept = desired.map((relation) => relation.id);
  const targetSlots = targets.map(() => '?').join(', ');
  const keepSql = kept.length === 0 ? '' : ` AND id NOT IN (${kept.map(() => '?').join(', ')})`;
  db.prepare(
    `UPDATE token_lexeme_links
     SET attachment = 'detached', updated_at = ?
     WHERE attachment = 'active' AND target_id IN (${targetSlots})${keepSql}`,
  ).run(now, ...targets, ...kept);
}

function rewriteNext(graph: AnalysisGraphPayload): void {
  const nextRelations = graph.relations.filter((relation) => relation.type === 'next');
  for (const component of nextComponents(nextRelations)) rewriteChain(graph, component);
}

function nextComponents(
  relations: AnalysisGraphPayload['relations'],
): AnalysisGraphPayload['relations'][] {
  const unused = new Set(relations);
  const components: AnalysisGraphPayload['relations'][] = [];
  while (unused.size > 0) {
    const seed = unused.values().next().value;
    if (seed === undefined) break;
    const ids = new Set([seed.sourceId, seed.targetId]);
    const group = [seed];
    unused.delete(seed);
    let grew = true;
    while (grew) {
      grew = false;
      for (const relation of unused) {
        if (!ids.has(relation.sourceId) && !ids.has(relation.targetId)) continue;
        group.push(relation);
        ids.add(relation.sourceId);
        ids.add(relation.targetId);
        unused.delete(relation);
        grew = true;
      }
    }
    components.push(group);
  }
  return components;
}

function rewriteChain(
  graph: AnalysisGraphPayload,
  nextRelations: AnalysisGraphPayload['relations'],
): void {
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

function customFieldTarget(
  change: Record<string, unknown>,
): { nodeId: string } | { relationId: string } {
  const nodeId =
    typeof change.nodeId === 'string' && change.nodeId.length > 0 ? change.nodeId : undefined;
  const relationId =
    typeof change.relationId === 'string' && change.relationId.length > 0
      ? change.relationId
      : undefined;
  if (nodeId !== undefined && relationId !== undefined) {
    throw new Error('analysis change is invalid');
  }
  if (nodeId !== undefined) return { nodeId };
  if (relationId !== undefined) return { relationId };
  throw new Error('analysis node is missing');
}

function parseChange(value: unknown): AnalysisChange {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('analysis change is invalid');
  }
  const change = value as Record<string, unknown>;
  const action = change.action;
  if (action === 'link.setField') {
    if (typeof change.relationId !== 'string' || change.relationId.length === 0) {
      throw new Error('analysis relation is missing');
    }
    if (typeof change.field !== 'string') throw new Error('analysis field is missing');
    return { action, relationId: change.relationId, field: change.field, value: change.value };
  }
  if (action === 'graph.setDisplayContext') {
    const display: DisplayChange = { action };
    if (typeof change.formKey === 'string') display.formKey = change.formKey;
    if (typeof change.glossKey === 'string') display.glossKey = change.glossKey;
    if (display.formKey === undefined && display.glossKey === undefined) {
      throw new Error('analysis display context is empty');
    }
    return display;
  }
  if (action === 'node.setSurfaceParts' || action === 'node.clearSurfaceParts') {
    if (typeof change.nodeId !== 'string' || change.nodeId.length === 0) {
      throw new Error('analysis node is missing');
    }
    const surface: SurfaceChange = { action, nodeId: change.nodeId };
    if (action === 'node.setSurfaceParts') {
      if (!Array.isArray(change.surfaceParts))
        throw new Error('analysis surface parts are missing');
      surface.surfaceParts = change.surfaceParts as AnalysisGraphSurfacePart[];
    }
    return surface;
  }
  if (action === 'customField.set' || action === 'customField.remove') {
    const target = customFieldTarget(change);
    if (typeof change.definitionId !== 'string' || change.definitionId.length === 0) {
      throw new Error('custom field definition is missing');
    }
    if (action === 'customField.remove') {
      return { action, ...target, definitionId: change.definitionId };
    }
    if (!('value' in change) || change.value === undefined || change.value === null) {
      throw new Error('custom field value is missing');
    }
    return { action, ...target, definitionId: change.definitionId, value: change.value };
  }
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
