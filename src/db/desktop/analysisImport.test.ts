import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { surfacePartAlignment } from '../../annotation/analysisGraphDomain';
import { releaseAllProjectLocks } from '../../desktop/skeleton/projectLock';
import { applyAnalysis } from './analysis';
import { importAnalysis } from './analysisImport';
import { createDefinition } from './customFields';
import { saveLexemeEntry } from './lexicon';
import { openProject } from './openProject';
import { getAnalysisRoot, writeAnalysisRoot } from './units';

const roots: string[] = [];
const T = '2026-10-25T00:00:00.000Z';

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-analysis-import-'));
  roots.push(root);
  return root;
}

function provenance() {
  return { actorType: 'human' as const, method: 'manual' as const, createdAt: T };
}

function token(id: string, index: number) {
  return {
    id,
    type: 'token' as const,
    label: id,
    domain: {
      form: { default: 'ka', orthoA: 'kā' },
      gloss: { zh: '过去', en: 'past' },
      index,
      createdAt: T,
      updatedAt: T,
      provenance: provenance(),
    },
  };
}

afterEach(() => {
  releaseAllProjectLocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function seeded(graph: unknown) {
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
    graph,
    expectedAnalysisGeneration: 0,
  });
  const expected = {
    manuscriptGeneration: 0,
    analysisGeneration: stored.analysisGeneration,
    graphFingerprint: stored.graphFingerprint,
  };
  return { dir, project, unitId: unit.id, stored, expected };
}

