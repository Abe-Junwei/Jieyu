import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { releaseAllProjectLocks, PROJECT_LOCK_NAME } from '../../desktop/skeleton/projectLock';
import { applyAnalysis } from './analysis';
import {
  insertReviewSnapshot,
  listAnalysisCandidates,
  readAnalysisMaterial,
} from './analysisCandidates';
import { createDefinition } from './customFields';
import { removeSense, saveLexemeEntry } from './lexicon';
import {
  acceptAnalysis,
  mergeAnalysisNodes,
  readAnalysisState,
  restoreAnalysis,
  splitAnalysisNode,
  submitAnalysis,
  undoUnitText,
} from './analysisRestore';
import { openProject } from './openProject';
import { getAnalysisRoot, updateUnitText, writeAnalysisRoot, type UnitTextUndo } from './units';
import { deleteManuscript, restoreManuscript } from './manuscripts';

const roots: string[] = [];
const T = '2026-10-25T00:00:00.000Z';

function submitNow(db: InstanceType<typeof Database>, unitId: string, graph: unknown) {
  const state = readAnalysisState(db, unitId);
  return submitAnalysis(db, {
    unitId,
    graph,
    expected: {
      manuscriptGeneration: state.manuscriptGeneration,
      analysisGeneration: state.analysisGeneration,
      graphFingerprint: state.graphFingerprint,
    },
    definitionRevisions: state.definitionRevisions,
  });
}

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-analysis-restore-'));
  roots.push(root);
  return root;
}

function provenance() {
  return { actorType: 'human' as const, method: 'manual' as const, createdAt: T };
}

function token(id: string, index: number, residueId?: string) {
  return {
    id,
    type: 'token' as const,
    label: id,
    domain: {
      form: { default: 'ka' },
      gloss: { zh: '过去' },
      index,
      createdAt: T,
      updatedAt: T,
      provenance: provenance(),
    },
    ...(residueId === undefined
      ? {}
      : {
          residue: [
            {
              id: residueId,
              namespace: 'source',
              batchId: 'b1',
              localId: id,
              body: { keep: true },
              review: 'unreviewed' as const,
              reviews: [],
            },
          ],
        }),
  };
}

function graph(nodes: ReturnType<typeof token>[]) {
  return { payloadVersion: 1 as const, id: 'g1', text: 'ka', nodes, relations: [] };
}

