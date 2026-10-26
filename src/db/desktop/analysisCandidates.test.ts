import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { releaseAllProjectLocks } from '../../desktop/skeleton/projectLock';
import { applyAnalysis } from './analysis';
import { listAnalysisCandidates } from './analysisCandidates';
import {
  acceptAnalysis,
  readAnalysisState,
  splitAnalysisNode,
  submitAnalysis,
} from './analysisRestore';
import { createDesktopClient } from './client';
import { callDesktopSession } from './desktopCall';
import { openProject } from './openProject';
import { openDesktopSession, requireDesktopSession, resetDesktopSessions } from './projectSession';
import { getAnalysisRoot, writeAnalysisRoot } from './units';

const roots: string[] = [];
const T = '2026-10-25T00:00:00.000Z';

function submitNow(db: ReturnType<typeof openProject>['db'], unitId: string, graph: unknown) {
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
  const root = mkdtempSync(join(tmpdir(), 'jieyu-analysis-candidates-'));
  roots.push(root);
  return root;
}

function provenance() {
  return { actorType: 'human' as const, method: 'manual' as const, createdAt: T };
}

function graph(gloss = '过去') {
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
          form: { default: 'ka' },
          gloss: { zh: gloss },
          index: 0,
          createdAt: T,
          updatedAt: T,
          provenance: provenance(),
        },
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
  return { project, unitId: unit.id };
}

describe('analysis suggestions', () => {
  it('accepts a pending suggestion once and leaves a repeated accept in place', () => {
    const { project, unitId } = seeded();
    const before = getAnalysisRoot(project.db, unitId);
    const suggestion = submitNow(project.db, unitId, graph('建议'));
    expect(getAnalysisRoot(project.db, unitId)).toEqual(before);
    const expected = {
      manuscriptGeneration: 0,
      analysisGeneration: 0,
      graphFingerprint: '',
    };
    const accepted = acceptAnalysis(project.db, { candidateId: suggestion.id, expected });
    expect(accepted.applied).toBe(true);
    expect(accepted.root.graph?.nodes[0]?.domain?.gloss).toEqual({ zh: '建议' });
    expect(accepted.root.analysisGeneration).toBe(1);
    const repeated = acceptAnalysis(project.db, { candidateId: suggestion.id, expected });
    expect(repeated.applied).toBe(false);
    expect(repeated.root.analysisGeneration).toBe(accepted.root.analysisGeneration);
    expect(repeated.root.graphFingerprint).toBe(accepted.root.graphFingerprint);
    project.close();
  });

  it('rejects a stale suggestion and supersedes only other pending suggestions', () => {
    const { project, unitId } = seeded();
    const stored = writeAnalysisRoot(project.db, {
      unitId,
      graph: graph('已接受'),
      expectedAnalysisGeneration: 0,
    });
    const suggestion = submitNow(project.db, unitId, graph('建议'));
    const edited = applyAnalysis(project.db, {
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
    expect(() =>
      acceptAnalysis(project.db, {
        candidateId: suggestion.id,
        expected: {
          manuscriptGeneration: suggestion.manuscriptGeneration,
          analysisGeneration: suggestion.analysisGeneration,
          graphFingerprint: suggestion.graphFingerprint,
        },
      }),
    ).toThrow('analysis credentials do not match');
    expect(getAnalysisRoot(project.db, unitId)).toEqual(edited.root);
    expect(
      listAnalysisCandidates(project.db, unitId).find((item) => item.id === suggestion.id)?.status,
    ).toBe('pending');
    const split = splitAnalysisNode(project.db, {
      unitId,
      nodeId: 'n1',
      into: [
        {
          id: 'n2',
          type: 'token',
          label: 'n2',
          domain: {
            form: { default: 'ka' },
            index: 0,
            createdAt: T,
            updatedAt: T,
            provenance: provenance(),
          },
        },
        {
          id: 'n3',
          type: 'token',
          label: 'n3',
          domain: {
            form: { default: 'ka' },
            index: 1,
            createdAt: T,
            updatedAt: T,
            provenance: provenance(),
          },
        },
      ],
      expected: {
        manuscriptGeneration: 0,
        analysisGeneration: edited.root.analysisGeneration,
        graphFingerprint: edited.root.graphFingerprint,
      },
    });
    const first = submitNow(project.db, unitId, graph('一'));
    const second = submitNow(project.db, unitId, graph('二'));
    const records = listAnalysisCandidates(project.db, unitId);
    expect(records.find((item) => item.kind === 'review-snapshot')?.status).toBe('stored');
    expect(records.find((item) => item.id === first.id)?.status).toBe('rejected');
    expect(records.find((item) => item.id === second.id)?.status).toBe('pending');
    expect(getAnalysisRoot(project.db, unitId)?.graphFingerprint).toBe(split.graphFingerprint);
    project.close();
  });

  it('accepts through the desktop call', async () => {
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
    const state = await client.readAnalysisState(session.sessionId, unit.id);
    const suggestion = await client.submitAnalysis(session.sessionId, {
      unitId: unit.id,
      graph: graph('建议'),
      expected: {
        manuscriptGeneration: state.manuscriptGeneration,
        analysisGeneration: state.analysisGeneration,
        graphFingerprint: state.graphFingerprint,
      },
      definitionRevisions: state.definitionRevisions,
    });
    const accepted = await client.acceptAnalysis(session.sessionId, {
      candidateId: suggestion.id,
      expected: { manuscriptGeneration: 0, analysisGeneration: 0, graphFingerprint: '' },
    });
    expect(accepted.applied).toBe(true);
    expect(accepted.root.analysisGeneration).toBe(1);
    const db = requireDesktopSession(session.sessionId).db;
    expect(getAnalysisRoot(db, unit.id)?.graph?.nodes[0]?.domain?.gloss).toEqual({ zh: '建议' });
  });
});
