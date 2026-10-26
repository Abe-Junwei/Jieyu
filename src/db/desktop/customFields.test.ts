import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { PROJECT_LOCK_NAME, releaseAllProjectLocks } from '../../desktop/skeleton/projectLock';
import { applyAnalysis } from './analysis';
import { createDesktopClient } from './client';
import {
  addOption,
  createDefinition,
  importDefinition,
  missingUnitFields,
  previewUnitValue,
  readUnitValue,
  removeUnitValue,
  setUnitValue,
  updateDefinition,
  updateOptionLabel,
} from './customFields';
import { callDesktopSession } from './desktopCall';
import { openProject } from './openProject';
import { openDesktopSession, requireDesktopSession, resetDesktopSessions } from './projectSession';
import { getAnalysisRoot, updateUnitText, writeAnalysisRoot } from './units';

const roots: string[] = [];
const T = '2026-10-25T00:00:00.000Z';

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-custom-fields-'));
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
      { id: 'lx', type: 'lexemeRef' as const, label: 'lx' },
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
  return { dir, project, layer, unit };
}

function countDefinitions(db: InstanceType<typeof Database>): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM custom_field_definitions').get() as {
    n: number;
  };
  return row.n;
}

describe('custom fields', () => {
  it('rejects a value the JSON column would otherwise store', () => {
    const { dir, project, unit } = seeded();
    expect(() =>
      createDefinition(project.db, {
        targetType: 'unit',
        name: { zh: '数' },
        fieldType: 'number',
        pattern: '^1$',
      }),
    ).toThrow('custom field constraint does not apply');
    expect(() =>
      createDefinition(project.db, {
        targetType: 'unit',
        name: { zh: '界' },
        fieldType: 'number',
        minValue: 2,
        maxValue: 1,
      }),
    ).toThrow('custom field range is invalid');
    const numberField = createDefinition(project.db, {
      targetType: 'unit',
      name: { zh: '数' },
      fieldType: 'number',
    });
    const flag = createDefinition(project.db, {
      targetType: 'unit',
      name: { zh: '是否' },
      fieldType: 'boolean',
    });
    const note = createDefinition(project.db, {
      targetType: 'unit',
      name: { zh: '注' },
      fieldType: 'text',
      pattern: '^ka$',
    });
    const link = createDefinition(project.db, {
      targetType: 'unit',
      name: { zh: '址' },
      fieldType: 'url',
    });
    expect(() =>
      setUnitValue(project.db, {
        definitionId: numberField.id,
        unitId: unit.id,
        value: Infinity,
        expectedRevision: 1,
      }),
    ).toThrow('custom field value is invalid');
    setUnitValue(project.db, {
      definitionId: numberField.id,
      unitId: unit.id,
      value: 0,
      expectedRevision: 1,
    });
    setUnitValue(project.db, {
      definitionId: flag.id,
      unitId: unit.id,
      value: false,
      expectedRevision: 1,
    });
    expect(() =>
      setUnitValue(project.db, {
        definitionId: note.id,
        unitId: unit.id,
        value: { a: 1 },
        expectedRevision: 1,
      }),
    ).toThrow('custom field value is invalid');
    expect(() =>
      setUnitValue(project.db, {
        definitionId: note.id,
        unitId: unit.id,
        value: ' ka',
        expectedRevision: 1,
      }),
    ).toThrow('custom field value is invalid');
    setUnitValue(project.db, {
      definitionId: note.id,
      unitId: unit.id,
      value: 'ka',
      expectedRevision: 1,
    });
    expect(() =>
      setUnitValue(project.db, {
        definitionId: link.id,
        unitId: unit.id,
        value: 'not a url',
        expectedRevision: 1,
      }),
    ).toThrow('custom field value is invalid');
    expect(() =>
      setUnitValue(project.db, {
        definitionId: 'missing',
        unitId: unit.id,
        value: 'x',
        expectedRevision: 1,
      }),
    ).toThrow('custom field definition is missing');
    expect(readUnitValue(project.db, note.id, unit.id)).toBe('ka');
    project.close();

    const reopened = openProject(dir);
    expect(readUnitValue(reopened.db, numberField.id, unit.id)).toBe(0);
    expect(readUnitValue(reopened.db, flag.id, unit.id)).toBe(false);
    expect(readUnitValue(reopened.db, note.id, unit.id)).toBe('ka');
    reopened.close();
  });

  it('keeps an old unit usable and requires the value only on a new unit', () => {
    const { dir, project, layer, unit } = seeded();
    const defined = createDefinition(project.db, {
      targetType: 'unit',
      name: { zh: '备注' },
      fieldType: 'text',
      required: true,
      defaultValue: 'hello',
    });
    expect(readUnitValue(project.db, defined.id, unit.id)).toBeNull();
    expect(missingUnitFields(project.db, unit.id)).toEqual([defined.id]);
    expect(updateUnitText(project.db, { unitId: unit.id, text: 'ta' }).text).toBe('ta');
    expect(() =>
      project.units.create({ layerId: layer.id, startTime: 1, endTime: 2, text: 'new' }),
    ).toThrow('unit is missing a required field');
    expect(project.units.list(layer.id)).toHaveLength(1);
    const created = project.units.create({
      layerId: layer.id,
      startTime: 1,
      endTime: 2,
      text: 'new',
      fieldValues: { [defined.id]: 'kept' },
    });
    expect(readUnitValue(project.db, defined.id, created.id)).toBe('kept');
    const reused = importDefinition(project.db, {
      mode: 'reuse',
      definition: { targetType: 'unit', name: { zh: '备注' }, fieldType: 'text' },
    });
    expect(reused.id).toBe(defined.id);
    expect(() =>
      importDefinition(project.db, {
        mode: 'reuse',
        definition: { targetType: 'unit', name: { zh: '备注' }, fieldType: 'number' },
      }),
    ).toThrow('custom field import conflicts');
    expect(countDefinitions(project.db)).toBe(1);
    const createdDefinition = importDefinition(project.db, {
      mode: 'create',
      definition: { targetType: 'unit', name: { zh: '备注' }, fieldType: 'text' },
    });
    expect(createdDefinition.id).not.toBe(defined.id);
    expect(countDefinitions(project.db)).toBe(2);
    removeUnitValue(project.db, { definitionId: defined.id, unitId: created.id });
    expect(missingUnitFields(project.db, created.id)).toContain(defined.id);
    project.close();

    const reopened = openProject(dir);
    expect(reopened.units.get(unit.id)?.text).toBe('ta');
    expect(readUnitValue(reopened.db, defined.id, unit.id)).toBeNull();
    expect(readUnitValue(reopened.db, defined.id, created.id)).toBeNull();
    expect(readUnitValue(reopened.db, createdDefinition.id, created.id)).toBeNull();
    reopened.close();
  });

  it('bumps revision for a new option and rejects a stale value write', () => {
    const { project, unit } = seeded();
    const select = createDefinition(project.db, {
      targetType: 'unit',
      name: { zh: '类' },
      fieldType: 'select',
      options: [{ label: { zh: '甲' } }],
    });
    const optionId = select.options[0]?.id ?? '';
    const renamed = updateDefinition(project.db, {
      id: select.id,
      expectedRevision: 1,
      name: { zh: '类别' },
    });
    expect(renamed.revision).toBe(1);
    expect(renamed.id).toBe(select.id);
    const labeled = updateOptionLabel(project.db, {
      definitionId: select.id,
      optionId,
      expectedRevision: 1,
      label: { zh: '乙' },
    });
    expect(labeled.revision).toBe(1);
    expect(labeled.options[0]).toMatchObject({ id: optionId, label: { zh: '乙' } });
    const added = addOption(project.db, {
      definitionId: select.id,
      expectedRevision: 1,
      label: { zh: '丙' },
    });
    expect(added.revision).toBe(2);
    expect(added.options.map((option) => option.id)).toContain(optionId);
    expect(
      previewUnitValue(project.db, { definitionId: select.id, unitId: unit.id, value: optionId }),
    ).toEqual({
      definitionId: select.id,
      revision: 2,
      unitId: unit.id,
    });
    expect(readUnitValue(project.db, select.id, unit.id)).toBeNull();
    expect(() =>
      setUnitValue(project.db, {
        definitionId: select.id,
        unitId: unit.id,
        value: optionId,
        expectedRevision: 1,
      }),
    ).toThrow('custom field revision does not match');
    expect(readUnitValue(project.db, select.id, unit.id)).toBeNull();
    expect(() =>
      setUnitValue(project.db, {
        definitionId: select.id,
        unitId: unit.id,
        value: 'missing-option',
        expectedRevision: 2,
      }),
    ).toThrow('custom field value is invalid');
    project.close();
  });

  it('marks a custom value edit for review and leaves an unknown definition untouched', () => {
    const { dir, project, unit } = seeded();
    const stored = writeAnalysisRoot(project.db, {
      unitId: unit.id,
      graph: graph(),
      expectedAnalysisGeneration: 0,
    });
    expect(() =>
      writeAnalysisRoot(project.db, {
        unitId: unit.id,
        graph: {
          ...graph(),
          nodes: graph().nodes.map((node) =>
            node.id === 'n1' ? { ...node, customFields: { missing: 'x' } } : node,
          ),
        },
        expectedAnalysisGeneration: stored.analysisGeneration,
      }),
    ).toThrow('custom field definition is missing');
    const field = createDefinition(project.db, {
      targetType: 'analysis-node',
      name: { zh: '记' },
      fieldType: 'text',
    });
    const unitField = createDefinition(project.db, {
      targetType: 'unit',
      name: { zh: '段' },
      fieldType: 'text',
    });
    expect(() =>
      setUnitValue(project.db, {
        definitionId: field.id,
        unitId: unit.id,
        value: 'x',
        expectedRevision: 1,
      }),
    ).toThrow('custom field target does not match');
    const expected = {
      manuscriptGeneration: 0,
      analysisGeneration: stored.analysisGeneration,
      graphFingerprint: stored.graphFingerprint,
    };
    expect(() =>
      applyAnalysis(project.db, {
        unitId: unit.id,
        expected,
        changes: [
          { action: 'customField.set', nodeId: 'n1', definitionId: unitField.id, value: 'x' },
        ],
      }),
    ).toThrow('custom field target does not match');
    expect(() =>
      applyAnalysis(project.db, {
        unitId: unit.id,
        expected,
        changes: [{ action: 'customField.set', nodeId: 'n1', definitionId: 'missing', value: 'x' }],
      }),
    ).toThrow('custom field definition is missing');
    const applied = applyAnalysis(project.db, {
      unitId: unit.id,
      expected,
      changes: [{ action: 'customField.set', nodeId: 'n1', definitionId: field.id, value: 'x' }],
    });
    const node = applied.root.graph?.nodes.find((item) => item.id === 'n1');
    expect(node?.customFields).toEqual({ [field.id]: 'x' });
    expect(node?.residue?.[0]?.review).toBe('needs-review');
    expect(node?.domain?.edits?.[0]?.fields).toEqual([`customField:${field.id}`]);
    expect(applied.root.analysisGeneration).toBe(stored.analysisGeneration + 1);
    expect(applied.root.graphFingerprint).not.toBe(stored.graphFingerprint);
    const onRef = applyAnalysis(project.db, {
      unitId: unit.id,
      expected: {
        manuscriptGeneration: 0,
        analysisGeneration: applied.root.analysisGeneration,
        graphFingerprint: applied.root.graphFingerprint,
      },
      changes: [{ action: 'customField.set', nodeId: 'lx', definitionId: field.id, value: 'y' }],
    });
    expect(onRef.root.graph?.nodes.find((item) => item.id === 'lx')?.customFields).toEqual({
      [field.id]: 'y',
    });
    project.close();

    const reopened = openProject(dir);
    expect(getAnalysisRoot(reopened.db, unit.id)).toEqual(onRef.root);
    reopened.close();
  });

  it('rolls back a unit value when the write fails', () => {
    const { dir, project, unit } = seeded();
    const field = createDefinition(project.db, {
      targetType: 'unit',
      name: { zh: '注' },
      fieldType: 'text',
    });
    expect(() =>
      setUnitValue(
        project.db,
        { definitionId: field.id, unitId: unit.id, value: 'x', expectedRevision: 1 },
        () => {
          throw new Error('injected');
        },
      ),
    ).toThrow('injected');
    project.close();
    const reopened = openProject(dir);
    expect(readUnitValue(reopened.db, field.id, unit.id)).toBeNull();
    reopened.close();
  });

  it('rejects a reference to a missing unit', () => {
    const { dir, project, layer, unit } = seeded();
    const other = project.units.create({ layerId: layer.id, startTime: 1, endTime: 2, text: 'ta' });
    const field = createDefinition(project.db, {
      targetType: 'unit',
      name: { zh: '引' },
      fieldType: 'ref',
      targetTypes: ['unit'],
      cardinality: 'one',
    });
    expect(() =>
      setUnitValue(project.db, {
        definitionId: field.id,
        unitId: unit.id,
        value: { targetType: 'unit', targetId: 'missing' },
        expectedRevision: 1,
      }),
    ).toThrow('custom field value is invalid');
    setUnitValue(project.db, {
      definitionId: field.id,
      unitId: unit.id,
      value: { targetType: 'unit', targetId: other.id },
      expectedRevision: 1,
    });
    project.close();
    const reopened = openProject(dir);
    expect(readUnitValue(reopened.db, field.id, unit.id)).toEqual({
      targetType: 'unit',
      targetId: other.id,
    });
    reopened.close();
  });

  it('rejects a version 7 library without changing its bytes', () => {
    const dir = folder();
    const file = join(dir, 'project.sqlite');
    openProject(dir).close();
    const db = new Database(file);
    db.exec('PRAGMA user_version = 7');
    db.close();
    const before = readFileSync(file);
    expect(() => openProject(dir)).toThrow('project.sqlite is not a Jieyu project library');
    expect(readFileSync(file)).toEqual(before);
    expect(readdirSync(dir).includes(PROJECT_LOCK_NAME)).toBe(false);
  });

  it('sets a unit value through one desktop call', async () => {
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
    const field = await client.createCustomFieldDefinition(session.sessionId, {
      targetType: 'unit',
      name: { zh: '备注' },
      fieldType: 'text',
      required: true,
    });
    await expect(
      client.createUnit(session.sessionId, {
        layerId: layer.id,
        startTime: 0,
        endTime: 1,
        text: 'ka',
      }),
    ).rejects.toThrow('unit is missing a required field');
    const unit = await client.createUnit(session.sessionId, {
      layerId: layer.id,
      startTime: 0,
      endTime: 1,
      text: 'ka',
      fieldValues: { [field.id]: 'kept' },
    });
    expect(await client.missingUnitFields(session.sessionId, unit.id)).toEqual([]);
    const db = requireDesktopSession(session.sessionId).db;
    expect(readUnitValue(db, field.id, unit.id)).toBe('kept');
  });
});
