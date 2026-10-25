import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { PROJECT_LOCK_NAME, releaseAllProjectLocks } from '../../desktop/skeleton/projectLock';
import { applyAnalysis } from './analysis';
import {
  getAnalysisCandidate,
  insertReviewSnapshot,
  readAnalysisMaterial,
} from './analysisCandidates';
import { acceptAnalysis, restoreAnalysis, submitAnalysis } from './analysisRestore';
import { createDesktopClient } from './client';
import { createDefinition } from './customFields';
import { previewPurge, purgeDefinition } from './customFieldPurge';
import { callDesktopSession } from './desktopCall';
import { openProject } from './openProject';
import { openDesktopSession, requireDesktopSession, resetDesktopSessions } from './projectSession';
import { getAnalysisRoot, writeAnalysisRoot } from './units';

const roots: string[] = [];
const T = '2026-10-25T00:00:00.000Z';

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-field-purge-'));
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
          form: { default: 'ka' },
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
  return { dir, project, unit };
}

function requestOf(preview: ReturnType<typeof previewPurge>, definitionId: string) {
  return {
    definitionId,
    expectedRevision: preview.revision,
    current: preview.current,
    historyIds: preview.history.map((item) => item.id),
  };
}

afterEach(() => {
  resetDesktopSessions();
  releaseAllProjectLocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('custom field purge', () => {
  it('removes the field from current values, candidates, and the snapshot', () => {
    const { dir, project, unit } = seeded();
    const root = writeAnalysisRoot(project.db, {
      unitId: unit.id,
      graph: graph(),
      expectedAnalysisGeneration: 0,
    });
    const field = createDefinition(project.db, {
      targetType: 'analysis-node',
      name: { zh: '数' },
      fieldType: 'number',
      defaultValue: 3,
    });
    const edited = applyAnalysis(project.db, {
      unitId: unit.id,
      expected: {
        manuscriptGeneration: 0,
        analysisGeneration: root.analysisGeneration,
        graphFingerprint: root.graphFingerprint,
      },
      changes: [{ action: 'customField.set', nodeId: 'n1', definitionId: field.id, value: 3 }],
    });
    const snapshotId = insertReviewSnapshot(project.db, readAnalysisMaterial(project.db, unit.id));
    const accepted = submitAnalysis(project.db, { unitId: unit.id, graph: edited.root.graph });
    acceptAnalysis(project.db, {
      candidateId: accepted.id,
      expected: {
        manuscriptGeneration: 0,
        analysisGeneration: edited.root.analysisGeneration,
        graphFingerprint: edited.root.graphFingerprint,
      },
    });
    const pending = submitAnalysis(project.db, { unitId: unit.id, graph: edited.root.graph });
    const before = project.db
      .prepare('SELECT graph_fingerprint FROM analysis_candidates WHERE id = ?')
      .get(accepted.id) as { graph_fingerprint: string };
    const generation = getAnalysisRoot(project.db, unit.id)?.analysisGeneration;
    const preview = previewPurge(project.db, field.id);
    expect(preview.current).toEqual([
      { targetType: 'analysis-node', targetId: 'n1', unitId: unit.id },
    ]);
    expect(preview.history.map((item) => item.id).sort()).toEqual(
      [accepted.id, pending.id, snapshotId].sort(),
    );
    expect(() =>
      purgeDefinition(project.db, { ...requestOf(preview, field.id), historyIds: [] }),
    ).toThrow('custom field purge is stale');
    expect(() =>
      purgeDefinition(project.db, requestOf(preview, field.id), () => {
        throw new Error('injected');
      }),
    ).toThrow('injected');
    expect(getAnalysisRoot(project.db, unit.id)?.graph?.nodes[0]?.customFields).toEqual({
      [field.id]: 3,
    });
    purgeDefinition(project.db, requestOf(preview, field.id));
    expect(
      project.db.prepare('SELECT id FROM custom_field_definitions WHERE id = ?').get(field.id),
    ).toBeUndefined();
    const live = getAnalysisRoot(project.db, unit.id);
    expect(live?.analysisGeneration).toBe(generation);
    expect(live?.graph?.nodes[0]?.customFields).toBeUndefined();
    expect(live?.graph?.nodes[0]?.residue?.[0]?.review).toBe('needs-review');
    const kept = getAnalysisCandidate(project.db, accepted.id);
    expect(kept?.status).toBe('accepted');
    expect(kept?.redactedDefinitionIds).toEqual([field.id]);
    expect(kept?.definitionRevisions.some((item) => item.definitionId === field.id)).toBe(false);
    expect(kept?.graph.nodes[0]?.customFields).toBeUndefined();
    expect(
      (
        project.db
          .prepare('SELECT graph_fingerprint FROM analysis_candidates WHERE id = ?')
          .get(accepted.id) as {
          graph_fingerprint: string;
        }
      ).graph_fingerprint,
    ).toBe(before.graph_fingerprint);
    const credentials = {
      manuscriptGeneration: 0,
      analysisGeneration: live?.analysisGeneration ?? 0,
      graphFingerprint: live?.graphFingerprint ?? '',
    };
    expect(() =>
      acceptAnalysis(project.db, { candidateId: pending.id, expected: credentials }),
    ).toThrow('custom field value was removed');
    expect(() =>
      restoreAnalysis(project.db, { candidateId: snapshotId, expected: credentials }),
    ).toThrow('custom field value was removed');
    project.close();
    const reopened = openProject(dir);
    expect(
      reopened.db.prepare('SELECT id FROM custom_field_definitions WHERE id = ?').get(field.id),
    ).toBeUndefined();
    expect(getAnalysisRoot(reopened.db, unit.id)?.graph?.nodes[0]?.customFields).toBeUndefined();
    expect(getAnalysisCandidate(reopened.db, accepted.id)?.status).toBe('accepted');
    expect(
      getAnalysisCandidate(reopened.db, snapshotId)?.graph.nodes[0]?.customFields,
    ).toBeUndefined();
    reopened.close();
  });

  it('rejects a version 9 library without changing its bytes', () => {
    const dir = folder();
    const file = join(dir, 'project.sqlite');
    openProject(dir).close();
    const db = new Database(file);
    db.exec('PRAGMA user_version = 9');
    db.close();
    const before = readFileSync(file);
    expect(() => openProject(dir)).toThrow('project.sqlite is not a Jieyu project library');
    expect(readFileSync(file)).toEqual(before);
    expect(readdirSync(dir).includes(PROJECT_LOCK_NAME)).toBe(false);
  });

  it('purges through one desktop call', async () => {
    const { dir, project } = seeded();
    const field = createDefinition(project.db, {
      targetType: 'unit',
      name: { zh: '数' },
      fieldType: 'number',
    });
    project.close();
    writeFileSync(join(dir, 'a.wav'), '');
    const session = openDesktopSession(dir, [dir]);
    const client = createDesktopClient({
      desktopCall: (sessionId, method, args) =>
        Promise.resolve(callDesktopSession(sessionId, method, args)),
    });
    const preview = await client.previewCustomFieldPurge(session.sessionId, field.id);
    await client.purgeCustomFieldDefinition(session.sessionId, requestOf(preview, field.id));
    expect(
      requireDesktopSession(session.sessionId)
        .db.prepare('SELECT id FROM custom_field_definitions WHERE id = ?')
        .get(field.id),
    ).toBeUndefined();
  });
});
