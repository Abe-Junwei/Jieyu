import { describe, expect, it } from 'vitest';
import { exportUtteranceToFlexNote, exportUtteranceToLatex } from './analysisGraphExport';
import {
  assignAllomorph,
  assignIncorporation,
  assignReduplicates,
  assignRootPattern,
  assignSegmentProcess,
  assignSharedFeature,
  assignSuppletion,
  retainMorphologyRelations,
} from './morphologyRelations';
import { projectUtteranceAnalysisGraph } from './projectUtteranceAnalysisGraph';

const base = projectUtteranceAnalysisGraph({
  id: 'utt-morph',
  text: 'wug-wug went',
  tokens: [
    {
      id: 'tok-wug',
      form: 'wug-wug',
      morphemes: [
        { id: 'morph-copy', form: 'wug' },
        { id: 'morph-stem', form: 'wug' },
      ],
    },
    { id: 'tok-went', form: 'went', gloss: 'go.PST' },
  ],
});

describe('morphology relations', () => {
  it('links a reduplicant to its stem without a new cut', () => {
    const graph = assignReduplicates(base, 'morph-copy', 'morph-stem');
    expect(graph.relations).toContainEqual(
      expect.objectContaining({
        type: 'reduplicates',
        sourceId: 'morph-copy',
        targetId: 'morph-stem',
      }),
    );
    expect(
      graph.nodes.some((node) => node.type === 'process' && node.label === 'reduplication'),
    ).toBe(true);
    expect(assignReduplicates(graph, 'morph-copy', 'morph-stem')).toBe(graph);
  });

  it('records suppletion on the whole token', () => {
    const graph = assignSuppletion(base, 'tok-went', 'go');
    expect(graph.nodes).toContainEqual(
      expect.objectContaining({ type: 'underlyingForm', label: 'go' }),
    );
    expect(graph.nodes).toContainEqual(
      expect.objectContaining({ type: 'surfaceForm', label: 'went' }),
    );
    expect(graph.relations).toContainEqual(
      expect.objectContaining({
        type: 'suppletes',
        sourceId: 'srf-tok-went',
        targetId: 'und-tok-went',
      }),
    );
    expect(graph.nodes.find((node) => node.type === 'surfaceForm')?.surfaceParts).toEqual([
      { tokenId: 'tok-went', startOffset: 0, endOffset: 4 },
    ]);
  });

  it('records substitution, deletion, and tone as processes', () => {
    const substituted = assignSegmentProcess(base, 'tok-went', 'substitutesSegment');
    const deleted = assignSegmentProcess(substituted, 'tok-went', 'deletesSegment');
    const toned = assignSegmentProcess(deleted, 'tok-went', 'overwritesTone');
    expect(toned.relations.map((relation) => relation.type)).toEqual(
      expect.arrayContaining(['substitutesSegment', 'deletesSegment', 'overwritesTone']),
    );
  });

  it('shares one feature across two morphemes and records root, incorporation, and allomorph', () => {
    const uttered = projectUtteranceAnalysisGraph({
      id: 'utt-more',
      text: 'gekauft berrypick',
      tokens: [
        {
          id: 'tok-ge',
          form: 'gekauft',
          morphemes: [
            { id: 'morph-ge', form: 'ge', gloss: 'PST' },
            { id: 'morph-t', form: 't', gloss: 'en' },
          ],
        },
        {
          id: 'tok-berry',
          form: 'berrypick',
          senseId: 'berry',
          morphemes: [{ id: 'morph-berry', form: 'berry' }],
        },
      ],
    });
    const shared = assignSharedFeature(uttered, 'morph-t', 'morph-ge');
    expect(
      shared.relations.filter(
        (relation) =>
          relation.type === 'realizesFeature' && relation.targetId.startsWith('feat-morph-ge'),
      ),
    ).toHaveLength(2);
    const rooted = assignRootPattern(shared, 'tok-ge', 'k-t-b', 'CaCaC');
    expect(rooted.nodes.find((node) => node.id === 'root-tok-ge')?.surfaceParts).toBeUndefined();
    expect(rooted.projectionDiagnostics).toContainEqual(
      expect.objectContaining({
        message: 'Root spans were not stored; only the root and pattern labels are kept.',
      }),
    );
    const incorporated = assignIncorporation(rooted, 'morph-berry');
    expect(incorporated.relations).toContainEqual(
      expect.objectContaining({ type: 'hasPart', targetId: 'morph-berry', role: 'incorporated' }),
    );
    const allomorph = assignAllomorph(incorporated, 'morph-berry');
    expect(allomorph.relations.some((relation) => relation.type === 'hasAllomorph')).toBe(true);
    expect(exportUtteranceToLatex(allomorph)).toContain('\\gla gekauft berrypick //');
    expect(exportUtteranceToFlexNote(allomorph)).toContain('hasAllomorph:');
    expect(exportUtteranceToFlexNote(allomorph)).not.toContain('<item');
  });

  it('keeps those relations when the utterance is projected again', () => {
    const saved = assignSuppletion(
      assignReduplicates(base, 'morph-copy', 'morph-stem'),
      'tok-went',
      'go',
    );
    const fresh = projectUtteranceAnalysisGraph({
      id: 'utt-morph',
      text: 'wug-wug went',
      tokens: [
        {
          id: 'tok-wug',
          form: 'wug-wug',
          morphemes: [
            { id: 'morph-copy', form: 'wug' },
            { id: 'morph-stem', form: 'wug' },
          ],
        },
        { id: 'tok-went', form: 'went' },
      ],
    });
    const kept = retainMorphologyRelations(fresh, saved);
    expect(kept.relations.some((relation) => relation.type === 'reduplicates')).toBe(true);
    expect(kept.relations.some((relation) => relation.type === 'suppletes')).toBe(true);
  });
});
