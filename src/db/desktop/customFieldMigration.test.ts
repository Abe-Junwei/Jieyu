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
import {
  acceptAnalysis,
  restoreAnalysis,
  submitAnalysis,
  readAnalysisState,
} from './analysisRestore';
import { createDesktopClient } from './client';
import { createDefinition, readUnitValue, setUnitValue, updateDefinition } from './customFields';
import { migrateDefinition, previewMigration } from './customFieldMigration';
import { callDesktopSession } from './desktopCall';
import { openProject } from './openProject';
import { openDesktopSession, requireDesktopSession, resetDesktopSessions } from './projectSession';
import { getAnalysisRoot, writeAnalysisRoot } from './units';

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
  const root = mkdtempSync(join(tmpdir(), 'jieyu-field-migration-'));
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
  return { dir, project, layer, unit };
}

function stamp(
  db: ReturnType<typeof openProject>['db'],
  definitionId: string,
  conversions: {
    definitionId: string;
    targetType: string;
    targetId: string;
    value: unknown;
    unitId?: string;
    lexemeId?: string;
  }[],
) {
  const current = previewMigration(db, definitionId).current;
  return conversions.map((conversion) => {
    const host = current.find(
      (item) =>
        item.targetType === conversion.targetType &&
        item.targetId === conversion.targetId &&
        (item.unitId ?? '') === (conversion.unitId ?? '') &&
        (item.lexemeId ?? '') === (conversion.lexemeId ?? ''),
    );
    if (host === undefined) throw new Error(`migration host is missing: ${conversion.targetId}`);
    return { ...conversion, valueFingerprint: host.valueFingerprint };
  });
}

function candidateRow(
  db: InstanceType<typeof Database>,
  id: string,
): {
  graph_json: string;
  definition_revisions_json: string;
} {
  return db
    .prepare('SELECT graph_json, definition_revisions_json FROM analysis_candidates WHERE id = ?')
    .get(id) as { graph_json: string; definition_revisions_json: string };
}

