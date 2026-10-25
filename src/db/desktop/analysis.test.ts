import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { releaseAllProjectLocks } from '../../desktop/skeleton/projectLock';
import { applyAnalysis } from './analysis';
import { createDesktopClient } from './client';
import { callDesktopSession } from './desktopCall';
import { openProject } from './openProject';
import { openDesktopSession, requireDesktopSession, resetDesktopSessions } from './projectSession';
import { getAnalysisRoot, writeAnalysisRoot } from './units';

const roots: string[] = [];
const T = '2026-10-25T00:00:00.000Z';

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-analysis-apply-'));
  roots.push(root);
  return root;
}

function provenance() {
  return { actorType: 'human' as const, method: 'manual' as const, createdAt: T };
}

function graph() {
  return {
    payloadVersion: 1 as const,
    id: 'g1',
    text: 'ka',
    nodes: [
      {
        id: 'n1',
        type: 'token' as const,
        label: 'ka',
        domain: {
          form: { default: 'ka', orthoA: 'kā' },
          gloss: { zh: '过去', en: 'past' },
          index: 0,
          createdAt: T,
          updatedAt: T,
          provenance: provenance(),
        },
        residue: [
          {
            id: 'r1',
            namespace: 'source',
            batchId: 'b1',
            localId: 'n1',
            body: { keep: true },
            review: 'unreviewed' as const,
            reviews: [],
          },
        ],
      },
    ],
    relations: [],
  };
}

afterEach(() => {
  resetDesktopSessions();
  releaseAllProjectLocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function seeded() {
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
    graph: graph(),
    expectedAnalysisGeneration: 0,
  });
  return { dir, project, unitId: unit.id, stored };
}

