import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { addAlternativePos, selectAlternativeAnalysis } from '../../annotation/alternativeAnalysis';
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

  it.each(['role', 'targetId', 'label'] as const)(
    'rejects a concurrent same-id graph overwrite changing %s',
    async (field) => {
      const graph = projectUtteranceAnalysisGraph({
        id: 'unit-conflict',
        text: 'one two',
        tokens: [
          { id: 'one', form: 'one', pos: 'N' },
          { id: 'two', form: 'two' },
        ],
      });
      let stored: LayerUnitDocType = {
        id: 'unit-conflict',
        textId: 'text-conflict',
        startTime: 0,
        endTime: 1,
        createdAt: '',
        updatedAt: '',
      };
      await expect(
        saveAnnotationUnitAnalysisGraph(
          {
            textId: 'text-conflict',
            unitId: stored.id,
            graph,
          },
          {
            listByTextId: async () => [stored],
            saveBatch: async (items) => {
              stored = structuredClone(items[0]!);
              const overwritten = stored.analysisGraph!;
              if (field === 'label') overwritten.nodes[0]!.label = 'overwritten';
              else if (field === 'role') overwritten.relations[0]!.role = 'rejected';
              else overwritten.relations[0]!.targetId = 'two';
            },
          },
        ),
      ).rejects.toThrow('analysisGraph readback mismatch');
    },
  );

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

  it('reads back selected candidates and relation fields through Dexie', async () => {
    const unitId = 'unit-choice';
    await LinguisticService.units.saveBatch([
      {
        id: unitId,
        textId: 'text-choice',
        startTime: 0,
        endTime: 1,
        transcription: { default: 'run' },
        createdAt: '',
        updatedAt: '',
      },
    ]);
    const choices = addAlternativePos(
      projectUtteranceAnalysisGraph({
        id: unitId,
        text: 'run',
        tokens: [{ id: 'token-choice', form: 'run', pos: 'N' }],
      }),
      'token-choice',
      'VERB',
    );
    const alternative = choices.relations.find(
      (relation) => relation.type === 'alternativeAnalysis' && relation.role === 'pending',
    )!;
    const selected = selectAlternativeAnalysis(choices, alternative.id);
    await saveAnnotationUnitAnalysisGraph({ textId: 'text-choice', unitId, graph: selected });
    const stored = (await LinguisticService.units.listByTextId('text-choice'))[0]!.analysisGraph!;
    expect(stored.nodes).toEqual(selected.nodes);
    expect(stored.relations).toEqual(selected.relations);
    expect(stored.relations.find((relation) => relation.id === alternative.id)?.role).toBe(
      'accepted',
    );
    expect(
      stored.relations
        .filter((relation) => relation.type === 'alternativeAnalysis')
        .map((relation) => relation.role)
        .sort(),
    ).toEqual(['accepted', 'rejected']);
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
    expect(stored?.analysisGraph).toEqual(graph);
    expect(stored?.transcription?.default).toBe('take a walk');
    expect(stored?.startTime).toBe(1.5);
    expect(stored?.endTime).toBe(3);
  });
});
