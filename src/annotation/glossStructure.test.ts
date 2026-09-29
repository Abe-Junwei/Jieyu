import { describe, expect, it } from 'vitest';
import { projectStructuralParseToAnalysisGraph } from './analysisGraphProjection';
import {
  exportUtteranceToCldf,
  exportUtteranceToConllu,
  exportUtteranceToLigt,
} from './analysisGraphExport';
import { parseGlossStructure } from './structuralRuleProfile';
import { projectUtteranceAnalysisGraph } from './projectUtteranceAnalysisGraph';

function project(gloss: string, form = gloss) {
  return projectUtteranceAnalysisGraph({
    id: 'unit-1',
    text: form,
    displayGloss: gloss,
    tokens: [{ id: 'tok-1', form, gloss }],
  });
}

describe('utterance gloss structure', () => {
  it('links a clitic gloss to its host without rewriting the labels', () => {
    const graph = projectUtteranceAnalysisGraph({
      id: 'fixture-clitic-im',
      text: "I'm here.",
      displayGloss: '1SG=COP here',
      tokens: [
        { id: 'tok-im', form: "I'm", gloss: '1SG=COP' },
        { id: 'tok-here', form: 'here', gloss: 'here' },
      ],
    });
    const words = graph.nodes.filter((node) => node.type === 'word').map((node) => node.label);
    expect(words).toEqual(['1SG', 'COP']);
    expect(graph.relations).toContainEqual(
      expect.objectContaining({
        type: 'cliticizesTo',
        sourceId: 'gs-tok-im-2',
        targetId: 'gs-tok-im-1',
      }),
    );
    expect(graph.nodes.find((node) => node.id === 'feat-gs-tok-im-1')?.features).toMatchObject({
      Person: '1',
      Number: 'Sing',
    });
    expect(graph.nodes.find((node) => node.id === 'gloss-tok-im')?.label).toBe('1SG=COP');
    expect(graph.displayGloss).toBe('1SG=COP here');
    expect(exportUtteranceToConllu(graph)).toContain('Person=1');
    expect(exportUtteranceToCldf(graph).row).toMatchObject({
      Analyzed_Word: "I'm here",
      Gloss: '1SG=COP here',
    });
    const ligt = exportUtteranceToLigt(graph);
    const tiers = ligt['ligt:hasTier'] as Array<{ 'ligt:item': Array<{ 'rdfs:label': string }> }>;
    const morphLabels = tiers[1]?.['ligt:item'].map((item) => item['rdfs:label']) ?? [];
    expect(morphLabels).toEqual(expect.arrayContaining(['1SG', 'COP']));
  });

  it('keeps a dotted feature on the zero morpheme', () => {
    const graph = project('sheep-∅.PL', 'sheep');
    expect(graph.nodes.filter((node) => node.type === 'zero').map((node) => node.label)).toEqual([
      '∅',
    ]);
    expect(graph.nodes.some((node) => node.type === 'morpheme' && node.label === 'PL')).toBe(false);
    expect(graph.nodes.find((node) => node.id === 'feat-gs-tok-1-2')?.features).toMatchObject({
      Number: 'Plur',
    });
    expect(exportUtteranceToConllu(graph)).toContain('Number=Plur');
    expect(exportUtteranceToCldf(graph).row?.Analyzed_Word).toBe('sheep');
    const zeroLigt = exportUtteranceToLigt(graph);
    const zeroTiers = zeroLigt['ligt:hasTier'] as Array<{
      'ligt:item': Array<{ 'rdfs:label': string }>;
    }>;
    expect(zeroTiers[1]?.['ligt:item'].map((item) => item['rdfs:label'])).toContain('∅');
    expect(graph.projectionDiagnostics).toContainEqual(
      expect.objectContaining({
        target: 'conllu',
        status: 'degraded',
        message: 'Zero morpheme is not a CoNLL-U empty node.',
      }),
    );
  });

  it('marks an infix and does not invent surface offsets', () => {
    const graph = project('touch<PRS>', 'tango');
    const infix = graph.relations.find((relation) => relation.role === 'infix');
    expect(infix?.type).toBe('hasPart');
    expect(graph.nodes.find((node) => node.id === infix?.targetId)?.label).toBe('PRS');
    expect(graph.relations).toContainEqual(
      expect.objectContaining({
        type: 'discontinuousPartOf',
        sourceId: 'gs-tok-1-1',
        targetId: 'tok-1',
      }),
    );
    expect(graph.nodes.find((node) => node.id === 'gs-tok-1-1')?.surfaceParts).toBeUndefined();
    expect(graph.nodes.find((node) => node.id === 'feat-gs-tok-1-2')?.features).toMatchObject({
      Tense: 'Pres',
    });
    expect(graph.projectionDiagnostics).toContainEqual(
      expect.objectContaining({ message: 'Infix surface offsets are not in the gloss.' }),
    );
    expect(graph.displayGloss).toBe('touch<PRS>');
  });

  it('turns an empty supplied bracket into a zero morpheme', () => {
    const graph = project('sheep-[]', 'sheep');
    expect(graph.nodes.some((node) => node.type === 'zero' && node.label === '∅')).toBe(true);
  });

  it('records a backslash as a review and not a process', () => {
    const graph = project('go\\went', 'went');
    expect(graph.nodes.some((node) => node.type === 'process')).toBe(false);
    expect(graph.projectionDiagnostics).toContainEqual(
      expect.objectContaining({
        status: 'needsReview',
        message: 'Alternation marker is not a morpheme boundary.',
      }),
    );
  });

  it('keeps a circumfix that already has two surface spans', () => {
    const graph = projectUtteranceAnalysisGraph({
      id: 'fixture-circumfix',
      text: 'gelaufen',
      tokens: [
        {
          id: 'tok-1',
          form: 'gelaufen',
          morphemes: [
            {
              id: 'morph-circ',
              form: 'ge...en',
              surfaceParts: [
                { startOffset: 0, endOffset: 2 },
                { startOffset: 6, endOffset: 8 },
              ],
            },
          ],
        },
      ],
    });
    expect(graph.relations).toContainEqual(
      expect.objectContaining({
        type: 'discontinuousPartOf',
        sourceId: 'morph-circ',
        targetId: 'tok-1',
      }),
    );
  });

  it('packs dotted features into one exponent', () => {
    const graph = project('good-NOM.SG.M', 'bonus');
    const exponent = graph.nodes.find((node) => node.type === 'exponent');
    expect(exponent?.label).toBe('NOM.SG.M');
    const bundles = graph.relations.filter(
      (relation) => relation.type === 'realizesFeature' && relation.sourceId === exponent?.id,
    );
    expect(bundles).toHaveLength(2);
    expect(graph.nodes.some((node) => node.type === 'morpheme' && node.label === 'SG')).toBe(false);
    expect(graph.projectionDiagnostics).toContainEqual(
      expect.objectContaining({ message: 'Gloss label M was not mapped to a feature.' }),
    );
  });

  it('leaves the single-token structural projection on token-1', () => {
    const graph = projectStructuralParseToAnalysisGraph(parseGlossStructure('1SG=COP'));
    expect(graph.nodes[0]?.id).toBe('token-1');
  });
});