afterEach(() => {
  resetDesktopSessions();
  releaseAllProjectLocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('custom field migration', () => {
  it('migrates current unit values and leaves the recorded number', () => {
    const { dir, project, layer, unit } = seeded();
    const other = project.units.create({ layerId: layer.id, startTime: 1, endTime: 2, text: 'ta' });
    const field = createDefinition(project.db, {
      targetType: 'unit',
      name: { zh: '数' },
      fieldType: 'number',
    });
    const root = writeAnalysisRoot(project.db, {
      unitId: unit.id,
      graph: graph(),
      expectedAnalysisGeneration: 0,
    });
    setUnitValue(project.db, {
      definitionId: field.id,
      unitId: unit.id,
      value: 3,
      expectedRevision: 1,
    });
    setUnitValue(project.db, {
      definitionId: field.id,
      unitId: other.id,
      value: 3,
      expectedRevision: 1,
    });
    const candidate = submitNow(project.db, unit.id, root.graph);
    const recorded = candidate.definitionRevisions.find((item) => item.definitionId === field.id);
    expect(recorded).toMatchObject({ revision: 1, fieldType: 'number' });
    expect(recorded?.values.map((item) => item.value)).toEqual([3, 3]);
    expect(() =>
      updateDefinition(project.db, {
        id: field.id,
        expectedRevision: 1,
        fieldType: 'text',
      }),
    ).toThrow('custom field change needs a migration');
    expect(
      previewMigration(project.db, field.id)
        .current.map((item) => item.targetId)
        .sort(),
    ).toEqual([other.id, unit.id].sort());
    expect(() =>
      migrateDefinition(project.db, {
        definitionId: field.id,
        expectedRevision: 1,
        definition: { fieldType: 'text', pattern: '^3$' },
        conversions: stamp(project.db, field.id, [
          { definitionId: field.id, targetType: 'unit', targetId: unit.id, value: '3' },
          { definitionId: field.id, targetType: 'unit', targetId: other.id, value: '4' },
        ]),
      }),
    ).toThrow('custom field value is invalid');
    expect(readUnitValue(project.db, field.id, unit.id)).toBe(3);
    const migrated = migrateDefinition(project.db, {
      definitionId: field.id,
      expectedRevision: 1,
      definition: { fieldType: 'text' },
      conversions: stamp(project.db, field.id, [
        { definitionId: field.id, targetType: 'unit', targetId: unit.id, value: '3' },
        { definitionId: field.id, targetType: 'unit', targetId: other.id, value: '3' },
      ]),
    });
    expect(migrated.revision).toBe(2);
    expect(migrated.fieldType).toBe('text');
    expect(readUnitValue(project.db, field.id, unit.id)).toBe('3');
    expect(readUnitValue(project.db, field.id, other.id)).toBe('3');
    const kept = getAnalysisCandidate(project.db, candidate.id);
    expect(kept?.definitionRevisions.find((item) => item.definitionId === field.id)).toMatchObject({
      revision: 1,
      fieldType: 'number',
    });
    expect(
      kept?.definitionRevisions
        .find((item) => item.definitionId === field.id)
        ?.values.map((item) => item.value),
    ).toEqual([3, 3]);
    const after = getAnalysisRoot(project.db, unit.id);
    expect(after?.analysisGeneration).toBe(root.analysisGeneration);
    expect(after?.graphFingerprint).toBe(root.graphFingerprint);
    expect(() =>
      acceptAnalysis(project.db, {
        candidateId: candidate.id,
        expected: {
          manuscriptGeneration: 0,
          analysisGeneration: root.analysisGeneration,
          graphFingerprint: root.graphFingerprint,
        },
      }),
    ).toThrow('custom field revision does not match');
    expect(previewMigration(project.db, field.id).history).toEqual([
      { id: candidate.id, kind: 'suggestion', revision: 1, fieldType: 'number' },
    ]);
    project.close();
    const reopened = openProject(dir);
    expect(readUnitValue(reopened.db, field.id, unit.id)).toBe('3');
    expect(
      getAnalysisCandidate(reopened.db, candidate.id)
        ?.definitionRevisions.find((item) => item.definitionId === field.id)
        ?.values.map((item) => item.value),
    ).toEqual([3, 3]);
    reopened.close();
  });

  it('keeps the snapshot number and converts only the restored graph', () => {
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
    const before = candidateRow(project.db, snapshotId);
    expect(before.graph_json).toContain('"customFields":{"' + field.id + '":3}');
    const migrated = migrateDefinition(project.db, {
      definitionId: field.id,
      expectedRevision: 1,
      definition: { fieldType: 'text' },
      conversions: stamp(project.db, field.id, [
        {
          definitionId: field.id,
          targetType: 'analysis-node',
          targetId: 'n1',
          unitId: unit.id,
          value: '3',
        },
      ]),
    });
    expect(migrated.revision).toBe(2);
    const live = getAnalysisRoot(project.db, unit.id);
    expect(live?.analysisGeneration).toBe(edited.root.analysisGeneration);
    expect(live?.graph?.nodes.find((node) => node.id === 'n1')?.customFields).toEqual({
      [field.id]: '3',
    });
    expect(live?.graph?.nodes.find((node) => node.id === 'n1')?.residue?.[0]?.review).toBe(
      'needs-review',
    );
    expect(candidateRow(project.db, snapshotId)).toEqual(before);
    expect(() =>
      restoreAnalysis(project.db, {
        candidateId: snapshotId,
        expected: {
          manuscriptGeneration: 0,
          analysisGeneration: live?.analysisGeneration ?? 0,
          graphFingerprint: live?.graphFingerprint ?? '',
        },
      }),
    ).toThrow('custom field migration is missing a value');
    expect(candidateRow(project.db, snapshotId)).toEqual(before);
    const restored = restoreAnalysis(project.db, {
      candidateId: snapshotId,
      expected: {
        manuscriptGeneration: 0,
        analysisGeneration: live?.analysisGeneration ?? 0,
        graphFingerprint: live?.graphFingerprint ?? '',
      },
      conversions: [
        {
          definitionId: field.id,
          targetType: 'analysis-node',
          targetId: 'n1',
          unitId: unit.id,
          value: '3',
        },
      ],
    });
    expect(restored.graph?.nodes.find((node) => node.id === 'n1')?.customFields).toEqual({
      [field.id]: '3',
    });
    expect(candidateRow(project.db, snapshotId)).toEqual(before);
    project.close();
    const reopened = openProject(dir);
    expect(
      getAnalysisRoot(reopened.db, unit.id)?.graph?.nodes.find((node) => node.id === 'n1')
        ?.customFields,
    ).toEqual({ [field.id]: '3' });
    expect(candidateRow(reopened.db, snapshotId)).toEqual(before);
    reopened.close();
  });

  it('rejects a migration after the previewed value changes', () => {
    const { project, unit } = seeded();
    const field = createDefinition(project.db, {
      targetType: 'unit',
      name: { zh: '数' },
      fieldType: 'number',
    });
    setUnitValue(project.db, {
      definitionId: field.id,
      unitId: unit.id,
      value: 3,
      expectedRevision: 1,
    });
    const host = previewMigration(project.db, field.id).current[0];
    setUnitValue(project.db, {
      definitionId: field.id,
      unitId: unit.id,
      value: 4,
      expectedRevision: 1,
    });
    expect(() =>
      migrateDefinition(project.db, {
        definitionId: field.id,
        expectedRevision: 1,
        definition: { fieldType: 'text' },
        conversions: [
          {
            definitionId: field.id,
            targetType: 'unit',
            targetId: unit.id,
            value: '3',
            valueFingerprint: host?.valueFingerprint,
          },
        ],
      }),
    ).toThrow('custom field migration is stale');
    expect(readUnitValue(project.db, field.id, unit.id)).toBe(4);
    project.close();
  });

  it('converts every value on one analysis graph', () => {
    const { dir, project, unit } = seeded();
    const field = createDefinition(project.db, {
      targetType: 'analysis-node',
      name: { zh: '数' },
      fieldType: 'number',
    });
    const body = graph();
    const first = body.nodes[0];
    if (first === undefined) throw new Error('node is missing');
    body.nodes.push({
      ...first,
      id: 'n2',
      label: 'ta',
      domain: { ...first.domain, form: { default: 'ta' }, index: 1 },
      residue: [],
    });
    for (const node of body.nodes) Object.assign(node, { customFields: { [field.id]: 3 } });
    writeAnalysisRoot(project.db, {
      unitId: unit.id,
      graph: body,
      expectedAnalysisGeneration: 0,
    });
    migrateDefinition(project.db, {
      definitionId: field.id,
      expectedRevision: 1,
      definition: { fieldType: 'text' },
      conversions: stamp(project.db, field.id, [
        {
          definitionId: field.id,
          targetType: 'analysis-node',
          targetId: 'n1',
          unitId: unit.id,
          value: '3',
        },
        {
          definitionId: field.id,
          targetType: 'analysis-node',
          targetId: 'n2',
          unitId: unit.id,
          value: '3',
        },
      ]),
    });
    const live = getAnalysisRoot(project.db, unit.id);
    expect(live?.graph?.nodes.map((node) => node.customFields?.[field.id])).toEqual(['3', '3']);
    project.close();
    const reopened = openProject(dir);
    expect(
      getAnalysisRoot(reopened.db, unit.id)?.graph?.nodes.map(
        (node) => node.customFields?.[field.id],
      ),
    ).toEqual(['3', '3']);
    reopened.close();
  });

  it('migrates a text field to select when the patch supplies options', () => {
    const { project } = seeded();
    const field = createDefinition(project.db, {
      targetType: 'unit',
      name: { en: 'Choice' },
      fieldType: 'text',
    });
    const migrated = migrateDefinition(project.db, {
      definitionId: field.id,
      expectedRevision: field.revision,
      definition: { fieldType: 'select', options: [{ label: { en: 'one' } }] },
      conversions: [],
    });
    expect(migrated.fieldType).toBe('select');
    expect(migrated.options.map((option) => option.label)).toEqual([{ en: 'one' }]);
    project.close();
  });

  it('rejects a version 8 library without changing its bytes', () => {
    const dir = folder();
    const file = join(dir, 'project.sqlite');
    openProject(dir).close();
    const db = new Database(file);
    db.exec('PRAGMA user_version = 8');
    db.close();
    const before = readFileSync(file);
    expect(() => openProject(dir)).toThrow('project.sqlite is not a Jieyu project library');
    expect(readFileSync(file)).toEqual(before);
    expect(readdirSync(dir).includes(PROJECT_LOCK_NAME)).toBe(false);
  });

  it('migrates through one desktop call', async () => {
    const { dir, project, unit } = seeded();
    const field = createDefinition(project.db, {
      targetType: 'unit',
      name: { zh: '数' },
      fieldType: 'number',
    });
    setUnitValue(project.db, {
      definitionId: field.id,
      unitId: unit.id,
      value: 3,
      expectedRevision: 1,
    });
    project.close();
    writeFileSync(join(dir, 'a.wav'), '');
    const session = openDesktopSession(dir, [dir]);
    const client = createDesktopClient({
      desktopCall: (sessionId, method, args) =>
        Promise.resolve(callDesktopSession(sessionId, method, args)),
    });
    const preview = await client.previewCustomFieldMigration(session.sessionId, field.id);
    expect(preview.current).toEqual([
      { targetType: 'unit', targetId: unit.id, valueFingerprint: '3' },
    ]);
    const migrated = await client.migrateCustomFieldDefinition(session.sessionId, {
      definitionId: field.id,
      expectedRevision: 1,
      definition: { fieldType: 'text' },
      conversions: [
        {
          definitionId: field.id,
          targetType: 'unit',
          targetId: unit.id,
          value: '3',
          valueFingerprint: preview.current[0]?.valueFingerprint,
        },
      ],
    });
    expect(migrated.revision).toBe(2);
    expect(readUnitValue(requireDesktopSession(session.sessionId).db, field.id, unit.id)).toBe('3');
  });
});
