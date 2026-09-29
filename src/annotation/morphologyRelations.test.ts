import { describe, expect, it } from 'vitest';
import {
  assignReduplicates,
  assignSegmentProcess,
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