describe('analysis apply', () => {
  it('edits one gloss entry, projects it, and keeps the other values', () => {
    const { dir, project, unitId, stored } = seeded();
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
    const domain = applied.root.graph?.nodes[0]?.domain;
    expect(domain?.form).toEqual({ default: 'ka', orthoA: 'kā' });
    expect(domain?.gloss).toEqual({ zh: '已往', en: 'past' });
    expect(domain?.provenance).toEqual(provenance());
    expect(domain?.edits?.[0]?.fields).toEqual(['gloss:zh']);
    expect(applied.root.graph?.nodes[0]?.residue?.[0]?.review).toBe('needs-review');
    expect(applied.root.analysisGeneration).toBe(stored.analysisGeneration + 1);
    expect(applied.tokens[0]?.gloss).toEqual({ zh: '已往', en: 'past' });
    project.close();

    const reopened = openProject(dir);
    expect(getAnalysisRoot(reopened.db, unitId)).toEqual(applied.root);
    reopened.close();
  });

  it('clears a gloss in three distinct steps and rejects a stale credential', () => {
    const { project, unitId, stored } = seeded();
    const expected = {
      manuscriptGeneration: 0,
      analysisGeneration: stored.analysisGeneration,
      graphFingerprint: stored.graphFingerprint,
    };
    const removed = applyAnalysis(project.db, {
      unitId,
      expected,
      changes: [{ action: 'node.removeMapKey', nodeId: 'n1', field: 'gloss', key: 'zh' }],
    });
    expect(removed.root.graph?.nodes[0]?.domain?.gloss).toEqual({ en: 'past' });
    const cleared = applyAnalysis(project.db, {
      unitId,
      expected: {
        manuscriptGeneration: 0,
        analysisGeneration: removed.root.analysisGeneration,
        graphFingerprint: removed.root.graphFingerprint,
      },
      changes: [{ action: 'node.clearMap', nodeId: 'n1', field: 'gloss' }],
    });
    expect(cleared.root.graph?.nodes[0]?.domain?.gloss).toEqual({});
    const deleted = applyAnalysis(project.db, {
      unitId,
      expected: {
        manuscriptGeneration: 0,
        analysisGeneration: cleared.root.analysisGeneration,
        graphFingerprint: cleared.root.graphFingerprint,
      },
      changes: [{ action: 'node.removeField', nodeId: 'n1', field: 'gloss' }],
    });
    expect(deleted.root.graph?.nodes[0]?.domain?.gloss).toBeUndefined();
    expect(() =>
      applyAnalysis(project.db, {
        unitId,
        expected: {
          manuscriptGeneration: 0,
          analysisGeneration: cleared.root.analysisGeneration,
          graphFingerprint: cleared.root.graphFingerprint,
        },
        changes: [{ action: 'node.removeField', nodeId: 'n1', field: 'gloss' }],
      }),
    ).toThrow('analysis credentials do not match');
    expect(() =>
      applyAnalysis(project.db, {
        unitId,
        expected: {
          manuscriptGeneration: 0,
          analysisGeneration: deleted.root.analysisGeneration,
          graphFingerprint: deleted.root.graphFingerprint,
        },
        changes: [{ action: 'node.setField', nodeId: 'n1', field: 'provenance', value: 'x' }],
      }),
    ).toThrow('analysis field cannot be set');
    expect(() =>
      applyAnalysis(project.db, {
        unitId,
        expected: {
          manuscriptGeneration: 0,
          analysisGeneration: deleted.root.analysisGeneration,
          graphFingerprint: deleted.root.graphFingerprint,
        },
        changes: [{ action: 'node.removeField', nodeId: 'n1', field: 'form' }],
      }),
    ).toThrow('analysis field cannot be removed');
    project.close();
  });

  it('reorders without advancing generation and rolls back a failed apply', () => {
    const { dir, project, unitId, stored } = seeded();
    const reordered = applyAnalysis(project.db, {
      unitId,
      expected: {
        manuscriptGeneration: 0,
        analysisGeneration: stored.analysisGeneration,
        graphFingerprint: stored.graphFingerprint,
      },
      changes: [{ action: 'node.reorder', indexes: [{ nodeId: 'n1', index: 2 }] }],
    });
    expect(reordered.root.graph?.nodes[0]?.id).toBe('n1');
    expect(reordered.root.graph?.nodes[0]?.domain?.index).toBe(2);
    expect(reordered.root.graph?.nodes[0]?.residue?.[0]?.review).toBe('unreviewed');
    expect(reordered.root.analysisGeneration).toBe(stored.analysisGeneration);
    expect(reordered.root.graphFingerprint).not.toBe(stored.graphFingerprint);
    expect(reordered.tokens[0]?.tokenIndex).toBe(2);
    expect(() =>
      applyAnalysis(
        project.db,
        {
          unitId,
          expected: {
            manuscriptGeneration: 0,
            analysisGeneration: reordered.root.analysisGeneration,
            graphFingerprint: reordered.root.graphFingerprint,
          },
          changes: [{ action: 'node.reorder', indexes: [{ nodeId: 'n1', index: 3 }] }],
        },
        () => {
          throw new Error('injected');
        },
      ),
    ).toThrow('injected');
    project.close();

    const reopened = openProject(dir);
    expect(getAnalysisRoot(reopened.db, unitId)?.graph?.nodes[0]?.domain?.index).toBe(2);
    expect(
      reopened.db.prepare('SELECT token_index FROM tokens WHERE unit_id = ?').get(unitId),
    ).toEqual({ token_index: 2 });
    reopened.close();
  });

  it('applies one gloss edit through a single desktop call', async () => {
    const dir = folder();
    writeFileSync(join(dir, 'a.wav'), '');
    const session = openDesktopSession(dir, [dir]);
    const client = createDesktopClient({
      desktopCall: (sessionId, method, args) =>
        Promise.resolve(callDesktopSession(sessionId, method, args)),
    });
    const media = await client.createMedia(session.sessionId, {
      relpath: 'a.wav',
      sha256: 'aa',
      duration: 1,
    });
    const manuscript = await client.createManuscript(session.sessionId, {
      title: { zh: '文稿' },
      mediaId: media.id,
    });
    const layer = await client.createLayer(session.sessionId, {
      manuscriptId: manuscript.id,
      key: 'tx',
      name: { zh: '转写' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    });
    const unit = await client.createUnit(session.sessionId, {
      layerId: layer.id,
      startTime: 0,
      endTime: 1,
      text: 'ka',
    });
    const db = requireDesktopSession(session.sessionId).db;
    const stored = writeAnalysisRoot(db, {
      unitId: unit.id,
      graph: graph(),
      expectedAnalysisGeneration: 0,
    });
    const applied = await client.applyAnalysis(session.sessionId, {
      unitId: unit.id,
      expected: {
        manuscriptGeneration: 0,
        analysisGeneration: stored.analysisGeneration,
        graphFingerprint: stored.graphFingerprint,
      },
      changes: [
        { action: 'node.setMapValue', nodeId: 'n1', field: 'gloss', key: 'zh', value: '已往' },
      ],
    });
    expect(applied.tokens[0]?.gloss).toEqual({ zh: '已往', en: 'past' });
    expect(applied.root.analysisGeneration).toBe(stored.analysisGeneration + 1);
  });
});
