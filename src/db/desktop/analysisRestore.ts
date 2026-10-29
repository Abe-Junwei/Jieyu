import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import {
  analysisGraphFingerprint,
  assertEditedSurfaceParts,
  validateAnalysisGraphPayload,
  type AnalysisGraphPayload,
} from '../../annotation/analysisGraphDomain';
import { projectAnalysisGraph } from '../../annotation/analysisGraphDomainProjection';
import { assertTokenLanguages, replaceProjection, syncProjectedLinks } from './analysis';
import { unitBelongsToDeletedManuscript } from './manuscripts';
import {
  detachAnalysisAssociations,
  getAnalysisCandidate,
  insertAnalysisCandidate,
  insertReviewSnapshot,
  markSuggestionAccepted,
  nodeIdsOf,
  readAnalysisMaterial,
  rejectOtherPendingSuggestions,
  requireCurrentCandidateLifecycle,
  type AnalysisAssociationLink,
  type AnalysisAssociationNote,
  type AnalysisCandidateRecord,
  type AnalysisMaterial,
} from './analysisCandidates';
import {
  assertDefinitionRevisions,
  assertStoredCustomFields,
  listDefinitions,
} from './customFields';
import { assertRetargetedReferences } from './referenceState';
import { convertSnapshotGraph } from './customFieldMigration';
import { restoreAnalysisNote } from './notes';
import { getAnalysisRoot, getUnit, type AnalysisRoot, type Unit, type UnitTextUndo } from './units';

type SqliteDatabase = InstanceType<typeof Database>;

export interface AnalysisCredentials {
  manuscriptGeneration: number;
  analysisGeneration: number;
  graphFingerprint: string;
}

export interface AnalysisAcceptResult {
  applied: boolean;
  root: AnalysisRoot;
}

export interface DefinitionRevisionBasis {
  definitionId: string;
  revision: number;
}

export interface AnalysisReadState {
  unitId: string;
  text: string;
  graph: AnalysisGraphPayload | null;
  manuscriptGeneration: number;
  analysisGeneration: number;
  graphFingerprint: string;
  definitionRevisions: DefinitionRevisionBasis[];
}

export function readAnalysisState(db: SqliteDatabase, unitId: string): AnalysisReadState {
  const material = readAnalysisMaterial(db, unitId);
  return {
    unitId: material.unitId,
    text: material.text,
    graph: material.graph,
    manuscriptGeneration: material.manuscriptGeneration,
    analysisGeneration: material.analysisGeneration,
    graphFingerprint: material.graphFingerprint,
    definitionRevisions: definitionRevisionBasis(db),
  };
}

function receiveLocalGraph(
  db: SqliteDatabase,
  unitId: string,
  graph: AnalysisGraphPayload,
): AnalysisGraphPayload {
  const batchId = randomUUID();
  db.prepare(
    `INSERT INTO reception_batches (id, unit_id, source_kind, created_at) VALUES (?, ?, 'accept', ?)`,
  ).run(batchId, unitId, new Date().toISOString());
  const nodeIds = new Map<string, string>();
  const relationIds = new Map<string, string>();
  const remember = (scope: 'node' | 'relation', localId: string, into: Map<string, string>) => {
    if (into.has(localId)) throw new Error('local id is duplicated');
    const projectId = randomUUID();
    into.set(localId, projectId);
    db.prepare(
      `INSERT INTO local_id_map (batch_id, scope, local_id, project_id) VALUES (?, ?, ?, ?)`,
    ).run(batchId, scope, localId, projectId);
  };
  for (const node of graph.nodes) remember('node', node.id, nodeIds);
  for (const relation of graph.relations) remember('relation', relation.id, relationIds);
  const received = structuredClone(graph);
  for (const node of received.nodes) {
    node.id = nodeIds.get(node.id) ?? node.id;
    if (node.surfaceParts !== undefined) {
      node.surfaceParts = node.surfaceParts.map((part) => ({
        ...part,
        tokenId: nodeIds.get(part.tokenId) ?? part.tokenId,
      }));
    }
    if (node.customFields !== undefined) {
      node.customFields = remapRefs(node.customFields, unitId, nodeIds, relationIds);
    }
  }
  for (const relation of received.relations) {
    relation.id = relationIds.get(relation.id) ?? relation.id;
    relation.sourceId = nodeIds.get(relation.sourceId) ?? relation.sourceId;
    relation.targetId = nodeIds.get(relation.targetId) ?? relation.targetId;
    if (relation.customFields !== undefined) {
      relation.customFields = remapRefs(relation.customFields, unitId, nodeIds, relationIds);
    }
  }
  return validateAnalysisGraphPayload(received, graph.text);
}