afterEach(() => {
  releaseAllProjectLocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function projectWith(nodes: ReturnType<typeof token>[]) {
  const dir = folder();
  const project = openProject(dir);
  project.db
    .prepare(
      'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run('m1', 'a.wav', 'aa', 'a.wav', 3, T);
  const manuscript = project.manuscripts.create({ title: { zh: '文稿' }, mediaId: 'm1' });
  const layer = project.layers.create({
    manuscriptId: manuscript.id,
    key: 'tx',
    name: { zh: '转写' },
    tierType: 'time-aligned',
    contentType: 'transcription',
  });
  const unit = project.units.create({ layerId: layer.id, startTime: 0, endTime: 1, text: 'ka' });
  const stored = writeAnalysisRoot(project.db, {
    unitId: unit.id,
    graph: graph(nodes),
    expectedAnalysisGeneration: 0,
  });
  return { dir, project, unitId: unit.id, manuscriptId: manuscript.id, stored };
}

function associate(db: InstanceType<typeof Database>, id: string, targetId: string): void {
  db.prepare(
    `INSERT INTO lexemes (id, kind, entry_json, resource_json, created_at, updated_at)
     VALUES (?, 'entry', '{}', NULL, ?, ?)`,
  ).run(`lex-${id}`, T, T);
  db.prepare(
    `INSERT INTO token_lexeme_links (id, target_type, target_id, lexeme_id, created_at, updated_at)
     VALUES (?, 'token', ?, ?, ?, ?)`,
  ).run(id, targetId, `lex-${id}`, T, T);
  const place = db
    .prepare(
      `SELECT units.id AS unit_id, layers.manuscript_id AS manuscript_id
       FROM units
       JOIN layers ON layers.id = units.layer_id
       JOIN json_each(units.analysis_graph_json, '$.nodes') AS node
       WHERE json_extract(node.value, '$.id') = ?`,
    )
    .get(targetId) as { unit_id: string; manuscript_id: string };
  db.prepare(
    `INSERT INTO notes (
      id, anchor_kind, manuscript_id, unit_id, token_id, content_json, created_at, updated_at
    ) VALUES (?, 'token', ?, ?, ?, ?, ?, ?)`,
  ).run(`note-${id}`, place.manuscript_id, place.unit_id, targetId, '{"default":"original"}', T, T);
}

function linkAttachment(db: InstanceType<typeof Database>, id: string): string {
  const row = db.prepare('SELECT attachment FROM token_lexeme_links WHERE id = ?').get(id) as {
    attachment: string;
  };
  return row.attachment;
}

function noteRow(
  db: InstanceType<typeof Database>,
  id: string,
): { attachment: string; body: string; category: string | null } {
  const row = db
    .prepare('SELECT attachment, content_json, category FROM notes WHERE id = ?')
    .get(id) as {
    attachment: string;
    content_json: string;
    category: string | null;
  };
  const content = JSON.parse(row.content_json) as { default?: string };
  return { attachment: row.attachment, body: content.default ?? '', category: row.category };
}

describe('analysis text invalidation', () => {
  it('rolls back the text, graph, projection, links, notes, and both generations', () => {
    const { dir, project, unitId, stored } = projectWith([token('n1', 0, 'r1')]);
    const applied = applyAnalysis(project.db, {
      unitId,
      expected: {
        manuscriptGeneration: 0,
        analysisGeneration: stored.analysisGeneration,
        graphFingerprint: stored.graphFingerprint,
      },
      changes: [
        { action: 'node.setMapValue', nodeId: 'n1', field: 'gloss', key: 'zh', value: '已往' },
      ],
    });
    associate(project.db, 'l1', 'n1');
    expect(() =>
      updateUnitText(project.db, { unitId, text: 'ta' }, () => {
        throw new Error('injected');
      }),
    ).toThrow('injected');
    project.close();

    const reopened = openProject(dir);
    expect(reopened.units.get(unitId)?.text).toBe('ka');
    expect(getAnalysisRoot(reopened.db, unitId)).toEqual(applied.root);
    expect(
      reopened.db.prepare('SELECT COUNT(*) AS n FROM tokens WHERE unit_id = ?').get(unitId),
    ).toEqual({
      n: 1,
    });
    expect(linkAttachment(reopened.db, 'l1')).toBe('active');
    expect(noteRow(reopened.db, 'note-l1')).toEqual({
      attachment: 'active',
      body: 'original',
      category: null,
    });
    expect(reopened.db.prepare('SELECT COUNT(*) AS n FROM analysis_candidates').get()).toEqual({
      n: 0,
    });
    expect(reopened.db.prepare('SELECT generation FROM manuscripts').get()).toEqual({
      generation: 0,
    });
    reopened.close();
  });

  it('leaves the accepted graph in place when the text is unchanged', () => {
    const { project, unitId, stored } = projectWith([token('n1', 0, 'r1')]);
    const updated = updateUnitText(project.db, { unitId, text: 'ka' });
    expect(updated.text).toBe('ka');
    expect(getAnalysisRoot(project.db, unitId)).toEqual(stored);
    expect(listAnalysisCandidates(project.db, unitId)).toEqual([]);
    expect(project.db.prepare('SELECT generation FROM manuscripts').get()).toEqual({
      generation: 0,
    });
    project.close();
  });

  it('rejects a suggestion that still carries the credentials from before a later edit', () => {
    const { project, unitId, stored } = projectWith([token('n1', 0, 'r1')]);
    const before = readAnalysisState(project.db, unitId);
    applyAnalysis(project.db, {
      unitId,
      expected: {
        manuscriptGeneration: before.manuscriptGeneration,
        analysisGeneration: stored.analysisGeneration,
        graphFingerprint: stored.graphFingerprint,
      },
      changes: [
        { action: 'node.setMapValue', nodeId: 'n1', field: 'gloss', key: 'zh', value: '已往' },
      ],
    });
    expect(() =>
      submitAnalysis(project.db, {
        unitId,
        graph: stored.graph,
        expected: {
          manuscriptGeneration: before.manuscriptGeneration,
          analysisGeneration: before.analysisGeneration,
          graphFingerprint: before.graphFingerprint,
        },
        definitionRevisions: before.definitionRevisions,
      }),
    ).toThrow('analysis credentials do not match');
    expect(getAnalysisRoot(project.db, unitId)?.graph?.nodes[0]?.domain?.gloss?.zh).toBe('已往');
    expect(listAnalysisCandidates(project.db, unitId)).toEqual([]);
    project.close();
  });

  it('clears the graph, keeps the old snapshot, and refuses a restore onto different text', () => {
    const { dir, project, unitId, stored } = projectWith([token('n1', 0, 'r1')]);
    applyAnalysis(project.db, {
      unitId,
      expected: {
        manuscriptGeneration: 0,
        analysisGeneration: stored.analysisGeneration,
        graphFingerprint: stored.graphFingerprint,
      },
      changes: [
        { action: 'node.setMapValue', nodeId: 'n1', field: 'gloss', key: 'zh', value: '已往' },
      ],
    });
    associate(project.db, 'l1', 'n1');
    const updated = updateUnitText(project.db, { unitId, text: 'ta' });
    const root = getAnalysisRoot(project.db, unitId);
    const snapshots = listAnalysisCandidates(project.db, unitId);
    expect(updated.text).toBe('ta');
    expect(root?.graph).toBeNull();
    expect(root?.graphFingerprint).toBe('');
    expect(root?.analysisGeneration).toBe(stored.analysisGeneration + 2);
    expect(project.db.prepare('SELECT generation FROM manuscripts').get()).toEqual({
      generation: 1,
    });
    expect(
      project.db.prepare('SELECT COUNT(*) AS n FROM tokens WHERE unit_id = ?').get(unitId),
    ).toEqual({
      n: 0,
    });
    expect(linkAttachment(project.db, 'l1')).toBe('detached');
    expect(noteRow(project.db, 'note-l1').attachment).toBe('detached');
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.text).toBe('ka');
    expect(snapshots[0]?.graph.nodes[0]?.id).toBe('n1');
    expect(snapshots[0]?.projection.tokens).toHaveLength(1);
    expect(snapshots[0]?.links[0]?.id).toBe('l1');
    expect(snapshots[0]?.notes[0]?.body).toBe('original');
    expect(() =>
      restoreAnalysis(project.db, {
        candidateId: snapshots[0]?.id ?? '',
        expected: {
          manuscriptGeneration: 1,
          analysisGeneration: root?.analysisGeneration ?? -1,
          graphFingerprint: '',
        },
      }),
    ).toThrow('restore text does not match');
    expect(getAnalysisRoot(project.db, unitId)?.graph).toBeNull();
    project.close();

    const reopened = openProject(dir);
    expect(reopened.units.get(unitId)?.text).toBe('ta');
    expect(getAnalysisRoot(reopened.db, unitId)?.graph).toBeNull();
    expect(listAnalysisCandidates(reopened.db, unitId)[0]?.text).toBe('ka');
    reopened.close();
  });
});

describe('unit text undo', () => {
  it('restores the previous string, graph, projection, links, and notes in one write', () => {
    const { dir, project, unitId, stored } = projectWith([token('n1', 0, 'r1')]);
    applyAnalysis(project.db, {
      unitId,
      expected: {
        manuscriptGeneration: 0,
        analysisGeneration: stored.analysisGeneration,
        graphFingerprint: stored.graphFingerprint,
      },
      changes: [
        { action: 'node.setMapValue', nodeId: 'n1', field: 'gloss', key: 'zh', value: '已往' },
      ],
    });
    associate(project.db, 'l1', 'n1');
    let undo: UnitTextUndo | undefined;
    updateUnitText(project.db, { unitId, text: 'ta' }, undefined, (record) => {
      undo = record;
    });
    const restored = undoUnitText(project.db, undo ?? fail('missing undo'));
    expect(restored.text).toBe('ka');
    expect(getAnalysisRoot(project.db, unitId)?.graph?.nodes[0]?.domain?.gloss?.zh).toBe('已往');
    expect(
      project.db.prepare('SELECT COUNT(*) AS n FROM tokens WHERE unit_id = ?').get(unitId),
    ).toEqual({ n: 1 });
    expect(linkAttachment(project.db, 'l1')).toBe('active');
    expect(noteRow(project.db, 'note-l1')).toEqual({
      attachment: 'active',
      body: 'original',
      category: null,
    });
    expect(project.db.prepare('SELECT generation FROM manuscripts').get()).toEqual({
      generation: 2,
    });
    project.close();

    const reopened = openProject(dir);
    expect(reopened.units.get(unitId)?.text).toBe('ka');
    expect(getAnalysisRoot(reopened.db, unitId)?.graph?.nodes[0]?.domain?.gloss?.zh).toBe('已往');
    expect(linkAttachment(reopened.db, 'l1')).toBe('active');
    reopened.close();
  });

  it('rolls back a failed undo and refuses a record after a later edit', () => {
    const { project, unitId, stored } = projectWith([token('n1', 0, 'r1')]);
    applyAnalysis(project.db, {
      unitId,
      expected: {
        manuscriptGeneration: 0,
        analysisGeneration: stored.analysisGeneration,
        graphFingerprint: stored.graphFingerprint,
      },
      changes: [
        { action: 'node.setMapValue', nodeId: 'n1', field: 'gloss', key: 'zh', value: '已往' },
      ],
    });
    associate(project.db, 'l1', 'n1');
    let undo: UnitTextUndo | undefined;
    updateUnitText(project.db, { unitId, text: 'ta' }, undefined, (record) => {
      undo = record;
    });
    const recorded = undo ?? fail('missing undo');
    expect(() =>
      undoUnitText(project.db, recorded, () => {
        throw new Error('injected');
      }),
    ).toThrow('injected');
    expect(project.units.get(unitId)?.text).toBe('ta');
    expect(getAnalysisRoot(project.db, unitId)?.graph).toBeNull();
    expect(linkAttachment(project.db, 'l1')).toBe('detached');
    expect(project.db.prepare('SELECT generation FROM manuscripts').get()).toEqual({
      generation: 1,
    });
    updateUnitText(project.db, { unitId, text: 'za' });
    expect(() => undoUnitText(project.db, recorded)).toThrow('unit text undo is stale');
    expect(project.units.get(unitId)?.text).toBe('za');
    expect(getAnalysisRoot(project.db, unitId)?.graph).toBeNull();
    project.close();
  });
});

function fail(message: string): never {
  throw new Error(message);
}

describe('analysis split and merge', () => {
  it('splits a node without carrying its link, note, or residue onto the new nodes', () => {
    const { project, unitId, stored } = projectWith([token('n1', 0, 'r1')]);
    associate(project.db, 'l1', 'n1');
    const expected = {
      manuscriptGeneration: 0,
      analysisGeneration: stored.analysisGeneration,
      graphFingerprint: stored.graphFingerprint,
    };
    const split = splitAnalysisNode(project.db, {
      unitId,
      nodeId: 'n1',
      into: [token('n2', 0), token('n3', 1)],
      expected,
    });
    expect(split.graph?.nodes.map((node) => node.id)).toEqual(['n2', 'n3']);
    expect(split.graph?.nodes.every((node) => node.residue === undefined)).toBe(true);
    expect(split.analysisGeneration).toBe(stored.analysisGeneration + 1);
    expect(linkAttachment(project.db, 'l1')).toBe('detached');
    expect(noteRow(project.db, 'note-l1').attachment).toBe('detached');
    const snapshot = listAnalysisCandidates(project.db, unitId)[0];
    expect(snapshot?.graph.nodes[0]?.residue?.[0]?.id).toBe('r1');
    project.db
      .prepare('UPDATE notes SET content_json = ?, category = ?, updated_at = ? WHERE id = ?')
      .run('{"default":"later"}', 'comment', '2099-01-01T00:00:00.000Z', 'note-l1');
    const restored = restoreAnalysis(project.db, {
      candidateId: snapshot?.id ?? '',
      expected: {
        manuscriptGeneration: 0,
        analysisGeneration: split.analysisGeneration,
        graphFingerprint: split.graphFingerprint,
      },
    });
    expect(restored.graph?.nodes.map((node) => node.id)).toEqual(['n1']);
    expect(restored.graph?.nodes[0]?.residue?.[0]?.id).toBe('r1');
    expect(restored.analysisGeneration).toBe(split.analysisGeneration + 1);
    expect(noteRow(project.db, 'note-l1')).toEqual({
      attachment: 'active',
      body: 'later',
      category: 'comment',
    });
    expect(linkAttachment(project.db, 'l1')).toBe('active');
    expect(project.db.prepare('SELECT generation FROM manuscripts').get()).toEqual({
      generation: 0,
    });
    project.close();
  });

  it('merges two nodes into a new id and leaves the old links and residue behind', () => {
    const { project, unitId, stored } = projectWith([token('n1', 0, 'r1'), token('n2', 1, 'r2')]);
    associate(project.db, 'l1', 'n1');
    associate(project.db, 'l2', 'n2');
    const expected = {
      manuscriptGeneration: 0,
      analysisGeneration: stored.analysisGeneration,
      graphFingerprint: stored.graphFingerprint,
    };
    expect(() =>
      mergeAnalysisNodes(project.db, {
        unitId,
        nodeIds: ['n1', 'n2'],
        into: token('n1', 0),
        expected,
      }),
    ).toThrow('analysis merge target reuses an old node id');
    const merged = mergeAnalysisNodes(project.db, {
      unitId,
      nodeIds: ['n1', 'n2'],
      into: token('n3', 0),
      expected,
    });
    expect(merged.graph?.nodes.map((node) => node.id)).toEqual(['n3']);
    expect(merged.graph?.nodes[0]?.residue).toBeUndefined();
    expect(linkAttachment(project.db, 'l1')).toBe('detached');
    expect(linkAttachment(project.db, 'l2')).toBe('detached');
    const snapshot = listAnalysisCandidates(project.db, unitId)[0];
    expect(snapshot?.graph.nodes.map((node) => node.residue?.[0]?.id)).toEqual(['r1', 'r2']);
    expect(
      project.db
        .prepare('SELECT COUNT(*) AS n FROM token_lexeme_links WHERE target_id = ?')
        .get('n3'),
    ).toEqual({ n: 0 });
    expect(() =>
      mergeAnalysisNodes(project.db, {
        unitId,
        nodeIds: ['n1', 'n2'],
        into: token('n4', 0),
        expected: {
          manuscriptGeneration: 0,
          analysisGeneration: merged.analysisGeneration,
          graphFingerprint: merged.graphFingerprint,
        },
      }),
    ).toThrow('analysis node is missing: n1');
    project.close();
  });

  it('rejects a suggestion whose lexeme or sense disappeared', () => {
    const { project, unitId, stored } = projectWith([token('n1', 0)]);
    if (stored.graph === null) throw new Error('graph is missing');
    const missing = structuredClone(stored.graph);
    const missingNode = missing.nodes[0];
    if (missingNode?.domain === undefined) throw new Error('token is missing');
    missingNode.domain.lexemeId = 'does-not-exist';
    const invented = submitNow(project.db, unitId, missing);
    expect(() =>
      acceptAnalysis(project.db, { candidateId: invented.id, expected: creds(stored) }),
    ).toThrow('lexeme is missing');
    expect(getAnalysisRoot(project.db, unitId)?.graph?.nodes[0]?.domain?.lexemeId).toBeUndefined();

    saveLexemeEntry(project.db, {
      id: 'lex',
      entry: { headword: 'ka', senses: [{ id: 'sense', definitions: [{ text: 'past' }] }] },
    });
    const pointed = structuredClone(stored.graph);
    const pointedNode = pointed.nodes[0];
    if (pointedNode?.domain === undefined) throw new Error('token is missing');
    pointedNode.domain.lexemeId = 'lex';
    const pending = submitNow(project.db, unitId, pointed);
    project.db.prepare('DELETE FROM lexemes WHERE id = ?').run('lex');
    expect(() =>
      acceptAnalysis(project.db, { candidateId: pending.id, expected: creds(stored) }),
    ).toThrow('lexeme is missing');

    saveLexemeEntry(project.db, {
      id: 'lex',
      entry: { headword: 'ka', senses: [{ id: 'sense', definitions: [{ text: 'past' }] }] },
    });
    const linked = structuredClone(stored.graph);
    linked.nodes.push({ id: 'ref', type: 'lexemeRef', label: 'lex' });
    linked.relations.push({
      id: 'l1',
      type: 'linksLexeme',
      sourceId: 'n1',
      targetId: 'ref',
      link: { lexemeId: 'lex', senseId: 'sense', createdAt: T, updatedAt: T },
    });
    const sensed = submitNow(project.db, unitId, linked);
    removeSense(project.db, { lexemeId: 'lex', senseId: 'sense' });
    expect(() =>
      acceptAnalysis(project.db, { candidateId: sensed.id, expected: creds(stored) }),
    ).toThrow('sense is missing');
    expect(getAnalysisRoot(project.db, unitId)?.graphFingerprint).toBe(stored.graphFingerprint);
    project.close();
  });

  it('restores a snapshot lexeme reference after the lexeme is deleted', () => {
    const { project, unitId, stored } = projectWith([token('n1', 0)]);
    saveLexemeEntry(project.db, {
      id: 'lex',
      entry: { headword: 'ka', senses: [{ id: 'sense', definitions: [{ text: 'past' }] }] },
    });
    const linked = applyAnalysis(project.db, {
      unitId,
      expected: creds(stored),
      changes: [{ action: 'node.setField', nodeId: 'n1', field: 'lexemeId', value: 'lex' }],
    });
    const snapshotId = insertReviewSnapshot(project.db, readAnalysisMaterial(project.db, unitId));
    const replaced = writeAnalysisRoot(project.db, {
      unitId,
      graph: graph([token('n1', 0)]),
      expectedAnalysisGeneration: linked.root.analysisGeneration,
    });
    project.db.prepare('DELETE FROM lexemes WHERE id = ?').run('lex');
    const restored = restoreAnalysis(project.db, {
      candidateId: snapshotId,
      expected: creds(replaced),
    });
    expect(restored.graph?.nodes[0]?.domain?.lexemeId).toBe('lex');
    project.close();
  });

  it('restores an accepted suggestion after a later gloss edit', () => {
    const { project, unitId, stored } = projectWith([token('n1', 0)]);
    const submitted = submitNow(project.db, unitId, graph([token('n1', 0)]));
    acceptAnalysis(project.db, { candidateId: submitted.id, expected: creds(stored) });
    const edited = applyAnalysis(project.db, {
      unitId,
      expected: creds(readAnalysisMaterial(project.db, unitId)),
      changes: [
        { action: 'node.setMapValue', nodeId: 'n1', field: 'gloss', key: 'en', value: 'later' },
      ],
    });
    const restored = restoreAnalysis(project.db, {
      candidateId: submitted.id,
      expected: creds(edited.root),
    });
    expect(restored.graph?.nodes[0]?.domain?.gloss).toEqual({ zh: '过去' });
    expect(
      project.db.prepare('SELECT status FROM analysis_candidates WHERE id = ?').get(submitted.id),
    ).toEqual({ status: 'accepted' });
    project.close();
  });

  it('writes a graph lexeme link into the link table', () => {
    const { project, unitId, stored } = projectWith([token('n1', 0)]);
    saveLexemeEntry(project.db, {
      id: 'lex',
      entry: { headword: 'ka', senses: [{ id: 'sense', definitions: [{ text: 'past' }] }] },
    });
    const written = writeAnalysisRoot(project.db, {
      unitId,
      expectedAnalysisGeneration: stored.analysisGeneration,
      graph: {
        ...graph([token('n1', 0)]),
        nodes: [...graph([token('n1', 0)]).nodes, { id: 'ref', type: 'lexemeRef', label: 'lex' }],
        relations: [
          {
            id: 'rel-1',
            type: 'linksLexeme',
            sourceId: 'n1',
            targetId: 'ref',
            link: { lexemeId: 'lex', senseId: 'sense', createdAt: T, updatedAt: T },
          },
        ],
      },
    });
    applyAnalysis(project.db, {
      unitId,
      expected: creds(written),
      changes: [{ action: 'link.setField', relationId: 'rel-1', field: 'confidence', value: 0.8 }],
    });
    expect(project.db.prepare('SELECT id, confidence FROM token_lexeme_links').all()).toEqual([
      { id: 'rel-1', confidence: 0.8 },
    ]);
    const role = applyAnalysis(project.db, {
      unitId,
      expected: creds(getAnalysisRoot(project.db, unitId) ?? stored),
      changes: [{ action: 'link.setField', relationId: 'rel-1', field: 'role', value: 'manual' }],
    });
    const linked = role.root.graph?.relations.find((relation) => relation.id === 'rel-1')?.link;
    expect(linked?.role).toBe('manual');
    expect(linked?.lexemeId).toBe('lex');
    expect(linked?.createdAt).toBe(T);
    expect(linked?.edits?.at(-1)?.fields).toEqual(['role']);
    saveLexemeEntry(project.db, {
      id: 'lex-2',
      entry: { headword: 'ta', senses: [{ id: 'other', definitions: [{ text: 'that' }] }] },
    });
    const unsensed = applyAnalysis(project.db, {
      unitId,
      expected: creds(role.root),
      changes: [{ action: 'link.removeField', relationId: 'rel-1', field: 'senseId' }],
    });
    const moved = applyAnalysis(project.db, {
      unitId,
      expected: creds(unsensed.root),
      changes: [
        { action: 'link.setField', relationId: 'rel-1', field: 'lexemeId', value: 'lex-2' },
      ],
    });
    const movedLink = moved.root.graph?.relations.find((relation) => relation.id === 'rel-1');
    expect(movedLink?.link?.lexemeId).toBe('lex-2');
    expect(movedLink?.link?.senseId).toBeUndefined();
    expect(moved.root.graph?.nodes.find((node) => node.id === movedLink?.targetId)?.label).toBe(
      'lex-2',
    );
    const cleared = applyAnalysis(project.db, {
      unitId,
      expected: creds(moved.root),
      changes: [{ action: 'link.removeField', relationId: 'rel-1', field: 'confidence' }],
    });
    expect(
      cleared.root.graph?.relations.find((relation) => relation.id === 'rel-1')?.link?.confidence,
    ).toBeUndefined();
    expect(
      project.db.prepare('SELECT confidence FROM token_lexeme_links WHERE id = ?').get('rel-1'),
    ).toEqual({
      confidence: null,
    });
    const before = getAnalysisRoot(project.db, unitId);
    expect(() =>
      applyAnalysis(project.db, {
        unitId,
        expected: creds(cleared.root),
        changes: [{ action: 'link.setField', relationId: 'rel-1', field: 'updatedAt', value: T }],
      }),
    ).toThrow('analysis field cannot be set');
    expect(() =>
      applyAnalysis(project.db, {
        unitId,
        expected: creds(cleared.root),
        changes: [{ action: 'link.removeField', relationId: 'rel-1', field: 'updatedAt' }],
      }),
    ).toThrow('analysis field cannot be removed');
    expect(getAnalysisRoot(project.db, unitId)).toEqual(before);
    project.close();
  });

  it('allocates a different project id for the same local node on another unit', () => {
    const project = openProject(folder());
    project.db
      .prepare(
        'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('m1', 'a.wav', 'aa', 'a.wav', 3, T);
    const manuscript = project.manuscripts.create({ title: { zh: '文稿' }, mediaId: 'm1' });
    const layer = project.layers.create({
      manuscriptId: manuscript.id,
      key: 'tx',
      name: { zh: '转写' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    });
    const first = project.units.create({ layerId: layer.id, startTime: 0, endTime: 1, text: 'ka' });
    const second = project.units.create({
      layerId: layer.id,
      startTime: 1,
      endTime: 2,
      text: 'ka',
    });
    const node = token('n1', 0, 'r1');
    const residue = node.residue?.[0];
    if (residue === undefined) throw new Error('residue is missing');
    residue.body = { keep: true, raw: 'n1' } as { keep: boolean };
    const local = graph([node]);
    const accept = (unitId: string) => {
      const submitted = submitNow(project.db, unitId, local);
      return acceptAnalysis(project.db, {
        candidateId: submitted.id,
        expected: creds(
          getAnalysisRoot(project.db, unitId) ?? { analysisGeneration: 0, graphFingerprint: '' },
        ),
      });
    };
    const left = accept(first.id);
    const right = accept(second.id);
    expect(left.root.graph?.nodes[0]?.id).not.toBe('n1');
    expect(right.root.graph?.nodes[0]?.id).not.toBe(left.root.graph?.nodes[0]?.id);
    expect(left.root.graph?.nodes[0]?.residue?.[0]?.body).toEqual({ keep: true, raw: 'n1' });
    project.close();
  });

  it('remaps custom references to nodes and relations received in the same graph', () => {
    const project = openProject(folder());
    project.db
      .prepare(
        'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('m1', 'a.wav', 'aa', 'a.wav', 3, T);
    const manuscript = project.manuscripts.create({ title: { zh: '文稿' }, mediaId: 'm1' });
    const layer = project.layers.create({
      manuscriptId: manuscript.id,
      key: 'tx',
      name: { zh: '转写' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    });
    const first = project.units.create({ layerId: layer.id, startTime: 0, endTime: 1, text: 'ka' });
    const second = project.units.create({
      layerId: layer.id,
      startTime: 1,
      endTime: 2,
      text: 'ka',
    });
    writeAnalysisRoot(project.db, {
      unitId: second.id,
      graph: {
        ...graph([token('kept', 0), token('next', 1)]),
        relations: [{ id: 'r1', type: 'next', sourceId: 'kept', targetId: 'next' }],
      },
      expectedAnalysisGeneration: 0,
    });
    const relationField = createDefinition(project.db, {
      targetType: 'analysis-node',
      name: { en: 'Relation' },
      fieldType: 'ref',
      targetTypes: ['analysis-relation'],
      cardinality: 'one',
    });
    const crossField = createDefinition(project.db, {
      targetType: 'analysis-node',
      name: { en: 'Other unit' },
      fieldType: 'ref',
      targetTypes: ['analysis-relation'],
      cardinality: 'one',
    });
    const nodeField = createDefinition(project.db, {
      targetType: 'analysis-relation',
      name: { en: 'Node' },
      fieldType: 'ref',
      targetTypes: ['analysis-node'],
      cardinality: 'one',
    });
    const local = {
      ...graph([token('n1', 0), token('n2', 1)]),
      nodes: [
        {
          ...token('n1', 0),
          customFields: {
            [relationField.id]: {
              targetType: 'analysis-relation',
              targetId: 'r1',
              unitId: first.id,
            },
            [crossField.id]: { targetType: 'analysis-relation', targetId: 'r1', unitId: second.id },
          },
        },
        token('n2', 1),
      ],
      relations: [
        {
          id: 'r1',
          type: 'next',
          sourceId: 'n1',
          targetId: 'n2',
          customFields: {
            [nodeField.id]: { targetType: 'analysis-node', targetId: 'n1', unitId: first.id },
          },
        },
      ],
    };
    const submitted = submitNow(project.db, first.id, local);
    const accepted = acceptAnalysis(project.db, {
      candidateId: submitted.id,
      expected: creds(
        getAnalysisRoot(project.db, first.id) ?? { analysisGeneration: 0, graphFingerprint: '' },
      ),
    });
    const node = accepted.root.graph?.nodes.find((item) => item.label === 'n1');
    const relation = accepted.root.graph?.relations.find((item) => item.type === 'next');
    expect(node?.customFields?.[relationField.id]).toEqual({
      targetType: 'analysis-relation',
      targetId: relation?.id,
      unitId: first.id,
    });
    expect(relation?.id).not.toBe('r1');
    expect(node?.customFields?.[crossField.id]).toEqual({
      targetType: 'analysis-relation',
      targetId: 'r1',
      unitId: second.id,
    });
    expect(relation?.customFields?.[nodeField.id]).toEqual({
      targetType: 'analysis-node',
      targetId: node?.id,
      unitId: first.id,
    });
    const empty = project.units.create({
      layerId: layer.id,
      startTime: 2,
      endTime: 3,
      text: 'ka',
    });
    expect(() =>
      submitNow(project.db, empty.id, {
        ...graph([token('n1', 0), token('n2', 1)]),
        relations: [{ id: 'r1', type: 'next', sourceId: 'n1', targetId: 'n2' }],
        nodes: [
          {
            ...token('n1', 0),
            customFields: {
              [relationField.id]: {
                targetType: 'analysis-relation',
                targetId: 'missing',
                unitId: empty.id,
              },
            },
          },
          token('n2', 1),
        ],
      }),
    ).toThrow('analysis reference is missing');
    project.close();
  });

  it('refuses an analysis result saved before the manuscript was restored', () => {
    const { project, unitId, manuscriptId } = projectWith([token('n1', 0)]);
    const suggestion = submitNow(project.db, unitId, graph([token('n1', 0), token('n2', 1)]));
    const snapshot = insertReviewSnapshot(project.db, readAnalysisMaterial(project.db, unitId));
    const before = getAnalysisRoot(project.db, unitId)?.analysisGeneration;
    deleteManuscript(project.db, manuscriptId);
    restoreManuscript(project.db, manuscriptId);
    const expected = creds(
      getAnalysisRoot(project.db, unitId) ?? { analysisGeneration: 0, graphFingerprint: '' },
    );
    expect(() => acceptAnalysis(project.db, { candidateId: suggestion.id, expected })).toThrow(
      'analysis candidate is stale',
    );
    expect(() => restoreAnalysis(project.db, { candidateId: snapshot, expected })).toThrow(
      'analysis candidate is stale',
    );
    expect(getAnalysisRoot(project.db, unitId)?.analysisGeneration).toBe(before);
    expect(getAnalysisRoot(project.db, unitId)?.graph?.nodes.map((node) => node.id)).toEqual([
      'n1',
    ]);
    const again = submitNow(project.db, unitId, graph([token('n1', 0), token('n2', 1)]));
    const accepted = acceptAnalysis(project.db, { candidateId: again.id, expected });
    expect(accepted.applied).toBe(true);
    expect(accepted.root.graph?.nodes.map((node) => node.id)).toEqual(['n1', 'n2']);
    project.close();
  });
});

function creds(root: { analysisGeneration: number; graphFingerprint: string }) {
  return {
    manuscriptGeneration: 0,
    analysisGeneration: root.analysisGeneration,
    graphFingerprint: root.graphFingerprint,
  };
}

describe('analysis library version', () => {
  it('rejects a version 6 library without changing its bytes', () => {
    const dir = folder();
    const file = join(dir, 'project.sqlite');
    openProject(dir).close();
    const db = new Database(file);
    db.exec('PRAGMA user_version = 6');
    db.close();
    const before = readFileSync(file);
    expect(() => openProject(dir)).toThrow('project.sqlite is not a Jieyu project library');
    expect(readFileSync(file)).toEqual(before);
    expect(readdirSync(dir).includes(PROJECT_LOCK_NAME)).toBe(false);
  });
});
