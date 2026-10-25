import type Database from 'better-sqlite3';
import {
  analysisGraphFingerprint,
  validateAnalysisGraphPayload,
  type AnalysisGraphPayload,
} from '../../annotation/analysisGraphDomain';
import { projectAnalysisGraph } from '../../annotation/analysisGraphDomainProjection';
import { replaceProjection } from './analysis';
import {
  detachAnalysisAssociations,
  getAnalysisCandidate,
  insertAnalysisCandidate,
  insertReviewSnapshot,
  markSuggestionAccepted,
  nodeIdsOf,
  readAnalysisMaterial,
  rejectOtherPendingSuggestions,
  type AnalysisAssociationLink,
  type AnalysisCandidateRecord,
  type AnalysisMaterial,
} from './analysisCandidates';
import { assertStoredCustomFields } from './customFields';
import { getAnalysisRoot, type AnalysisRoot } from './units';

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

export function submitAnalysis(
  db: SqliteDatabase,
  input: { unitId: string; graph: unknown },
): AnalysisCandidateRecord {
  const write = db.transaction(() => {
    const material = readAnalysisMaterial(db, input.unitId);
    const graph = validateAnalysisGraphPayload(input.graph, material.text);
    const record = insertAnalysisCandidate(db, {
      unitId: input.unitId,
      kind: 'suggestion',
      status: 'pending',
      graph,
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
    const material = readAnalysisMaterial(db, candidate.unitId);
    const root = getAnalysisRoot(db, candidate.unitId);
    if (!root) throw new Error('unit is missing');
    if (candidate.status === 'accepted') return { applied: false, root };
    if (candidate.status !== 'pending') throw new Error('analysis suggestion is not pending');
    assertCredentials(material, input.expected);
    if (
      candidate.manuscriptGeneration !== material.manuscriptGeneration ||
      candidate.analysisGeneration !== material.analysisGeneration ||
      candidate.graphFingerprint !== material.graphFingerprint
    ) {
      throw new Error('analysis credentials do not match');
    }
    const written = writeGraph(db, material, candidate.graph);
    detachAnalysisAssociations(
      db,
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
  input: { candidateId: string; expected: AnalysisCredentials },
): AnalysisRoot {
  const write = db.transaction(() => {
    const candidate = requireCandidate(db, input.candidateId);
    if (candidate.kind !== 'review-snapshot')
      throw new Error('analysis candidate is not a snapshot');
    const material = readAnalysisMaterial(db, candidate.unitId);
    if (candidate.text !== material.text) throw new Error('restore text does not match');
    assertCredentials(material, input.expected);
    if (material.graph !== null) insertReviewSnapshot(db, material);
    const now = new Date().toISOString();
    detachAnalysisAssociations(db, nodeIdsOf(material.graph), now);
    const written = writeGraph(db, material, candidate.graph);
    reattach(db, candidate, nodeIdsOf(written.graph), now);
    return written;
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
    detachAnalysisAssociations(db, [input.nodeId], new Date().toISOString());
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
    detachAnalysisAssociations(db, input.nodeIds, new Date().toISOString());
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

function writeGraph(db: SqliteDatabase, material: AnalysisMaterial, graph: unknown): AnalysisRoot {
  const validated = validateAnalysisGraphPayload(graph, material.text);
  assertStoredCustomFields(db, validated, material.unitId);
  const fingerprint = analysisGraphFingerprint(validated);
  const generation = material.analysisGeneration + 1;
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE units
     SET analysis_graph_json = ?, analysis_generation = ?, graph_fingerprint = ?, updated_at = ?
     WHERE id = ?`,
  ).run(JSON.stringify(validated), generation, fingerprint, now, material.unitId);
  const projected = projectAnalysisGraph(validated, material.unitId);
  replaceProjection(db, material.unitId, projected.tokens, projected.morphemes);
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
}

function reattach(
  db: SqliteDatabase,
  candidate: AnalysisCandidateRecord,
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
  const existingNote = db.prepare('SELECT updated_at FROM notes WHERE id = ?');
  const insertNote = db.prepare(
    `INSERT INTO notes (id, target_type, target_id, body, attachment, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const keepNote = db.prepare(
    'UPDATE notes SET target_type = ?, target_id = ?, attachment = ? WHERE id = ?',
  );
  const replaceNote = db.prepare(
    'UPDATE notes SET target_type = ?, target_id = ?, body = ?, attachment = ?, updated_at = ? WHERE id = ?',
  );
  for (const item of candidate.notes) {
    const attachment = live.has(item.targetId) ? 'active' : 'detached';
    const existing = existingNote.get(item.id) as { updated_at: string } | undefined;
    if (!existing) {
      insertNote.run(
        item.id,
        item.targetType,
        item.targetId,
        item.body,
        attachment,
        item.createdAt,
        now,
      );
      continue;
    }
    if (existing.updated_at > candidate.createdAt) {
      keepNote.run(item.targetType, item.targetId, attachment, item.id);
      continue;
    }
    replaceNote.run(item.targetType, item.targetId, item.body, attachment, now, item.id);
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