describe('analysis import', () => {
  it('updates one gloss entry and keeps the keys the material does not mention', () => {
    const { dir, project, unitId, expected } = seeded({
      payloadVersion: 1,
      id: 'g1',
      text: 'ka',
      nodes: [token('n1', 0)],
      relations: [],
    });
    const imported = importAnalysis(project.db, {
      unitId,
      expected,
      nodes: [{ id: 'n1', domain: { gloss: { zh: '已往' } } }],
    });
    const domain = imported.root.graph?.nodes[0]?.domain;
    expect(domain?.gloss).toEqual({ zh: '已往', en: 'past' });
    expect(domain?.form).toEqual({ default: 'ka', orthoA: 'kā' });
    expect(imported.counts).toMatchObject({ updatedNodes: 1, appendedNodes: 0, deletedNodes: 0 });
    project.close();
    const reopened = openProject(dir);
    expect(getAnalysisRoot(reopened.db, unitId)?.graph?.nodes[0]?.domain?.gloss).toEqual({
      zh: '已往',
      en: 'past',
    });
    reopened.close();
  });

  it('appends an id-less word again and rejects a node id that is not on the unit', () => {
    const { project, unitId, stored, expected } = seeded({
      payloadVersion: 1,
      id: 'g1',
      text: 'ka',
      nodes: [token('n1', 0), token('n2', 1)],
      relations: [],
    });
    const word = { type: 'token', label: 'ta', domain: { form: { default: 'ta' } } };
    const first = importAnalysis(project.db, {
      unitId,
      expected,
      nodes: [{ id: 'n1', domain: { gloss: { zh: '已往' } } }, word],
    });
    expect(first.counts).toEqual({
      updatedNodes: 1,
      appendedNodes: 1,
      deletedNodes: 0,
      updatedRelations: 0,
      appendedRelations: 0,
      deletedRelations: 0,
    });
    const ids = first.root.graph?.nodes.map((node) => node.id) ?? [];
    expect(ids).toContain('n1');
    expect(ids).toContain('n2');
    expect(first.root.graph?.nodes.find((node) => node.id === 'n1')?.domain?.gloss?.en).toBe(
      'past',
    );
    const added = ids.find((id) => id !== 'n1' && id !== 'n2');
    const second = importAnalysis(project.db, {
      unitId,
      expected: {
        manuscriptGeneration: 0,
        analysisGeneration: first.root.analysisGeneration,
        graphFingerprint: first.root.graphFingerprint,
      },
      nodes: [word],
    });
    const again = second.root.graph?.nodes.map((node) => node.id) ?? [];
    expect(again.filter((id) => id !== 'n1' && id !== 'n2' && id !== added)).toHaveLength(1);
    const before = getAnalysisRoot(project.db, unitId);
    expect(() =>
      importAnalysis(project.db, {
        unitId,
        expected: {
          manuscriptGeneration: 0,
          analysisGeneration: second.root.analysisGeneration,
          graphFingerprint: second.root.graphFingerprint,
        },
        removeNodes: ['x'],
      }),
    ).toThrow('analysis node is missing: x');
    expect(getAnalysisRoot(project.db, unitId)).toEqual(before);
    expect(stored.analysisGeneration).toBe(1);
    project.close();
  });

  it('rejects a missing update id and a node that is both updated and deleted', () => {
    const { project, unitId, expected } = seeded({
      payloadVersion: 1,
      id: 'g1',
      text: 'ka',
      nodes: [token('n1', 0)],
      relations: [],
    });
    const before = getAnalysisRoot(project.db, unitId);
    expect(() =>
      importAnalysis(project.db, {
        unitId,
        expected,
        nodes: [{ id: 'x', domain: { gloss: { zh: '新' } } }],
      }),
    ).toThrow('analysis node is missing: x');
    expect(() =>
      importAnalysis(project.db, {
        unitId,
        expected,
        nodes: [{ id: 'n1', domain: { gloss: { zh: '新' } } }],
        removeNodes: ['n1'],
      }),
    ).toThrow('analysis import updates and deletes the same id');
    expect(getAnalysisRoot(project.db, unitId)).toEqual(before);
    project.close();
  });

  it('keeps unmentioned relations and refuses to delete a node that still has one', () => {
    const link = {
      lexemeId: 'lex1',
      role: 'exact' as const,
      createdAt: T,
      updatedAt: T,
    };
    const { project, unitId, expected } = seeded({
      payloadVersion: 1,
      id: 'g1',
      text: 'ka',
      nodes: [token('n1', 0), token('n2', 1), { id: 'lex', type: 'lexemeRef', label: 'run' }],
      relations: [
        { id: 'r1', type: 'hasPart', sourceId: 'n1', targetId: 'n2' },
        { id: 'l1', type: 'linksLexeme', sourceId: 'n1', targetId: 'lex', link },
      ],
    });
    const kept = importAnalysis(project.db, {
      unitId,
      expected,
      nodes: [{ id: 'n1', domain: { gloss: { zh: '已往' } } }],
    });
    expect(kept.root.graph?.relations.map((relation) => relation.id).sort()).toEqual(['l1', 'r1']);
    const role = importAnalysis(project.db, {
      unitId,
      expected: {
        manuscriptGeneration: 0,
        analysisGeneration: kept.root.analysisGeneration,
        graphFingerprint: kept.root.graphFingerprint,
      },
      relations: [{ id: 'l1', role: 'stem' }],
    });
    const updated = role.root.graph?.relations.find((relation) => relation.id === 'l1');
    expect(updated?.link?.role).toBe('stem');
    expect(updated?.link?.lexemeId).toBe('lex1');
    const before = getAnalysisRoot(project.db, unitId);
    expect(() =>
      importAnalysis(project.db, {
        unitId,
        expected: {
          manuscriptGeneration: 0,
          analysisGeneration: role.root.analysisGeneration,
          graphFingerprint: role.root.graphFingerprint,
        },
        removeNodes: ['n1'],
      }),
    ).toThrow('analysis node removal leaves a relation');
    expect(getAnalysisRoot(project.db, unitId)).toEqual(before);
    project.close();
  });

  it('rolls back an import when the write fails', () => {
    const { dir, project, unitId, stored, expected } = seeded({
      payloadVersion: 1,
      id: 'g1',
      text: 'ka',
      nodes: [token('n1', 0)],
      relations: [],
    });
    expect(() =>
      importAnalysis(
        project.db,
        { unitId, expected, nodes: [{ id: 'n1', domain: { gloss: { zh: '已往' } } }] },
        () => {
          throw new Error('injected');
        },
      ),
    ).toThrow('injected');
    project.close();
    const reopened = openProject(dir);
    expect(getAnalysisRoot(reopened.db, unitId)).toEqual(stored);
    reopened.close();
  });

  it('keeps a span stale after the display key changes and clears it when the span is rewritten', () => {
    const span = {
      tokenId: 'n1',
      formKey: 'default',
      startOffset: 0,
      endOffset: 2,
      alignedForm: 'ka',
    };
    const { dir, project, unitId, stored } = seeded({
      payloadVersion: 1,
      id: 'g1',
      text: 'ka',
      nodes: [{ ...token('n1', 0), surfaceParts: [span] }],
      relations: [],
      displayContext: { formKey: 'default' },
    });
    const displayed = applyAnalysis(project.db, {
      unitId,
      expected: {
        manuscriptGeneration: 0,
        analysisGeneration: stored.analysisGeneration,
        graphFingerprint: stored.graphFingerprint,
      },
      changes: [{ action: 'graph.setDisplayContext', formKey: 'orthoA' }],
    });
    const kept = displayed.root.graph?.nodes[0]?.surfaceParts?.[0];
    expect(kept).toMatchObject(span);
    expect(
      displayed.root.graph ? surfacePartAlignment(displayed.root.graph, span) : 'aligned',
    ).toBe('stale');
    project.close();
    const reopened = openProject(dir);
    const root = getAnalysisRoot(reopened.db, unitId);
    expect(root?.graph?.nodes[0]?.surfaceParts?.[0]).toMatchObject(span);
    expect(root?.graph ? surfacePartAlignment(root.graph, span) : 'aligned').toBe('stale');
    const fixed = applyAnalysis(reopened.db, {
      unitId,
      expected: {
        manuscriptGeneration: 0,
        analysisGeneration: root?.analysisGeneration ?? 0,
        graphFingerprint: root?.graphFingerprint ?? '',
      },
      changes: [
        {
          action: 'node.setSurfaceParts',
          nodeId: 'n1',
          surfaceParts: [{ ...span, formKey: 'orthoA', alignedForm: 'kā' }],
        },
      ],
    });
    const part = fixed.root.graph?.nodes[0]?.surfaceParts?.[0];
    expect(part?.alignedForm).toBe('kā');
    expect(fixed.root.graph && part ? surfacePartAlignment(fixed.root.graph, part) : 'stale').toBe(
      'aligned',
    );
    reopened.close();
  });

  it('keeps a span when the form it cites changes', () => {
    const span = {
      tokenId: 'n1',
      formKey: 'default',
      startOffset: 0,
      endOffset: 1,
      alignedForm: 'k',
    };
    const { project, unitId, stored } = seeded({
      payloadVersion: 1,
      id: 'g1',
      text: 'ka',
      nodes: [{ ...token('n1', 0), surfaceParts: [span] }],
      relations: [],
    });
    const edited = applyAnalysis(project.db, {
      unitId,
      expected: {
        manuscriptGeneration: 0,
        analysisGeneration: stored.analysisGeneration,
        graphFingerprint: stored.graphFingerprint,
      },
      changes: [
        { action: 'node.setMapValue', nodeId: 'n1', field: 'form', key: 'default', value: 'ta' },
      ],
    });
    const part = edited.root.graph?.nodes[0]?.surfaceParts?.[0];
    expect(part).toMatchObject(span);
    expect(
      edited.root.graph && part ? surfacePartAlignment(edited.root.graph, part) : 'aligned',
    ).toBe('stale');
    expect(() =>
      applyAnalysis(project.db, {
        unitId,
        expected: {
          manuscriptGeneration: 0,
          analysisGeneration: edited.root.analysisGeneration,
          graphFingerprint: edited.root.graphFingerprint,
        },
        changes: [
          {
            action: 'node.setSurfaceParts',
            nodeId: 'n1',
            surfaceParts: [{ ...span, alignedForm: 'x' }],
          },
        ],
      }),
    ).toThrow('surface part is not aligned');
    expect(getAnalysisRoot(project.db, unitId)?.graph?.nodes[0]?.surfaceParts?.[0]).toMatchObject(
      span,
    );
    project.close();
  });

  it('rejects a new lexeme id and keeps an existing custom reference when its target is removed', () => {
    const { project, unitId, stored } = seeded({
      payloadVersion: 1,
      id: 'g1',
      text: 'ka',
      nodes: [token('n1', 0), token('n2', 1)],
      relations: [],
    });
    const field = createDefinition(project.db, {
      targetType: 'analysis-node',
      name: { en: 'ref' },
      fieldType: 'ref',
      targetTypes: ['analysis-node'],
      cardinality: 'one',
    });
    const linked = applyAnalysis(project.db, {
      unitId,
      expected: {
        manuscriptGeneration: 0,
        analysisGeneration: stored.analysisGeneration,
        graphFingerprint: stored.graphFingerprint,
      },
      changes: [
        {
          action: 'customField.set',
          nodeId: 'n1',
          definitionId: field.id,
          value: { targetType: 'analysis-node', targetId: 'n2', unitId },
        },
      ],
    });
    expect(() =>
      importAnalysis(project.db, {
        unitId,
        expected: {
          manuscriptGeneration: 0,
          analysisGeneration: linked.root.analysisGeneration,
          graphFingerprint: linked.root.graphFingerprint,
        },
        nodes: [{ id: 'n1', domain: { lexemeId: 'does-not-exist' } }],
      }),
    ).toThrow('lexeme is missing');
    const removed = importAnalysis(project.db, {
      unitId,
      expected: {
        manuscriptGeneration: 0,
        analysisGeneration: linked.root.analysisGeneration,
        graphFingerprint: linked.root.graphFingerprint,
      },
      removeNodes: ['n2'],
    });
    expect(removed.root.graph?.nodes.map((node) => node.id)).toEqual(['n1']);
    expect(removed.root.graph?.nodes[0]?.customFields?.[field.id]).toEqual({
      targetType: 'analysis-node',
      targetId: 'n2',
      unitId,
    });
    expect(() =>
      applyAnalysis(project.db, {
        unitId,
        expected: {
          manuscriptGeneration: 0,
          analysisGeneration: removed.root.analysisGeneration,
          graphFingerprint: removed.root.graphFingerprint,
        },
        changes: [
          {
            action: 'customField.set',
            nodeId: 'n1',
            definitionId: field.id,
            value: { targetType: 'analysis-node', targetId: 'missing', unitId },
          },
        ],
      }),
    ).toThrow('custom field value is invalid');
    project.close();
  });

  it('requires a custom field on a new analysis node and still edits an old one', () => {
    const { dir, project, unitId, expected } = seeded({
      payloadVersion: 1,
      id: 'g1',
      text: 'ka',
      nodes: [token('n1', 0)],
      relations: [],
    });
    createDefinition(project.db, {
      targetType: 'analysis-node',
      name: { en: 'Required' },
      fieldType: 'text',
      required: true,
    });
    const edited = importAnalysis(project.db, {
      unitId,
      expected,
      nodes: [{ id: 'n1', domain: { gloss: { zh: '已往' } } }],
    });
    expect(edited.root.graph?.nodes[0]?.domain?.gloss?.zh).toBe('已往');
    const fingerprint = edited.root.graphFingerprint;
    const tokens = project.db.prepare('SELECT COUNT(*) AS n FROM tokens').get();
    expect(() =>
      importAnalysis(project.db, {
        unitId,
        expected: {
          manuscriptGeneration: 0,
          analysisGeneration: edited.root.analysisGeneration,
          graphFingerprint: edited.root.graphFingerprint,
        },
        nodes: [{ type: 'token', domain: { form: { default: 'new' } } }],
      }),
    ).toThrow('analysis-node is missing a required field');
    expect(getAnalysisRoot(project.db, unitId)?.graphFingerprint).toBe(fingerprint);
    expect(getAnalysisRoot(project.db, unitId)?.graph?.nodes).toHaveLength(1);
    expect(project.db.prepare('SELECT COUNT(*) AS n FROM tokens').get()).toEqual(tokens);
    project.close();
    const again = openProject(dir);
    expect(getAnalysisRoot(again.db, unitId)?.graphFingerprint).toBe(fingerprint);
    expect(getAnalysisRoot(again.db, unitId)?.graph?.nodes).toHaveLength(1);
    again.close();
  });

  it('rejects a new relation that misses a required field and keeps the old graph', () => {
    const { dir, project, unitId, stored } = seeded({
      payloadVersion: 1,
      id: 'g1',
      text: 'ka',
      nodes: [token('n1', 0), token('n2', 1)],
      relations: [],
    });
    createDefinition(project.db, {
      targetType: 'analysis-relation',
      name: { en: 'Required' },
      fieldType: 'text',
      required: true,
    });
    const before = getAnalysisRoot(project.db, unitId);
    const tokens = project.db.prepare('SELECT COUNT(*) AS n FROM tokens').get();
    expect(() =>
      writeAnalysisRoot(project.db, {
        unitId,
        expectedAnalysisGeneration: stored.analysisGeneration,
        graph: {
          payloadVersion: 1,
          id: 'g1',
          text: 'ka',
          nodes: [token('n1', 0), token('n2', 1)],
          relations: [{ id: 'r1', type: 'next', sourceId: 'n1', targetId: 'n2' }],
        },
      }),
    ).toThrow('analysis-relation is missing a required field');
    expect(getAnalysisRoot(project.db, unitId)?.graphFingerprint).toBe(before?.graphFingerprint);
    expect(getAnalysisRoot(project.db, unitId)?.graph?.relations).toEqual([]);
    expect(project.db.prepare('SELECT COUNT(*) AS n FROM tokens').get()).toEqual(tokens);
    project.close();
    const again = openProject(dir);
    expect(getAnalysisRoot(again.db, unitId)?.graph?.relations).toEqual([]);
    expect(getAnalysisRoot(again.db, unitId)?.graphFingerprint).toBe(before?.graphFingerprint);
    again.close();
  });

  it('accepts a surface part that only names its token', () => {
    const { project, stored } = seeded({
      payloadVersion: 1,
      id: 'g1',
      text: 'ka',
      nodes: [
        token('n1', 0),
        {
          id: 'm',
          type: 'morpheme',
          label: 'k',
          domain: { form: { default: 'k' }, index: 0, createdAt: T, updatedAt: T },
          surfaceParts: [{ tokenId: 'n1', formKey: 'default' }],
        },
      ],
      relations: [{ id: 'h', type: 'hasPart', sourceId: 'n1', targetId: 'm' }],
    });
    expect(stored.graph?.nodes[1]?.surfaceParts).toEqual([{ tokenId: 'n1', formKey: 'default' }]);
    project.close();
  });

  it('keeps supplied fields on a new token and rejects an unknown field', () => {
    const { project, unitId, expected } = seeded({
      payloadVersion: 1,
      id: 'g1',
      text: 'ka',
      nodes: [token('n1', 0)],
      relations: [],
    });
    const field = createDefinition(project.db, {
      targetType: 'analysis-node',
      name: { en: 'Optional' },
      fieldType: 'text',
    });
    const imported = importAnalysis(project.db, {
      unitId,
      expected,
      nodes: [
        {
          type: 'token',
          domain: { form: { default: 'ta' }, pos: 'NOUN' },
          customFields: { [field.id]: 'research-value' },
          residue: [
            {
              id: 'r',
              namespace: 'source',
              batchId: 'b',
              localId: 'local',
              body: { raw: 'keep-me' },
              review: 'unreviewed',
              reviews: [],
            },
          ],
        },
      ],
    });
    const added = imported.root.graph?.nodes[1];
    expect(added?.domain?.pos).toBe('NOUN');
    expect(added?.customFields).toEqual({ [field.id]: 'research-value' });
    expect(added?.residue?.[0]?.body).toEqual({ raw: 'keep-me' });
    expect(() =>
      importAnalysis(project.db, {
        unitId,
        expected: {
          manuscriptGeneration: 0,
          analysisGeneration: imported.root.analysisGeneration,
          graphFingerprint: imported.root.graphFingerprint,
        },
        nodes: [{ id: 'n1', domain: { gloss: { en: 'changed' }, pos: 42 }, unrecognized: 'lost' }],
      }),
    ).toThrow('analysis import item is invalid');
    expect(getAnalysisRoot(project.db, unitId)?.graph?.nodes[0]?.domain?.gloss?.en).toBe('past');
    project.close();
  });

  it('keeps language, lexeme, and surface parts on a new token', () => {
    const { dir, project, unitId, expected } = seeded({
      payloadVersion: 1,
      id: 'g1',
      text: 'ka',
      nodes: [token('n1', 0)],
      relations: [],
    });
    project.db
      .prepare(
        `INSERT INTO languages (id, name_json, source_type, iso6393, created_at, updated_at)
         VALUES (?, '{"en":"English"}', 'user-custom', ?, ?, ?)`,
      )
      .run('lang-1', 'eng', T, T);
    saveLexemeEntry(project.db, {
      id: 'lex-1',
      entry: { headword: 'ta', senses: [{ id: 'sense', definitions: [{ text: 'that' }] }] },
    });
    const imported = importAnalysis(project.db, {
      unitId,
      expected,
      nodes: [
        {
          type: 'token',
          domain: { form: { default: 'ta' }, languageId: 'lang-1', lexemeId: 'lex-1' },
          surfaceParts: [{ tokenId: 'n1', formKey: 'default' }],
        },
      ],
    });
    const added = imported.root.graph?.nodes.find((node) => node.domain?.form.default === 'ta');
    expect(added?.domain?.languageId).toBe('lang-1');
    expect(added?.domain?.lexemeId).toBe('lex-1');
    expect(added?.surfaceParts).toEqual([{ tokenId: 'n1', formKey: 'default' }]);
    project.close();
    const reopened = openProject(dir);
    const stored = getAnalysisRoot(reopened.db, unitId)?.graph?.nodes.find(
      (node) => node.domain?.form.default === 'ta',
    );
    expect(stored?.domain?.languageId).toBe('lang-1');
    expect(stored?.domain?.lexemeId).toBe('lex-1');
    expect(stored?.surfaceParts).toEqual([{ tokenId: 'n1', formKey: 'default' }]);
    reopened.close();
  });

  it('rejects a string index without writing the gloss sent with it', () => {
    const { project, unitId, expected } = seeded({
      payloadVersion: 1,
      id: 'g1',
      text: 'ka',
      nodes: [token('n1', 0)],
      relations: [],
    });
    expect(() =>
      importAnalysis(project.db, {
        unitId,
        expected,
        nodes: [{ id: 'n1', domain: { gloss: { en: 'changed' }, index: 'invalid' } }],
      }),
    ).toThrow('analysis import item is invalid');
    expect(getAnalysisRoot(project.db, unitId)?.graph?.nodes[0]?.domain?.gloss?.en).toBe('past');
    project.close();
  });

  it('rejects a non-string language id without writing the gloss sent with it', () => {
    const { project, unitId, expected } = seeded({
      payloadVersion: 1,
      id: 'g1',
      text: 'ka',
      nodes: [token('n1', 0)],
      relations: [],
    });
    expect(() =>
      importAnalysis(project.db, {
        unitId,
        expected,
        nodes: [{ id: 'n1', domain: { gloss: { en: 'changed' }, languageId: 7 } }],
      }),
    ).toThrow('analysis import item is invalid');
    expect(getAnalysisRoot(project.db, unitId)?.graph?.nodes[0]?.domain?.gloss?.en).toBe('past');
    project.close();
  });
});
