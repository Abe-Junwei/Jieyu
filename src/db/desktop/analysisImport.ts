import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  analysisGraphFingerprint,
  assertEditedSurfaceParts,
  validateAnalysisGraphPayload,
  type AnalysisGraphNode,
  type AnalysisGraphPayload,
  type AnalysisGraphRelation,
} from '../../annotation/analysisGraphDomain';
import { projectAnalysisGraph } from '../../annotation/analysisGraphDomainProjection';
import { assertTokenLanguages, replaceProjection, syncProjectedLinks } from './analysis';
import { detachAnalysisAssociations } from './analysisCandidates';
import type { AnalysisCredentials } from './analysisRestore';
import { assertStoredCustomFields } from './customFields';
import { assertRetargetedReferences } from './referenceState';
import { getAnalysisRoot, type AnalysisRoot } from './units';

type SqliteDatabase = InstanceType<typeof Database>;

export interface AnalysisImportCounts {
  updatedNodes: number;
  appendedNodes: number;
  deletedNodes: number;
  updatedRelations: number;
  appendedRelations: number;
  deletedRelations: number;
}

export interface AnalysisImportResult {
  root: AnalysisRoot;
  counts: AnalysisImportCounts;
}

export function importAnalysis(
  db: SqliteDatabase,
  input: {
    unitId: string;
    expected: AnalysisCredentials;
    nodes?: unknown[];
    relations?: unknown[];
    removeNodes?: unknown[];
    removeRelations?: unknown[];
  },
  afterWrite?: () => void,
): AnalysisImportResult {
  const nodes = (input.nodes ?? []).map(importRecord);
  const relations = (input.relations ?? []).map(importRecord);
  const removeNodes = stringList(input.removeNodes ?? [], 'removeNodes');
  const removeRelations = stringList(input.removeRelations ?? [], 'removeRelations');
  if (nodes.length + relations.length + removeNodes.length + removeRelations.length === 0) {
    throw new Error('analysis import is empty');
  }
  const write = db.transaction(() => {
    const current = getAnalysisRoot(db, input.unitId);
    if (!current?.graph) throw new Error('analysis graph is missing');
    const manuscript = db
      .prepare(
        `SELECT manuscripts.generation AS generation
         FROM units
         JOIN layers ON layers.id = units.layer_id
         JOIN manuscripts ON manuscripts.id = layers.manuscript_id
         WHERE units.id = ?`,
      )
      .get(input.unitId) as { generation: number } | undefined;
    if (
      !manuscript ||
      manuscript.generation !== input.expected.manuscriptGeneration ||
      current.analysisGeneration !== input.expected.analysisGeneration ||
      current.graphFingerprint !== input.expected.graphFingerprint
    ) {
      throw new Error('analysis credentials do not match');
    }
    const counts: AnalysisImportCounts = {
      updatedNodes: 0,
      appendedNodes: 0,
      deletedNodes: removeNodes.length,
      updatedRelations: 0,
      appendedRelations: 0,
      deletedRelations: removeRelations.length,
    };
    const graph = structuredClone(current.graph);
    applyImport(graph, nodes, relations, removeNodes, removeRelations, counts);
    const validated = validateAnalysisGraphPayload(graph, current.graph.text);
    assertRetargetedReferences(db, current.graph, validated);
    assertTokenLanguages(db, current.graph, validated);
    assertEditedSurfaceParts(current.graph, validated);
    assertStoredCustomFields(db, validated, input.unitId, { prior: current.graph });
    const fingerprint = analysisGraphFingerprint(validated);
    const generation = current.analysisGeneration + 1;
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE units
       SET analysis_graph_json = ?, analysis_generation = ?, graph_fingerprint = ?, updated_at = ?
       WHERE id = ?`,
    ).run(JSON.stringify(validated), generation, fingerprint, now, input.unitId);
    const projected = projectAnalysisGraph(validated, input.unitId);
    replaceProjection(db, input.unitId, projected.tokens, projected.morphemes);
    syncProjectedLinks(db, validated);
    detachAnalysisAssociations(db, removeNodes, now);
    afterWrite?.();
    const stored = getAnalysisRoot(db, input.unitId);
    if (
      !stored?.graph ||
      stored.analysisGeneration !== generation ||
      stored.graphFingerprint !== fingerprint ||
      JSON.stringify(stored.graph) !== JSON.stringify(validated)
    ) {
      throw new Error('analysis import readback failed');
    }
    return { root: stored, counts };
  });
  return write();
}

function applyImport(
  graph: AnalysisGraphPayload,
  nodes: Record<string, unknown>[],
  relations: Record<string, unknown>[],
  removeNodes: string[],
  removeRelations: string[],
  counts: AnalysisImportCounts,
): void {
  for (const item of nodes) assertImportNode(item);
  for (const item of relations) assertImportRelation(item);
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const relationIds = new Set(graph.relations.map((relation) => relation.id));
  const updatedNodeIds = new Set<string>();
  const updatedRelationIds = new Set<string>();
  for (const item of nodes) {
    if (typeof item.id === 'string') {
      if (!nodeIds.has(item.id)) throw new Error(`analysis node is missing: ${item.id}`);
      if (updatedNodeIds.has(item.id)) throw new Error('analysis import repeats a node id');
      updatedNodeIds.add(item.id);
    }
  }
  for (const item of relations) {
    if (typeof item.id !== 'string' || item.id.length === 0) {
      throw new Error('analysis relation id is missing');
    }
    if (!relationIds.has(item.id)) throw new Error(`analysis relation is missing: ${item.id}`);
    if (updatedRelationIds.has(item.id)) throw new Error('analysis import repeats a relation id');
    updatedRelationIds.add(item.id);
  }
  for (const id of removeNodes) {
    if (!nodeIds.has(id)) throw new Error(`analysis node is missing: ${id}`);
    if (updatedNodeIds.has(id)) throw new Error('analysis import updates and deletes the same id');
  }
  for (const id of removeRelations) {
    if (!relationIds.has(id)) throw new Error(`analysis relation is missing: ${id}`);
    if (updatedRelationIds.has(id))
      throw new Error('analysis import updates and deletes the same id');
  }
  const removedNodes = new Set(removeNodes);
  const requiredRelationRemovals = new Set(
    graph.relations
      .filter(
        (relation) => removedNodes.has(relation.sourceId) || removedNodes.has(relation.targetId),
      )
      .map((relation) => relation.id),
  );
  for (const id of requiredRelationRemovals) {
    if (!removeRelations.includes(id)) {
      throw new Error('analysis node removal leaves a relation');
    }
  }
  for (const item of nodes) {
    if (typeof item.id === 'string') {
      const node = graph.nodes.find((candidate) => candidate.id === item.id);
      if (node === undefined) throw new Error(`analysis node is missing: ${item.id}`);
      mergeNode(node, item);
      counts.updatedNodes += 1;
    } else {
      graph.nodes.push(newNode(graph, item));
      counts.appendedNodes += 1;
    }
  }
  for (const item of relations) {
    const relation = graph.relations.find((candidate) => candidate.id === item.id);
    if (relation === undefined || typeof item.id !== 'string') {
      throw new Error('analysis relation is missing');
    }
    mergeRelation(relation, item);
    counts.updatedRelations += 1;
  }
  const removedRelations = new Set(removeRelations);
  graph.nodes = graph.nodes.filter((node) => !removedNodes.has(node.id));
  graph.relations = graph.relations.filter((relation) => !removedRelations.has(relation.id));
}

function mergeNode(node: AnalysisGraphNode, item: Record<string, unknown>): void {
  if (typeof item.label === 'string') node.label = item.label;
  const domain = objectValue(item.domain);
  if (domain !== null && node.domain !== undefined) {
    const form = objectValue(domain.form);
    if (form !== null) node.domain.form = mergeStrings(node.domain.form, form);
    const gloss = objectValue(domain.gloss);
    if (gloss !== null) node.domain.gloss = mergeStrings(node.domain.gloss ?? {}, gloss);
    if (typeof domain.pos === 'string') node.domain.pos = domain.pos;
    if (typeof domain.index === 'number') node.domain.index = domain.index;
    if (typeof domain.languageId === 'string') node.domain.languageId = domain.languageId;
    if (typeof domain.lexemeId === 'string') node.domain.lexemeId = domain.lexemeId;
  }
  if ('customFields' in item) node.customFields = fieldBag(item.customFields);
  if ('residue' in item) node.residue = residueList(item.residue);
  else if (node.residue !== undefined && domain !== null) {
    node.residue = node.residue.map((residue) => ({ ...residue, review: 'needs-review' as const }));
  }
  if (Array.isArray(item.surfaceParts)) {
    node.surfaceParts = item.surfaceParts as AnalysisGraphNode['surfaceParts'];
  }
}

function mergeRelation(relation: AnalysisGraphRelation, item: Record<string, unknown>): void {
  if (typeof item.role === 'string') {
    if (relation.link !== undefined)
      relation.link = { ...relation.link, role: linkRole(item.role) };
    else relation.role = item.role;
  }
}

function newNode(graph: AnalysisGraphPayload, item: Record<string, unknown>): AnalysisGraphNode {
  if (item.type !== 'token' && item.type !== 'morpheme') {
    throw new Error('analysis import node type is invalid');
  }
  const domain = objectValue(item.domain);
  const form = domain === null ? null : objectValue(domain.form);
  if (domain === null || form === null) throw new Error('analysis import node form is missing');
  const now = new Date().toISOString();
  const used = graph.nodes.flatMap((node) =>
    node.domain?.index === undefined ? [] : [node.domain.index],
  );
  const index =
    typeof domain.index === 'number'
      ? domain.index
      : used.reduce((max, value) => Math.max(max, value), -1) + 1;
  const gloss = objectValue(domain.gloss);
  return {
    id: randomUUID(),
    type: item.type,
    label: typeof item.label === 'string' ? item.label : (stringValue(form.default) ?? 'word'),
    domain: {
      form: stringMap(form),
      ...(gloss === null ? {} : { gloss: stringMap(gloss) }),
      index,
      createdAt: now,
      updatedAt: now,
      provenance: { actorType: 'importer', method: 'import', createdAt: now },
      ...(typeof domain.pos === 'string' ? { pos: domain.pos } : {}),
    },
    ...('customFields' in item ? { customFields: fieldBag(item.customFields) } : {}),
    ...('residue' in item ? { residue: residueList(item.residue) } : {}),
  };
}

const IMPORT_NODE_KEYS = [
  'id',
  'type',
  'label',
  'domain',
  'surfaceParts',
  'customFields',
  'residue',
];
const IMPORT_DOMAIN_KEYS = ['form', 'gloss', 'pos', 'index', 'languageId', 'lexemeId'];
const IMPORT_RELATION_KEYS = ['id', 'role'];

function assertImportNode(item: Record<string, unknown>): void {
  assertKnown(item, IMPORT_NODE_KEYS);
  const domain = objectValue(item.domain);
  if (domain !== null) {
    assertKnown(domain, IMPORT_DOMAIN_KEYS);
    if ('pos' in domain && typeof domain.pos !== 'string') {
      throw new Error('analysis import item is invalid');
    }
  }
}

function assertImportRelation(item: Record<string, unknown>): void {
  assertKnown(item, IMPORT_RELATION_KEYS);
}

function assertKnown(item: Record<string, unknown>, keys: readonly string[]): void {
  for (const key of Object.keys(item)) {
    if (!keys.includes(key)) throw new Error('analysis import item is invalid');
  }
}

function fieldBag(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('analysis import item is invalid');
  }
  return value as Record<string, unknown>;
}

function residueList(value: unknown): NonNullable<AnalysisGraphNode['residue']> {
  if (!Array.isArray(value)) throw new Error('analysis import item is invalid');
  return value as NonNullable<AnalysisGraphNode['residue']>;
}

function mergeStrings(
  current: Record<string, string>,
  incoming: Record<string, unknown>,
): Record<string, string> {
  const next = { ...current };
  for (const [key, value] of Object.entries(incoming)) {
    if (typeof value !== 'string') throw new Error('analysis import map value must be a string');
    next[key] = value;
  }
  return next;
}

function stringMap(value: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'string') throw new Error('analysis import map value must be a string');
    out[key] = item;
  }
  return out;
}

function linkRole(value: string): 'exact' | 'stem' | 'gloss_candidate' | 'manual' {
  if (value === 'exact' || value === 'stem' || value === 'gloss_candidate' || value === 'manual') {
    return value;
  }
  throw new Error('analysis link role is invalid');
}

function importRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('analysis import item is invalid');
  }
  return value as Record<string, unknown>;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  if (value === undefined) return null;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('analysis import item is invalid');
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function stringList(value: unknown[], name: string): string[] {
  return value.map((item) => {
    if (typeof item !== 'string' || item.length === 0) {
      throw new Error(`analysis import ${name} is invalid`);
    }
    return item;
  });
}
