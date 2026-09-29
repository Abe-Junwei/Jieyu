import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { assignPartOfMwe } from '../../annotation/partOfMwe';
import { projectUtteranceAnalysisGraph } from '../../annotation/projectUtteranceAnalysisGraph';
import { db } from '../../db';
import { LinguisticService } from '../../services/LinguisticService';
import type { LayerUnitDocType } from '../../types/jieyuDbDocTypes';
import { saveAnnotationUnitAnalysisGraph } from './saveAnnotationUnitAnalysisGraph';

describe('saveAnnotationUnitAnalysisGraph', () => {
  beforeEach(async () => {
    await Promise.all([
      db.layer_units.clear(),
      db.layer_unit_contents.clear(),
      db.tier_definitions.clear(),
    ]);
  });

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

  it('persists the multiword graph through Dexie without changing the transcription', async () => {
    const now = '2026-09-29T00:00:00.000Z';
    await LinguisticService.layers.saveTranslation({
      id: 'lane-mwe-1',
      textId: 'text-mwe-dexie',
      key: 'lane-mwe-1',
      name: { default: 'lane' },
      languageId: 'und',
      modality: 'text',
      createdAt: now,
      updatedAt: now,
      layerType: 'transcription',
    });
    await LinguisticService.units.saveBatch([
      {
        id: 'unit-mwe-dexie',
        textId: 'text-mwe-dexie',
        mediaId: 'media-mwe-1',
        unitType: 'unit',
        startTime: 1.5,
        endTime: 3,
        transcription: { default: 'take a walk' },
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const graph = assignPartOfMwe(
      projectUtteranceAnalysisGraph({
        id: 'unit-mwe-dexie',
        text: 'take a walk',
        tokens: [
          { id: 'tok-take', form: 'take' },
          { id: 'tok-a', form: 'a' },
          { id: 'tok-walk', form: 'walk' },
        ],
      }),
      ['tok-take', 'tok-a', 'tok-walk'],
    );

    await saveAnnotationUnitAnalysisGraph({
      textId: 'text-mwe-dexie',
      unitId: 'unit-mwe-dexie',
      graph,
    });

    const requery = await LinguisticService.units.listByTextId('text-mwe-dexie');
    const stored = requery.find((unit) => unit.id === 'unit-mwe-dexie');
    expect(stored?.analysisGraph?.relations.some((relation) => relation.type === 'partOfMwe')).toBe(
      true,
    );
    expect(stored?.analysisGraph?.nodes.find((node) => node.type === 'mwe')?.label).toBe(
      'take a walk',
    );
    expect(stored?.transcription?.default).toBe('take a walk');
    expect(stored?.startTime).toBe(1.5);
    expect(stored?.endTime).toBe(3);
  });
});
