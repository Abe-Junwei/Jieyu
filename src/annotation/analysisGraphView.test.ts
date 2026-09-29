import { describe, expect, it } from 'vitest';
import { readAnalysisGraphView } from './analysisGraphView';
import { assignReduplicates, assignSuppletion } from './morphologyRelations';
import { assignPartOfMwe } from './partOfMwe';
import { projectUtteranceAnalysisGraph } from './projectUtteranceAnalysisGraph';

describe('readAnalysisGraphView', () => {
  it('lists the saved multiword group, mapped features, and review notices', () => {
    const graph = assignPartOfMwe(
      projectUtteranceAnalysisGraph({
        id: 'unit-view-1',
        text: 'take a walk walked',
        tokens: [
          { id: 'tok-take', form: 'take' },
          { id: 'tok-a', form: 'a' },
          { id: 'tok-walk', form: 'walk' },
          {
            id: 'tok-walked',
            form: 'walked',
            gloss: 'walk-PST',
            morphemes: [{ id: 'morph-s', form: 's', gloss: 'S' }],
          },
        ],
      }),
      ['tok-take', 'tok-a', 'tok-walk'],
    );

    const view = readAnalysisGraphView(graph);
    expect(view.multiwordExpressions).toEqual([
      {
        id: 'mwe-1',
        label: 'take a walk',
        tokenIds: ['tok-take', 'tok-a', 'tok-walk'],
      },
    ]);
    expect(view.features).toEqual([
      {
        ownerId: 'tok-walked',
        ownerLabel: 'walked',
        glossLabel: 'walk-PST',
        features: [{ key: 'Tense', value: 'Past' }],
      },
    ]);
    expect(view.notices.map((notice) => notice.message)).toEqual([
      'Gloss label S is ambiguous and was not rewritten.',
    ]);
  });

  it('shows a saved copy relation and a suppletion on the readout', () => {
    const graph = assignSuppletion(
      assignReduplicates(
        projectUtteranceAnalysisGraph({
          id: 'unit-rel',
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
        }),
        'morph-copy',
        'morph-stem',
      ),
      'tok-went',
      'go',
    );
    const view = readAnalysisGraphView(graph);
    expect(view.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'reduplicates', source: 'wug', target: 'wug' }),
        expect.objectContaining({ kind: 'suppletes', source: 'went', target: 'go' }),
      ]),
    );
  });
});
