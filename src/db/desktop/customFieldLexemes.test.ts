import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { releaseAllProjectLocks } from '../../desktop/skeleton/projectLock';
import { applyAnalysis } from './analysis';
import {
  createDefinition,
  locateCustomFieldValues,
  missingFields,
  readFieldValue,
  setFieldValue,
} from './customFields';
import { callDesktopSession } from './desktopCall';
import { getLexemeEntry, saveLexemeEntry } from './lexicon';
import { openProject } from './openProject';
import { openDesktopSession, resetDesktopSessions } from './projectSession';
import { getAnalysisRoot, writeAnalysisRoot } from './units';

const roots: string[] = [];
const T = '2026-10-25T00:00:00.000Z';

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-custom-lexemes-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  resetDesktopSessions();
  releaseAllProjectLocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('lexeme custom fields', () => {
  it('stores lexeme and sense values in jieyu json and keeps an old entry editable', () => {
    const dir = folder();
    const project = openProject(dir);
    const lexemeField = createDefinition(project.db, {
      targetType: 'lexeme',
      name: { zh: '词' },
      fieldType: 'text',
      required: true,
      defaultValue: 'hello',
    });
    const entry = {
      headword: 'run',
      senses: [{ id: 'move', definitions: [{ text: 'to move' }] }],
    };
    expect(() => saveLexemeEntry(project.db, { id: 'run', entry })).toThrow(
      'lexeme is missing a required field',
    );
    expect(rows(project.db, 'lexemes')).toBe(0);
    saveLexemeEntry(project.db, {
      id: 'run',
      entry,
      jieyu: { notes: [{ owner: 'entry', ref: 'run', text: 'kept' }] },
      fieldValues: { [lexemeField.id]: 'kept' },
    });
    expect(rows(project.db, 'custom_field_values')).toBe(0);
    expect(getLexemeEntry(project.db, 'run')?.jieyu).toMatchObject({
      notes: [{ text: 'kept' }],
      customFields: { [lexemeField.id]: 'kept' },
    });
    saveLexemeEntry(project.db, {
      id: 'run',
      entry: { ...entry, headword: 'ran' },
      jieyu: { notes: [{ owner: 'entry', ref: 'run', text: 'next' }] },
    });
    expect(getLexemeEntry(project.db, 'run')?.jieyu).toMatchObject({
      notes: [{ text: 'next' }],
      customFields: { [lexemeField.id]: 'kept' },
    });

    const senseField = createDefinition(project.db, {
      targetType: 'lexeme-sense',
      name: { zh: '义' },
      fieldType: 'text',
      required: true,
    });
    expect(missingFields(project.db, 'lexeme-sense', 'move', 'run')).toEqual([senseField.id]);
    expect(() =>
      saveLexemeEntry(project.db, {
        id: 'run',
        entry: {
          headword: 'ran',
          senses: [
            { id: 'move', definitions: [{ text: 'to move' }] },
            { id: 'manage', definitions: [{ text: 'to manage' }] },
          ],
        },
      }),
    ).toThrow('lexeme-sense is missing a required field');
    expect(getLexemeEntry(project.db, 'run')?.entry).toMatchObject({ headword: 'ran' });
    saveLexemeEntry(project.db, {
      id: 'run',
      entry: {
        headword: 'ran',
        senses: [
          { id: 'move', definitions: [{ text: 'to move' }] },
          { id: 'manage', definitions: [{ text: 'to manage' }] },
        ],
      },
      senseFieldValues: { manage: { [senseField.id]: 'yes' } },
    });
    saveLexemeEntry(project.db, {
      id: 'walk',
      entry: { headword: 'walk', senses: [{ id: 'move', definitions: [{ text: 'go' }] }] },
      fieldValues: { [lexemeField.id]: 'walk' },
      senseFieldValues: { move: { [senseField.id]: 'other' } },
    });
    expect(locateCustomFieldValues(project.db, senseField.id)).toEqual([
      { targetType: 'lexeme-sense', targetId: 'manage', lexemeId: 'run' },
      { targetType: 'lexeme-sense', targetId: 'move', lexemeId: 'walk' },
    ]);
    const ref = createDefinition(project.db, {
      targetType: 'lexeme',
      name: { zh: '指' },
      fieldType: 'ref',
      targetTypes: ['lexeme-sense'],
      cardinality: 'one',
    });
    expect(() =>
      setFieldValue(project.db, {
        definitionId: ref.id,
        targetType: 'lexeme',
        targetId: 'run',
        value: { targetType: 'lexeme-sense', targetId: 'gone', lexemeId: 'run' },
        expectedRevision: 1,
      }),
    ).toThrow('custom field value is invalid');
    setFieldValue(project.db, {
      definitionId: ref.id,
      targetType: 'lexeme',
      targetId: 'run',
      value: { targetType: 'lexeme-sense', targetId: 'move', lexemeId: 'run' },
      expectedRevision: 1,
    });
    const roundTrip = getLexemeEntry(project.db, 'run');
    if (roundTrip === null) throw new Error('lexeme is missing');
    saveLexemeEntry(project.db, {
      id: 'run',
      entry: roundTrip.entry,
      jieyu: roundTrip.jieyu,
    });
    expect(readFieldValue(project.db, lexemeField.id, 'lexeme', 'run')).toBe('kept');
    expect(() =>
      setFieldValue(
        project.db,
        {
          definitionId: senseField.id,
          targetType: 'lexeme-sense',
          targetId: 'move',
          lexemeId: 'walk',
          value: 'boom',
          expectedRevision: 1,
        },
        () => {
          throw new Error('fail write');
        },
      ),
    ).toThrow('fail write');
    expect(readFieldValue(project.db, senseField.id, 'lexeme-sense', 'move', 'walk')).toBe('other');
    expect(() =>
      setFieldValue(project.db, {
        definitionId: lexemeField.id,
        targetType: 'analysis-node',
        targetId: 'n1',
        value: 'x',
        expectedRevision: 1,
      }),
    ).toThrow('custom field target is not writable yet');
    project.close();

    const session = openDesktopSession(dir, [dir]);
    expect(
      callDesktopSession(session.sessionId, 'customFields.setValue', {
        definitionId: senseField.id,
        targetType: 'lexeme-sense',
        targetId: 'manage',
        lexemeId: 'run',
        value: 'next',
        expectedRevision: 1,
      }),
    ).toMatchObject({ value: 'next' });
    resetDesktopSessions();
    const reopened = openProject(dir);
    expect(readFieldValue(reopened.db, senseField.id, 'lexeme-sense', 'manage', 'run')).toBe(
      'next',
    );
    expect(readFieldValue(reopened.db, lexemeField.id, 'lexeme', 'run')).toBe('kept');
    reopened.close();
  });

  it('sets a relation custom field without reviewing the token', () => {
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
    const relationField = createDefinition(project.db, {
      targetType: 'analysis-relation',
      name: { zh: '边' },
      fieldType: 'text',
    });
    const nodeField = createDefinition(project.db, {
      targetType: 'analysis-node',
      name: { zh: '点' },
      fieldType: 'text',
    });
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
          {
            action: 'customField.set',
            nodeId: 'n1',
            relationId: 'r1',
            definitionId: relationField.id,
            value: 'x',
          },
        ],
      }),
    ).toThrow('analysis change is invalid');
    const applied = applyAnalysis(project.db, {
      unitId: unit.id,
      expected,
      changes: [
        {
          action: 'customField.set',
          relationId: 'l1',
          definitionId: relationField.id,
          value: 'edge',
        },
      ],
    });
    const relation = applied.root.graph?.relations.find((item) => item.id === 'l1');
    expect(relation?.customFields).toEqual({ [relationField.id]: 'edge' });
    expect(relation?.link?.edits).toEqual([
      {
        at: relation?.link?.updatedAt,
        actorType: 'human',
        fields: [`customField:${relationField.id}`],
      },
    ]);
    expect(applied.root.graph?.nodes.find((item) => item.id === 'n1')?.residue?.[0]?.review).toBe(
      'unreviewed',
    );
    expect(applied.root.analysisGeneration).toBe(stored.analysisGeneration + 1);
    expect(applied.root.graphFingerprint).not.toBe(stored.graphFingerprint);
    const part = applyAnalysis(project.db, {
      unitId: unit.id,
      expected: {
        manuscriptGeneration: 0,
        analysisGeneration: applied.root.analysisGeneration,
        graphFingerprint: applied.root.graphFingerprint,
      },
      changes: [
        {
          action: 'customField.set',
          relationId: 'r1',
          definitionId: relationField.id,
          value: 'part',
        },
      ],
    });
    expect(part.root.graph?.relations.find((item) => item.id === 'r1')?.customFields).toEqual({
      [relationField.id]: 'part',
    });
    expect(part.root.graph?.relations.find((item) => item.id === 'r1')?.link).toBeUndefined();
    applyAnalysis(project.db, {
      unitId: unit.id,
      expected: {
        manuscriptGeneration: 0,
        analysisGeneration: part.root.analysisGeneration,
        graphFingerprint: part.root.graphFingerprint,
      },
      changes: [
        { action: 'customField.set', nodeId: 'n1', definitionId: nodeField.id, value: 'node' },
      ],
    });
    expect(locateCustomFieldValues(project.db, relationField.id)).toEqual([
      { targetType: 'analysis-relation', targetId: 'l1', unitId: unit.id },
      { targetType: 'analysis-relation', targetId: 'r1', unitId: unit.id },
    ]);
    expect(locateCustomFieldValues(project.db, nodeField.id)).toEqual([
      { targetType: 'analysis-node', targetId: 'n1', unitId: unit.id },
    ]);
    expect(() =>
      setFieldValue(project.db, {
        definitionId: relationField.id,
        targetType: 'analysis-relation',
        targetId: 'r1',
        value: 'no',
        expectedRevision: 1,
      }),
    ).toThrow('custom field target is not writable yet');
    project.close();
    const reopened = openProject(dir);
    expect(
      getAnalysisRoot(reopened.db, unit.id)?.graph?.relations.find((item) => item.id === 'l1')
        ?.customFields,
    ).toEqual({ [relationField.id]: 'edge' });
    reopened.close();
  });
});

function rows(
  db: { prepare: (sql: string) => { get: (...args: never[]) => unknown } },
  table: string,
): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
  return row.n;
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
      {
        id: 'n2',
        type: 'token' as const,
        label: 'n2',
        domain: {
          form: { default: 'ka' },
          index: 1,
          createdAt: T,
          updatedAt: T,
          provenance: provenance(),
        },
      },
      { id: 'lex', type: 'lexemeRef' as const, label: 'run' },
    ],
    relations: [
      { id: 'r1', type: 'hasPart' as const, sourceId: 'n1', targetId: 'n2' },
      {
        id: 'l1',
        type: 'linksLexeme' as const,
        sourceId: 'n1',
        targetId: 'lex',
        link: { lexemeId: 'lex1', role: 'exact' as const, createdAt: T, updatedAt: T },
      },
    ],
  };
}