function remapRefs(
  fields: Record<string, unknown>,
  unitId: string,
  nodeIds: ReadonlyMap<string, string>,
  relationIds: ReadonlyMap<string, string>,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    next[key] = remapRef(value, unitId, nodeIds, relationIds);
  }
  return next;
}

function remapRef(
  value: unknown,
  unitId: string,
  nodeIds: ReadonlyMap<string, string>,
  relationIds: ReadonlyMap<string, string>,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => remapRef(item, unitId, nodeIds, relationIds));
  }
  if (typeof value !== 'object' || value === null) return value;
  const record = value as Record<string, unknown>;
  const targetType = record.targetType;
  if (
    (targetType === 'analysis-node' || targetType === 'analysis-relation') &&
    typeof record.targetId === 'string' &&
    record.unitId === unitId
  ) {
    const projectId = (targetType === 'analysis-node' ? nodeIds : relationIds).get(record.targetId);
    if (projectId === undefined) throw new Error('analysis reference is missing');
    return { ...record, targetId: projectId };
  }
  return value;
}

export function submitAnalysis(
  db: SqliteDatabase,
  input: {
    unitId: string;
    graph: unknown;
    expected: AnalysisCredentials;
    definitionRevisions: readonly DefinitionRevisionBasis[];
  },
): AnalysisCandidateRecord {
  const write = db.transaction(() => {
    const material = readAnalysisMaterial(db, input.unitId);
    assertCredentials(material, input.expected);
    assertRevisionBasis(db, input.definitionRevisions);
    const graph = validateAnalysisGraphPayload(input.graph, material.text);
    const received = material.graph === null ? receiveLocalGraph(db, input.unitId, graph) : graph;
    const record = insertAnalysisCandidate(db, {
      unitId: input.unitId,
      kind: 'suggestion',
      status: 'pending',
      graph: received,
      graphFingerprint: material.graphFingerprint,
      manuscriptGeneration: material.manuscriptGeneration,
      analysisGeneration: material.analysisGeneration,
      text: material.text,
      projection: { tokens: [], morphemes: [] },
      links: [],
      notes: [],
    });
    rejectOtherPendingSuggestions(db, input.unitId, record.id);
    const stored = getAnalysisCandidate(db, record.id);
    if (!stored || stored.status !== 'pending')
      throw new Error('analysis suggestion readback failed');
    return stored;
  });
  return write();
}

export function acceptAnalysis(
  db: SqliteDatabase,
  input: { candidateId: string; expected: AnalysisCredentials },
): AnalysisAcceptResult {
  const write = db.transaction(() => {
    const candidate = requireCandidate(db, input.candidateId);
    if (candidate.kind !== 'suggestion') throw new Error('analysis candidate is not a suggestion');
    requireCurrentCandidateLifecycle(db, candidate);
    const material = readAnalysisMaterial(db, candidate.unitId);
    const root = getAnalysisRoot(db, candidate.unitId);
    if (!root) throw new Error('unit is missing');
    if (candidate.status === 'accepted') return { applied: false, root };
    if (candidate.status !== 'pending') throw new Error('analysis suggestion is not pending');
    if (candidate.redactedDefinitionIds.length > 0) {
      throw new Error('custom field value was removed');
    }
    assertCredentials(material, input.expected);
    if (
      candidate.manuscriptGeneration !== material.manuscriptGeneration ||
      candidate.analysisGeneration !== material.analysisGeneration ||
      candidate.graphFingerprint !== material.graphFingerprint
    ) {
      throw new Error('analysis credentials do not match');
    }
    assertDefinitionRevisions(db, candidate.definitionRevisions);
    const written = writeGraph(db, material, candidate.graph, false);
    detachAnalysisAssociations(
      db,
      material.unitId,
      nodeIdsOf(material.graph).filter((id) => !new Set(nodeIdsOf(written.graph)).has(id)),
      new Date().toISOString(),
    );
    markSuggestionAccepted(db, candidate.id);
    return { applied: true, root: written };
  });
  return write();
}

