import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { releaseAllProjectLocks, PROJECT_LOCK_NAME } from '../../desktop/skeleton/projectLock';
import { applyAnalysis } from './analysis';
import { listAnalysisCandidates } from './analysisCandidates';
import { mergeAnalysisNodes, restoreAnalysis, splitAnalysisNode } from './analysisRestore';
import { openProject } from './openProject';
import { getAnalysisRoot, updateUnitText, writeAnalysisRoot } from './units';

const roots: string[] = [];
const T = '2026-10-25T00:00:00.000Z';

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
  db.prepare(
    `INSERT INTO notes (id, target_type, target_id, body, created_at, updated_at)
     VALUES (?, 'token', ?, ?, ?, ?)`,
  ).run(`note-${id}`, targetId, 'original', T, T);
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
): { attachment: string; body: string } {
  return db.prepare('SELECT attachment, body FROM notes WHERE id = ?').get(id) as {
    attachment: string;
    body: string;
  };
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
    });
    expect(reopened.db.prepare('SELECT COUNT(*) AS n FROM analysis_candidates').get()).toEqual({
      n: 0,
    });
    expect(reopened.db.prepare('SELECT generation FROM manuscripts').get()).toEqual({
      generation: 0,
    });
    reopened.close();
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
      .prepare('UPDATE notes SET body = ?, updated_at = ? WHERE id = ?')
      .run('later', '2099-01-01T00:00:00.000Z', 'note-l1');
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
});

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
