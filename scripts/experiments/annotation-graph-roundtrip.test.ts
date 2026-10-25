// R1 proposal probe only: no production imports may depend on this test's codec.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  validateAnnotationAnalysisGraphFixture,
  type AnnotationAnalysisGraphFixture,
} from '../../src/annotation/analysisGraph';
import { projectUtteranceAnalysisGraph } from '../../src/annotation/projectUtteranceAnalysisGraph';
import { buildAnnotationIgtRows } from '../../src/pages/annotation/annotationIgtRows';
import { buildAnnotationUtteranceGraph } from '../../src/pages/annotation/buildAnnotationUtteranceGraph';
import {
  validateUnitTokenDoc,
  validateUnitMorphemeDoc,
  validateTokenLexemeLinkDoc,
  validateUserNoteDoc,
} from '../../src/db/schemas';
import type {
  LayerUnitDocType,
  UnitTokenDocType,
  UnitMorphemeDocType,
  TokenLexemeLinkDocType,
  UserNoteDocType,
} from '../../src/db/types';

const now = '2026-10-25T00:00:00.000Z';
const provenance = {
  actorType: 'human',
  method: 'manual',
  createdAt: now,
  reviewStatus: 'confirmed',
  actorId: 'synthetic-reviewer',
  params: { source: 'synthetic-probe' },
} satisfies NonNullable<UnitTokenDocType['provenance']>;
const map = z.record(z.string().min(1), z.string());
const payload = z
  .object({
    form: map,
    gloss: map.optional(),
    pos: z.string().optional(),
    lexemeId: z.string().optional(),
    languageId: z.string().optional(),
    index: z.number().int().nonnegative(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();

type Rows = {
  tokens: UnitTokenDocType[];
  morphemes: UnitMorphemeDocType[];
  links: TokenLexemeLinkDocType[];
};
const rows: Rows = {
  tokens: [
    {
      id: 'tok-a',
      textId: 'project-a',
      unitId: 'unit-a',
      form: { orthA: 'abca', orthB: 'ABCA' },
      gloss: { eng: 'wrap', zho: '包裹' },
      pos: 'v',
      lexemeId: 'entry-a',
      languageId: 'language-a',
      provenance,
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'tok-b',
      textId: 'project-a',
      unitId: 'unit-a',
      form: { orthA: 'de' },
      gloss: {},
      tokenIndex: 1,
      createdAt: now,
      updatedAt: now,
    },
  ],
  morphemes: [
    {
      id: 'morph-a',
      textId: 'project-a',
      unitId: 'unit-a',
      tokenId: 'tok-a',
      form: { orthA: 'a…a', orthB: 'A…A' },
      gloss: { eng: 'CIRC', zho: '环缀' },
      pos: 'affix',
      lexemeId: 'entry-affix',
      provenance,
      surfaceParts: [
        { startOffset: 0, endOffset: 1 },
        { startOffset: 3, endOffset: 4 },
      ],
      morphemeIndex: 0,
      createdAt: now,
      updatedAt: now,
    },
  ],
  links: [
    {
      id: 'link-a',
      targetType: 'token',
      targetId: 'tok-a',
      lexemeId: 'entry-a',
      senseId: 'sense-a',
      role: 'manual',
      confidence: 0.9,
      provenance,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'link-b',
      targetType: 'morpheme',
      targetId: 'morph-a',
      lexemeId: 'entry-affix',
      senseId: 'sense-a',
      role: 'stem',
      confidence: 0.8,
      provenance,
      createdAt: now,
      updatedAt: now,
    },
  ],
};
const notes: UserNoteDocType[] = [
  {
    id: 'note-a',
    textId: 'project-a',
    targetType: 'morpheme',
    targetId: 'morph-a',
    content: { eng: 'Synthetic note', zho: '合成备注' },
    category: 'linguistic',
    provenance,
    createdAt: now,
    updatedAt: now,
  },
];

function baseGraph(): AnnotationAnalysisGraphFixture {
  const graph = projectUtteranceAnalysisGraph({
    id: 'unit-a',
    text: 'abca de',
    tokens: [
      {
        id: 'tok-a',
        form: 'abca',
        gloss: 'wrap',
        pos: 'v',
        morphemes: [
          {
            id: 'morph-a',
            form: 'a…a',
            gloss: 'CIRC',
            pos: 'affix',
            surfaceParts: rows.morphemes[0]!.surfaceParts!,
          },
        ],
      },
      { id: 'tok-b', form: 'de' },
    ],
  });
  graph.nodes.push(
    { id: 'mwe-a', type: 'mwe', label: 'abca de' },
    { id: 'zero-a', type: 'zero', label: 'zero' },
    { id: 'process-a', type: 'process', label: 'circumfixation' },
  );
  graph.relations.push(
    { id: 'mwe-rel-a', type: 'partOfMwe', sourceId: 'tok-a', targetId: 'mwe-a' },
    { id: 'mwe-rel-b', type: 'partOfMwe', sourceId: 'tok-b', targetId: 'mwe-a' },
    { id: 'zero-rel-a', type: 'hasPart', sourceId: 'tok-a', targetId: 'zero-a' },
    { id: 'process-rel-a', type: 'derivedByProcess', sourceId: 'morph-a', targetId: 'process-a' },
  );
  return validateAnnotationAnalysisGraphFixture(graph);
}

// Reserved features keys are the proposal, not an assertion that today's graph validator checks them.
function pack(graph: AnnotationAnalysisGraphFixture, source: Rows): AnnotationAnalysisGraphFixture {
  const result = structuredClone(graph);
  for (const row of [...source.tokens, ...source.morphemes]) {
    const node = result.nodes.find((item) => item.id === row.id);
    if (!node) throw new Error('missing linear node');
    const { id: _id, textId: _project, unitId: _unit, provenance: sourceProvenance, ...rest } = row;
    const index = 'tokenIndex' in rest ? rest.tokenIndex : rest.morphemeIndex;
    const { form, gloss, pos, lexemeId, createdAt, updatedAt } = rest;
    node.features = {
      ...node.features,
      jieyuLinear: payload.parse({
        form,
        ...(gloss !== undefined ? { gloss } : {}),
        ...(pos !== undefined ? { pos } : {}),
        ...(lexemeId !== undefined ? { lexemeId } : {}),
        ...('languageId' in rest && rest.languageId !== undefined
          ? { languageId: rest.languageId }
          : {}),
        index,
        createdAt,
        updatedAt,
      }),
      ...(sourceProvenance ? { jieyuProvenance: sourceProvenance } : {}),
    };
  }
  for (const link of source.links) {
    const { targetId, targetType, ...body } = link;
    const target = result.nodes.find((node) => node.id === targetId);
    if (target?.type !== targetType) throw new Error('wrong link target');
    const refId = `ref-${link.id}`;
    result.nodes.push({
      id: refId,
      type: 'lexemeRef',
      label: link.lexemeId,
      features: { lexemeId: link.lexemeId, ...(link.senseId ? { senseId: link.senseId } : {}) },
    });
    result.relations.push({
      id: link.id,
      type: 'linksLexeme',
      sourceId: targetId,
      targetId: refId,
      features: { jieyuLexemeLink: body },
    });
  }
  return validateAnnotationAnalysisGraphFixture(result);
}

function rebuild(input: unknown): Rows {
  const graph = validateAnnotationAnalysisGraphFixture(input);
  const result: Rows = { tokens: [], morphemes: [], links: [] };
  for (const node of graph.nodes) {
    if (node.type !== 'token' && node.type !== 'morpheme') continue;
    const body = payload.parse(node.features?.jieyuLinear);
    const index = body.index;
    const common = {
      id: node.id,
      textId: 'project-a',
      unitId: graph.id,
      form: body.form,
      createdAt: body.createdAt,
      updatedAt: body.updatedAt,
      ...(body.gloss !== undefined ? { gloss: body.gloss } : {}),
      ...(body.pos !== undefined ? { pos: body.pos } : {}),
      ...(body.lexemeId !== undefined ? { lexemeId: body.lexemeId } : {}),
      ...(body.languageId !== undefined ? { languageId: body.languageId } : {}),
      ...(node.features?.jieyuProvenance !== undefined
        ? {
            provenance: node.features.jieyuProvenance as NonNullable<
              UnitTokenDocType['provenance']
            >,
          }
        : {}),
    };
    if (node.type === 'token') {
      const row: UnitTokenDocType = { ...common, tokenIndex: index };
      validateUnitTokenDoc(row);
      result.tokens.push(row);
    } else {
      const parents = graph.relations.filter(
        (rel) =>
          rel.type === 'hasPart' &&
          rel.targetId === node.id &&
          graph.nodes.some((item) => item.id === rel.sourceId && item.type === 'token'),
      );
      if (parents.length !== 1) throw new Error('morpheme needs exactly one token');
      const tokenId = parents[0]!.sourceId;
      if (node.surfaceParts?.some((span) => span.tokenId !== tokenId))
        throw new Error('foreign span');
      const row: UnitMorphemeDocType = {
        ...common,
        tokenId,
        morphemeIndex: index,
        ...(node.surfaceParts !== undefined
          ? {
              surfaceParts: node.surfaceParts.map((span) => ({
                startOffset: span.startOffset!,
                endOffset: span.endOffset!,
              })),
            }
          : {}),
      };
      validateUnitMorphemeDoc(row);
      result.morphemes.push(row);
    }
  }
  for (const rel of graph.relations.filter((item) => item.type === 'linksLexeme')) {
    const owner = graph.nodes.find((node) => node.id === rel.sourceId);
    const ref = graph.nodes.find((node) => node.id === rel.targetId);
    const body = rel.features?.jieyuLexemeLink as Omit<
      TokenLexemeLinkDocType,
      'targetId' | 'targetType'
    >;
    if (!body || (owner?.type !== 'token' && owner?.type !== 'morpheme'))
      throw new Error('bad link');
    const row = { ...body, targetId: owner.id, targetType: owner.type };
    validateTokenLexemeLinkDoc(row);
    if (
      row.id !== rel.id ||
      ref?.type !== 'lexemeRef' ||
      ref.features?.lexemeId !== row.lexemeId ||
      ref.features?.senseId !== row.senseId
    )
      throw new Error('conflicting lexeme identity');
    result.links.push(row);
  }
  return result;
}

function validateProjectionIds(graphs: AnnotationAnalysisGraphFixture[]): void {
  const seen = new Set<string>();
  for (const graph of graphs)
    for (const node of graph.nodes) {
      if (node.type !== 'token' && node.type !== 'morpheme') continue;
      if (seen.has(node.id)) throw new Error('projection id collision');
      seen.add(node.id);
    }
}

const roundtrip = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe('R1 annotation graph proposal probe (no production writes)', () => {
  it('shows the current UI graph loses a non-displayed orthography and gloss language', () => {
    const unit: LayerUnitDocType = {
      id: 'unit-a',
      textId: 'project-a',
      startTime: 0,
      endTime: 1,
      transcription: { orthA: 'abca de' },
      createdAt: now,
      updatedAt: now,
    };
    const build = (tokens: UnitTokenDocType[]) => {
      const row = buildAnnotationIgtRows({
        units: [unit],
        tokens,
        textId: 'project-a',
        mediaId: 'media-a',
        languageId: 'orthA',
      })[0]!;
      return buildAnnotationUtteranceGraph({ row, morphsByTokenId: {}, linksByTokenId: {} });
    };
    const changed = structuredClone(rows.tokens);
    changed[0]!.form.orthB = 'DIFFERENT';
    changed[0]!.gloss!.zho = '不同';
    expect(changed).not.toEqual(rows.tokens);
    expect(build(changed)).toEqual(build(rows.tokens));
  });

  it('rebuilds all row fields from serialized graph alone and preserves independent notes', () => {
    const stored = roundtrip(pack(baseGraph(), rows));
    expect(rebuild(stored)).toEqual(rows);
    const graph = validateAnnotationAnalysisGraphFixture(stored);
    expect(
      graph.nodes.filter((node) => ['mwe', 'zero', 'process'].includes(node.type)),
    ).toHaveLength(3);
    expect(rebuild(stored).morphemes).toHaveLength(1);
    expect(graph.relations).toEqual(pack(baseGraph(), rows).relations);
    const storedNotes = z.array(z.custom<UserNoteDocType>()).parse(roundtrip(notes));
    storedNotes.forEach(validateUserNoteDoc);
    expect(storedNotes).toEqual(notes);
    expect(rebuild(stored).morphemes.map((row) => row.id)).toContain(storedNotes[0]!.targetId);
  });

  it('keeps ids, links and notes while a complete-map edit changes one form', () => {
    const edited = structuredClone(rows);
    edited.tokens[0]!.form.orthB = 'changed';
    const actual = rebuild(roundtrip(pack(baseGraph(), edited)));
    expect(actual).toEqual(edited);
    expect(actual.links).toEqual(rows.links);
    expect(notes[0]!.targetId).toBe(actual.morphemes[0]!.id);
  });

  it('rejects a malformed complete map instead of falling back to label', () => {
    const graph = pack(baseGraph(), rows);
    graph.nodes[0]!.features = { jieyuLinear: { form: { orthA: 123 }, index: 0 } };
    expect(() => rebuild(roundtrip(graph))).toThrow();
  });

  it('rejects a lost parent or a lexeme/sense disagreement', () => {
    const graph = pack(baseGraph(), rows);
    graph.relations = graph.relations.filter(
      (rel) => !(rel.type === 'hasPart' && rel.targetId === 'morph-a'),
    );
    expect(() => rebuild(graph)).toThrow(/exactly one token/);
    const badLink = pack(baseGraph(), rows);
    badLink.nodes.find((node) => node.id === 'ref-link-a')!.features!.senseId = 'different';
    expect(() => rebuild(badLink)).toThrow(/conflicting lexeme/);
  });

  it('demonstrates graph-local ids are insufficient for table primary keys', () => {
    const a = pack(baseGraph(), rows);
    const b = { ...structuredClone(a), id: 'unit-b' };
    expect(() => validateAnnotationAnalysisGraphFixture(b)).not.toThrow();
    expect(() => validateProjectionIds([a, b])).toThrow(/collision/);
  });
});
