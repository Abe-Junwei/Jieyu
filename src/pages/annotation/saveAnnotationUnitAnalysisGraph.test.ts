import { describe, expect, it } from 'vitest';
import { assignPartOfMwe } from '../../annotation/partOfMwe';
import { projectUtteranceAnalysisGraph } from '../../annotation/projectUtteranceAnalysisGraph';
import type { LayerUnitDocType } from '../../types/jieyuDbDocTypes';
import { saveAnnotationUnitAnalysisGraph } from './saveAnnotationUnitAnalysisGraph';

describe('saveAnnotationUnitAnalysisGraph', () => {
  it('stores the accepted graph on the unit and reads it back', async () => {
    const graph = assignPartOfMwe(
      projectUtteranceAnalysisGraph({
        id: 'unit-mwe-1',
        text: 'take a walk',
        tokens: [
          { id: 'tok-take', form: 'take' },
          { id: 'tok-a', form: 'a' },
          { id: 'tok-walk', form: 'walk' },
        ],
      }),
      ['tok-take', 'tok-a', 'tok-walk'],
    );
    const stored = new Map<string, LayerUnitDocType>();
    stored.set('unit-mwe-1', {
      id: 'unit-mwe-1',
      textId: 'text-mwe-1',
      startTime: 0,
      endTime: 1,
      transcription: { default: 'take a walk' },
      createdAt: '2026-09-29T00:00:00.000Z',
      updatedAt: '2026-09-29T00:00:00.000Z',
    });
    const readback = await saveAnnotationUnitAnalysisGraph(
      { textId: 'text-mwe-1', unitId: 'unit-mwe-1', graph },
      {
        listByTextId: async () => [...stored.values()],
        saveBatch: async (items) => {
          for (const item of items) stored.set(item.id, item);
        },
      },
    );
    expect(
      readback.analysisGraph?.relations.some((relation) => relation.type === 'partOfMwe'),
    ).toBe(true);
    expect(readback.transcription?.default).toBe('take a walk');
    expect(readback.startTime).toBe(0);
  });
});
