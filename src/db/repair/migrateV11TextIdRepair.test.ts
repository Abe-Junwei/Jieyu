import { describe, expect, it } from 'vitest';
import type { LayerUnitContentDocType, LayerUnitDocType, TierDefinitionDocType } from '../types';
import { repairTranslationTierTextIdsFromLayerContents } from './migrateV11TextIdRepair';

function tier(partial: Partial<TierDefinitionDocType> & Pick<TierDefinitionDocType, 'id' | 'textId' | 'key'>): TierDefinitionDocType {
  return {
    tierType: 'time-aligned',
    contentType: 'translation',
    name: { default: 'T' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('migrateV11TextIdRepair', () => {
  it('sets translation tier textId from majority of layer_unit_contents hosts', async () => {
    const tiers: TierDefinitionDocType[] = [
      tier({
        id: 'tier-tr',
        textId: 'wrong-text',
        key: 'bridge_tr_default',
      }),
    ];
    const layer_units: LayerUnitDocType[] = [
      {
        id: 'u-host',
        textId: 'correct-text',
        layerId: 'tier-trc',
        unitType: 'unit',
        startTime: 0,
        endTime: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const layer_unit_contents: LayerUnitContentDocType[] = [
      {
        id: 'c1',
        unitId: 'u-host',
        layerId: 'tier-tr',
        text: 'hello',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    const puts: TierDefinitionDocType[] = [];

    const result = await repairTranslationTierTextIdsFromLayerContents({
      tier_definitions: {
        filter: (fn) => ({
          toArray: async () => tiers.filter(fn),
        }),
        put: async (row) => {
          puts.push(row);
          const idx = tiers.findIndex((t) => t.id === row.id);
          if (idx >= 0) tiers[idx] = row;
        },
      },
      layer_units: { toArray: async () => layer_units },
      layer_unit_contents: { toArray: async () => layer_unit_contents },
    });

    expect(result.tiersUpdated).toBe(1);
    expect(result.changes).toEqual([{ tierId: 'tier-tr', from: 'wrong-text', to: 'correct-text' }]);
    expect(puts[0]?.textId).toBe('correct-text');
  });

  it('is a no-op when tier textId already matches content-derived majority', async () => {
    const tiers: TierDefinitionDocType[] = [
      tier({
        id: 'tier-tr',
        textId: 'text-a',
        key: 'bridge_tr_a',
      }),
    ];
    const layer_units: LayerUnitDocType[] = [
      {
        id: 'u1',
        textId: 'text-a',
        unitType: 'unit',
        startTime: 0,
        endTime: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const layer_unit_contents: LayerUnitContentDocType[] = [
      {
        id: 'c1',
        unitId: 'u1',
        layerId: 'tier-tr',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    const result = await repairTranslationTierTextIdsFromLayerContents({
      tier_definitions: {
        filter: (fn) => ({ toArray: async () => tiers.filter(fn) }),
        put: async () => undefined,
      },
      layer_units: { toArray: async () => layer_units },
      layer_unit_contents: { toArray: async () => layer_unit_contents },
    });

    expect(result.tiersUpdated).toBe(0);
    expect(result.changes).toHaveLength(0);
  });
});
