import { describe, expect, it } from 'vitest';
import { exportUtteranceToFlexNote, exportUtteranceToLatex } from './analysisGraphExport';
import {
  assignAllomorph,
  assignDiscontinuousParts,
  assignIncorporation,
  assignReduplicates,
  assignRootPattern,
  assignSegmentProcess,
  assignSharedFeature,
  assignSuppletion,
  assignTone,
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
    const withSpans = assignRootPattern(
      projectUtteranceAnalysisGraph({
        id: 'utt-spans',
        text: 'katab',
        tokens: [
          {
            id: 'tok-katab',
            form: 'katab',
            morphemes: [
              {
                id: 'morph-root',
                form: 'ktb',
                surfaceParts: [
                  { startOffset: 0, endOffset: 1 },
                  { startOffset: 2, endOffset: 3 },
                  { startOffset: 4, endOffset: 5 },
                ],
              },
            ],
          },
        ],
      }),
      'tok-katab',
      'k-t-b',
      'CaCaC',
    );
    expect(withSpans.nodes.find((node) => node.id === 'root-tok-katab')?.surfaceParts).toEqual([
      { tokenId: 'tok-katab', startOffset: 0, endOffset: 1 },
      { tokenId: 'tok-katab', startOffset: 2, endOffset: 3 },
      { tokenId: 'tok-katab', startOffset: 4, endOffset: 5 },
    ]);
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

  it('stores two spans for a discontinuous morpheme and a tone label', () => {
    const uttered = projectUtteranceAnalysisGraph({
      id: 'utt-disc',
      text: 'gelaufen',
      tokens: [
        {
          id: 'tok-1',
          form: 'gelaufen',
          morphemes: [
            { id: 'morph-ge', form: 'ge' },
            { id: 'morph-lauf', form: 'lauf' },
            { id: 'morph-en', form: 'en' },
          ],
        },
      ],
    });
    const marked = assignDiscontinuousParts(uttered, 'tok-1', 'morph-ge', 'morph-en');
    const disc = marked.nodes.find((node) => node.id === 'disc-tok-1');
    expect(disc?.surfaceParts).toEqual([
      { tokenId: 'tok-1', startOffset: 0, endOffset: 2 },
      { tokenId: 'tok-1', startOffset: 6, endOffset: 8 },
    ]);
    expect(disc?.label).toBe('ge...en');
    expect(marked.relations).toContainEqual(
      expect.objectContaining({
        type: 'discontinuousPartOf',
        sourceId: 'disc-tok-1',
        targetId: 'tok-1',
      }),
    );
    const toned = assignTone(marked, 'tok-1', 'H');
    expect(toned.nodes).toContainEqual(
      expect.objectContaining({ type: 'prosodicFeature', label: 'H', features: { tone: 'H' } }),
    );
    const fresh = projectUtteranceAnalysisGraph({
      id: 'utt-disc',
      text: 'gelaufen',
      tokens: [
        {
          id: 'tok-1',
          form: 'gelaufen',
          morphemes: [
            { id: 'morph-ge', form: 'ge' },
            { id: 'morph-lauf', form: 'lauf' },
            { id: 'morph-en', form: 'en' },
          ],
        },
      ],
    });
    const kept = retainMorphologyRelations(fresh, toned);
    expect(kept.nodes.find((node) => node.id === 'disc-tok-1')?.surfaceParts).toHaveLength(2);
    expect(kept.nodes.find((node) => node.type === 'prosodicFeature')?.label).toBe('H');
  });
});
