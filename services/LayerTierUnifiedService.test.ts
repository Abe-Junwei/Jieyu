import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getDb, type TranslationLayerDocType } from '../db';
import { LayerTierUnifiedService } from './LayerTierUnifiedService';

const NOW = '2026-03-16T00:00:00.000Z';

function makeLayer(overrides: Partial<TranslationLayerDocType> & { id: string; key: string; textId: string }): TranslationLayerDocType {
  return {
    name: { zho: overrides.key },
    layerType: 'transcription',
    languageId: 'cmn',
    modality: 'text',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

async function clearAll() {
  await Promise.all([
    db.tier_definitions.clear(),
  ]);
}

describe('LayerTierUnifiedService', () => {
  beforeEach(async () => {
    await db.open();
    await clearAll();
  });

  it('creates layer and bridge tier together', async () => {
    const layer = makeLayer({ id: 'layer_1', key: 'trc_cmn_demo', textId: 'text_1' });

    await LayerTierUnifiedService.createLayer(layer);

    const layers = await (await getDb()).collections.translation_layers.find().exec();
    const tiers = await db.tier_definitions.toArray();

    expect(layers).toHaveLength(1);
    expect(tiers).toHaveLength(1);
    expect(tiers[0]!.key).toBe('bridge_trc_cmn_demo');
    expect(tiers[0]!.textId).toBe('text_1');
  });

  it('deletes layer and corresponding bridge tier together', async () => {
    const layer = makeLayer({ id: 'layer_2', key: 'trl_eng_demo', textId: 'text_9', layerType: 'translation' });
    await LayerTierUnifiedService.createLayer(layer);

    await LayerTierUnifiedService.deleteLayer(layer);

    const layers = await (await getDb()).collections.translation_layers.find().exec();
    const tiers = await db.tier_definitions.toArray();

    expect(layers).toHaveLength(0);
    expect(tiers).toHaveLength(0);
  });
});