export function restoreAnalysis(
  db: SqliteDatabase,
  input: { candidateId: string; expected: AnalysisCredentials; conversions?: unknown },
): AnalysisRoot {
  const write = db.transaction(() => {
    const candidate = requireCandidate(db, input.candidateId);
    const restorable =
      candidate.kind === 'review-snapshot' ||
      (candidate.kind === 'suggestion' && candidate.status === 'accepted');
    if (!restorable) throw new Error('analysis candidate is not a snapshot');
    requireCurrentCandidateLifecycle(db, candidate);
    const material = readAnalysisMaterial(db, candidate.unitId);
    if (candidate.text !== material.text) throw new Error('restore text does not match');
    if (candidate.redactedDefinitionIds.length > 0) {
      throw new Error('custom field value was removed');
    }
    assertCredentials(material, input.expected);
    if (material.graph !== null) insertReviewSnapshot(db, material);
    const now = new Date().toISOString();
    detachAnalysisAssociations(db, material.unitId, nodeIdsOf(material.graph), now);
    const written = writeGraph(
      db,
      material,
      convertSnapshotGraph(
        db,
        candidate.graph,
        candidate.unitId,
        candidate.definitionRevisions,
        input.conversions ?? [],
      ),
      true,
    );
    reattach(db, candidate, nodeIdsOf(written.graph), now);
    return written;
  });
  return write();
}

export function undoUnitText(db: SqliteDatabase, undo: UnitTextUndo, afterText?: () => void): Unit {
  const write = db.transaction(() => {
    const material = readAnalysisMaterial(db, undo.unitId);
    if (!unitTextStillAfter(db, material, undo)) throw new Error('unit text undo is stale');
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE unit_texts SET body = ?, updated_at = ? WHERE unit_id = ? AND role = 'transcription'`,
    ).run(undo.prior.text, now, undo.unitId);
    afterText?.();
    if (undo.prior.graph !== null) {
      const refreshed = readAnalysisMaterial(db, undo.unitId);
      const written = writeGraph(db, refreshed, undo.prior.graph, true);
      reattach(
        db,
        {
          unitId: undo.unitId,
          links: undo.prior.links,
          notes: undo.prior.notes,
          createdAt: now,
        },
        nodeIdsOf(written.graph),
        now,
      );
    } else {
      db.prepare('UPDATE units SET updated_at = ? WHERE id = ?').run(now, undo.unitId);
    }
    db.prepare(
      'UPDATE manuscripts SET generation = generation + 1, updated_at = ? WHERE id = ?',
    ).run(now, undo.prior.manuscriptId);
    return readUnitTextUndo(db, undo);
  });
  return write();
}

export function splitAnalysisNode(
  db: SqliteDatabase,
  input: {
    unitId: string;
    nodeId: string;
    into: [unknown, unknown];
    expected: AnalysisCredentials;
  },
): AnalysisRoot {
  const write = db.transaction(() => {
    const material = requireGraph(db, input.unitId);
    assertCredentials(material, input.expected);
    const graph = material.graph;
    if (!graph.nodes.some((node) => node.id === input.nodeId)) {
      throw new Error(`analysis node is missing: ${input.nodeId}`);
    }
    const intoIds = input.into.map(readNodeId);
    if (intoIds.includes(input.nodeId) || new Set(intoIds).size !== intoIds.length) {
      throw new Error('analysis split reuses a node id');
    }
    insertReviewSnapshot(db, material);
    detachAnalysisAssociations(db, input.unitId, [input.nodeId], new Date().toISOString());
    return writeGraph(db, material, {
      ...graph,
      nodes: [...graph.nodes.filter((node) => node.id !== input.nodeId), ...input.into],
      relations: graph.relations.filter(
        (relation) => relation.sourceId !== input.nodeId && relation.targetId !== input.nodeId,
      ),
    });
  });
  return write();
}

export function mergeAnalysisNodes(
  db: SqliteDatabase,
  input: {
    unitId: string;
    nodeIds: [string, string];
    into: unknown;
    expected: AnalysisCredentials;
  },
): AnalysisRoot {
  const write = db.transaction(() => {
    const material = requireGraph(db, input.unitId);
    assertCredentials(material, input.expected);
    const graph = material.graph;
    if (input.nodeIds[0] === input.nodeIds[1]) throw new Error('analysis merge needs two nodes');
    const intoId = readNodeId(input.into);
    if (input.nodeIds.includes(intoId)) {
      throw new Error('analysis merge target reuses an old node id');
    }
    for (const nodeId of input.nodeIds) {
      if (!graph.nodes.some((node) => node.id === nodeId)) {
        throw new Error(`analysis node is missing: ${nodeId}`);
      }
    }
    const removed = new Set<string>(input.nodeIds);
    insertReviewSnapshot(db, material);
    detachAnalysisAssociations(db, input.unitId, input.nodeIds, new Date().toISOString());
    return writeGraph(db, material, {
      ...graph,
      nodes: [...graph.nodes.filter((node) => !removed.has(node.id)), input.into],
      relations: graph.relations.filter(
        (relation) => !removed.has(relation.sourceId) && !removed.has(relation.targetId),
      ),
    });
  });
  return write();
}

function requireCandidate(db: SqliteDatabase, id: string): AnalysisCandidateRecord {
  const candidate = getAnalysisCandidate(db, id);
  if (!candidate) throw new Error('analysis candidate is missing');
  return candidate;
}

function requireGraph(
  db: SqliteDatabase,
  unitId: string,
): AnalysisMaterial & { graph: AnalysisGraphPayload } {
  const material = readAnalysisMaterial(db, unitId);
  if (material.graph === null) throw new Error('analysis graph is missing');
  return { ...material, graph: material.graph };
}

function assertCredentials(material: AnalysisMaterial, expected: AnalysisCredentials): void {
  if (
    material.manuscriptGeneration !== expected.manuscriptGeneration ||
    material.analysisGeneration !== expected.analysisGeneration ||
    material.graphFingerprint !== expected.graphFingerprint
  ) {
    throw new Error('analysis credentials do not match');
  }
}

function definitionRevisionBasis(db: SqliteDatabase): DefinitionRevisionBasis[] {
  return listDefinitions(db)
    .map((definition) => ({ definitionId: definition.id, revision: definition.revision }))
    .sort((left, right) => left.definitionId.localeCompare(right.definitionId));
}

function assertRevisionBasis(
  db: SqliteDatabase,
  supplied: readonly DefinitionRevisionBasis[],
): void {
  const seen = new Set<string>();
  for (const record of supplied) {
    if (seen.has(record.definitionId)) throw new Error('custom field revision does not match');
    seen.add(record.definitionId);
  }
  const current = definitionRevisionBasis(db);
  const given = [...supplied].sort((left, right) =>
    left.definitionId.localeCompare(right.definitionId),
  );
  if (given.length !== current.length) throw new Error('custom field revision does not match');
  for (let index = 0; index < current.length; index += 1) {
    if (
      given[index]?.definitionId !== current[index]?.definitionId ||
      given[index]?.revision !== current[index]?.revision
    ) {
      throw new Error('custom field revision does not match');
    }
  }
}

export function writeGraph(
  db: SqliteDatabase,
  material: AnalysisMaterial,
  graph: unknown,
  historical = false,
): AnalysisRoot {
  const validated = validateAnalysisGraphPayload(graph, material.text);
  if (!historical) {
    assertRetargetedReferences(db, material.graph, validated);
    assertTokenLanguages(db, material.graph, validated);
    assertEditedSurfaceParts(material.graph, validated);
  } else {
    assertTokenLanguages(db, null, validated);
  }
  assertStoredCustomFields(db, validated, material.unitId, {
    prior: material.graph,
    historical,
  });
  const fingerprint = analysisGraphFingerprint(validated);
  const generation = material.analysisGeneration + 1;
  const now = new Date().toISOString();
  const write = db.transaction(() => {
    db.prepare(
      `UPDATE units
       SET analysis_graph_json = ?, analysis_generation = ?, graph_fingerprint = ?, updated_at = ?
       WHERE id = ?`,
    ).run(JSON.stringify(validated), generation, fingerprint, now, material.unitId);
    const projected = projectAnalysisGraph(validated, material.unitId);
    replaceProjection(db, material.unitId, projected.tokens, projected.morphemes);
    syncProjectedLinks(db, validated);
    const stored = getAnalysisRoot(db, material.unitId);
    if (
      !stored?.graph ||
      stored.analysisGeneration !== generation ||
      stored.graphFingerprint !== fingerprint ||
      JSON.stringify(stored.graph) !== JSON.stringify(validated)
    ) {
      throw new Error('analysis write readback failed');
    }
    return stored;
  });
  return write();
}

export interface UnitWord {
  id: string;
  form: string;
  gloss: Record<string, string>;
  pos: string;
}

export function listUnitWords(db: SqliteDatabase, unitId: string): UnitWord[] {
  if (db.prepare('SELECT 1 FROM units WHERE id = ?').get(unitId) === undefined) {
    throw new Error('unit is missing');
  }
  if (unitBelongsToDeletedManuscript(db, unitId)) return [];
  const rows = db
    .prepare(
      'SELECT id, form_json, gloss_json, pos FROM tokens WHERE unit_id = ? ORDER BY token_index, id',
    )
    .all(unitId) as { id: string; form_json: string; gloss_json: string; pos: string | null }[];
  return rows.map((row) => ({
    id: row.id,
    form: wordForm(row.form_json),
    gloss: JSON.parse(row.gloss_json) as Record<string, string>,
    pos: row.pos ?? '',
  }));
}

export function segmentUnitWords(db: SqliteDatabase, unitId: string): UnitWord[] {
  const material = readAnalysisMaterial(db, unitId);
  if (material.graph?.nodes.some((node) => node.type === 'token') === true) {
    return listUnitWords(db, unitId);
  }
  const forms = material.text.split(/\s+/).filter((form) => form.length > 0);
  if (forms.length === 0) throw new Error('unit text is empty');
  const now = new Date().toISOString();
  // ponytail: whitespace split only. Switch to annotationRetokenize when the page needs a preview, morphemes, or non-space orthographies.
  const tokens = forms.map((form, index) => ({
    id: randomUUID(),
    type: 'token' as const,
    label: form,
    domain: {
      form: { default: form },
      index,
      createdAt: now,
      updatedAt: now,
      provenance: { actorType: 'human' as const, method: 'manual' as const, createdAt: now },
    },
  }));
  const graph =
    material.graph === null
      ? {
          payloadVersion: 1 as const,
          id: randomUUID(),
          text: material.text,
          nodes: tokens,
          relations: [],
        }
      : { ...material.graph, nodes: [...material.graph.nodes, ...tokens] };
  writeGraph(db, material, graph);
  return listUnitWords(db, unitId);
}

function wordForm(formJson: string): string {
  const form = JSON.parse(formJson) as { default?: unknown };
  return typeof form.default === 'string' ? form.default : '';
}

export interface UnitMorpheme {
  id: string;
  tokenId: string;
  form: string;
  gloss: Record<string, string>;
}

export function listUnitMorphemes(db: SqliteDatabase, unitId: string): UnitMorpheme[] {
  if (db.prepare('SELECT 1 FROM units WHERE id = ?').get(unitId) === undefined) {
    throw new Error('unit is missing');
  }
  if (unitBelongsToDeletedManuscript(db, unitId)) return [];
  const rows = db
    .prepare(
      `SELECT morphemes.id, morphemes.token_id, morphemes.form_json, morphemes.gloss_json
       FROM morphemes
       JOIN tokens ON tokens.id = morphemes.token_id
       WHERE tokens.unit_id = ?
       ORDER BY tokens.token_index, morphemes.morpheme_index, morphemes.id`,
    )
    .all(unitId) as { id: string; token_id: string; form_json: string; gloss_json: string }[];
  return rows.map((row) => ({
    id: row.id,
    tokenId: row.token_id,
    form: wordForm(row.form_json),
    gloss: JSON.parse(row.gloss_json) as Record<string, string>,
  }));
}

export function segmentUnitMorphemes(db: SqliteDatabase, unitId: string): UnitMorpheme[] {
  const material = readAnalysisMaterial(db, unitId);
  if (material.graph === null) throw new Error('unit has no words');
  if (material.graph.nodes.some((node) => node.type === 'morpheme')) {
    return listUnitMorphemes(db, unitId);
  }
  const now = new Date().toISOString();
  const nodes = [...material.graph.nodes];
  const relations = [...material.graph.relations];
  // ponytail: split on "-" and "=" only. Use the annotation morpheme editor when glosses or non-segmented forms matter.
  for (const token of material.graph.nodes) {
    if (token.type !== 'token' || token.domain === undefined) continue;
    const parts = (token.domain.form.default ?? '').split(/[-=]/).filter((part) => part.length > 0);
    if (parts.length < 2) continue;
    for (const [index, part] of parts.entries()) {
      const id = randomUUID();
      nodes.push({
        id,
        type: 'morpheme',
        label: part,
        domain: { form: { default: part }, index, createdAt: now, updatedAt: now },
        surfaceParts: [{ tokenId: token.id, formKey: 'default' }],
      });
      relations.push({ id: randomUUID(), type: 'hasPart', sourceId: token.id, targetId: id });
    }
  }
  if (nodes.length === material.graph.nodes.length)
    throw new Error('morpheme split needs a separator');
  writeGraph(db, material, { ...material.graph, nodes, relations });
  return listUnitMorphemes(db, unitId);
}

function unitTextStillAfter(
  db: SqliteDatabase,
  material: AnalysisMaterial,
  undo: UnitTextUndo,
): boolean {
  if (
    material.unitId !== undo.unitId ||
    material.text !== undo.after.text ||
    material.graphFingerprint !== undo.after.graphFingerprint ||
    material.analysisGeneration !== undo.after.analysisGeneration ||
    material.manuscriptId !== undo.prior.manuscriptId ||
    material.manuscriptGeneration !== undo.after.manuscriptGeneration
  ) {
    return false;
  }
  if (undo.prior.graph === null) return true;
  if (material.graph !== null) return false;
  const tokens = db
    .prepare('SELECT COUNT(*) AS n FROM tokens WHERE unit_id = ?')
    .get(undo.unitId) as {
    n: number;
  };
  if (tokens.n !== 0) return false;
  const linkRow = db.prepare(
    `SELECT attachment, lexeme_id, sense_id, role, confidence, provenance_json
     FROM token_lexeme_links WHERE id = ?`,
  );
  for (const link of undo.prior.links) {
    const row = linkRow.get(link.id) as
      | {
          attachment: string;
          lexeme_id: string;
          sense_id: string | null;
          role: string | null;
          confidence: number | null;
          provenance_json: string | null;
        }
      | undefined;
    const provenance = row?.provenance_json == null ? null : JSON.parse(row.provenance_json);
    if (
      row === undefined ||
      row.attachment !== 'detached' ||
      row.lexeme_id !== link.lexemeId ||
      row.sense_id !== link.senseId ||
      row.role !== link.role ||
      row.confidence !== link.confidence ||
      JSON.stringify(provenance) !== JSON.stringify(link.provenance ?? null)
    ) {
      return false;
    }
  }
  for (const nodeId of nodeIdsOf(undo.prior.graph)) {
    const active = db
      .prepare(
        `SELECT COUNT(*) AS n FROM token_lexeme_links
         WHERE target_id = ? AND attachment = 'active'`,
      )
      .get(nodeId) as { n: number };
    if (active.n !== 0) return false;
  }
  for (const note of undo.prior.notes) {
    const row = db.prepare('SELECT attachment FROM notes WHERE id = ?').get(note.id) as
      { attachment: string } | undefined;
    if (row?.attachment !== 'detached') return false;
  }
  return true;
}

function readUnitTextUndo(db: SqliteDatabase, undo: UnitTextUndo): Unit {
  const unit = getUnit(db, undo.unitId);
  const root = getAnalysisRoot(db, undo.unitId);
  const generation = db
    .prepare('SELECT generation FROM manuscripts WHERE id = ?')
    .get(undo.prior.manuscriptId) as { generation: number } | undefined;
  if (
    !unit ||
    unit.text !== undo.prior.text ||
    !root ||
    generation?.generation !== undo.after.manuscriptGeneration + 1
  ) {
    throw new Error('unit text undo readback failed');
  }
  if (undo.prior.graph === null) {
    if (root.graph !== null || root.graphFingerprint !== undo.after.graphFingerprint) {
      throw new Error('unit text undo readback failed');
    }
    return unit;
  }
  if (!root.graph || root.graphFingerprint !== analysisGraphFingerprint(undo.prior.graph)) {
    throw new Error('unit text undo readback failed');
  }
  const tokens = db
    .prepare('SELECT COUNT(*) AS n FROM tokens WHERE unit_id = ?')
    .get(undo.unitId) as {
    n: number;
  };
  if (tokens.n !== undo.prior.projectionTokenCount)
    throw new Error('unit text undo readback failed');
  for (const link of undo.prior.links) {
    const row = db
      .prepare('SELECT attachment FROM token_lexeme_links WHERE id = ?')
      .get(link.id) as { attachment: string } | undefined;
    if (row?.attachment !== 'active') throw new Error('unit text undo readback failed');
  }
  for (const note of undo.prior.notes) {
    const row = db.prepare('SELECT attachment FROM notes WHERE id = ?').get(note.id) as
      { attachment: string } | undefined;
    if (row?.attachment !== 'active') throw new Error('unit text undo readback failed');
  }
  return unit;
}

function reattach(
  db: SqliteDatabase,
  candidate: {
    unitId: string;
    links: readonly AnalysisAssociationLink[];
    notes: readonly AnalysisAssociationNote[];
    createdAt: string;
  },
  liveIds: readonly string[],
  now: string,
): void {
  const live = new Set(liveIds);
  const link = db.prepare(
    `INSERT INTO token_lexeme_links (
      id, target_type, target_id, lexeme_id, sense_id, role, confidence, provenance_json,
      attachment, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      target_type = excluded.target_type,
      target_id = excluded.target_id,
      lexeme_id = excluded.lexeme_id,
      sense_id = excluded.sense_id,
      role = excluded.role,
      confidence = excluded.confidence,
      provenance_json = excluded.provenance_json,
      attachment = excluded.attachment,
      updated_at = excluded.updated_at`,
  );
  for (const item of candidate.links) {
    writeLink(link, item, live.has(item.targetId) ? 'active' : 'detached', now);
  }
  for (const item of candidate.notes) {
    restoreAnalysisNote(
      db,
      item,
      candidate.unitId,
      live.has(item.targetId) ? 'active' : 'detached',
      candidate.createdAt,
      now,
    );
  }
}

function writeLink(
  statement: { run: (...params: unknown[]) => unknown },
  item: AnalysisAssociationLink,
  attachment: 'active' | 'detached',
  now: string,
): void {
  statement.run(
    item.id,
    item.targetType,
    item.targetId,
    item.lexemeId,
    item.senseId,
    item.role,
    item.confidence,
    item.provenance === null ? null : JSON.stringify(item.provenance),
    attachment,
    item.createdAt,
    now,
  );
}

function readNodeId(value: unknown): string {
  if (typeof value !== 'object' || value === null || !('id' in value)) {
    throw new Error('analysis node is invalid');
  }
  const id = value.id;
  if (typeof id !== 'string' || id.length === 0) throw new Error('analysis node is invalid');
  return id;
}
