import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getDb } from '../db';
import type { TranslationLayerDocType, TierDefinitionDocType } from '../db';
import { syncLayerToTier, syncTierToLayer, validateLayerTierConsistency } from './TierBridgeService';

const NOW = '2025-01-01T00:00:00.000Z';

function makeLayer(overrides: Partial<TranslationLayerDocType> & { id: string; key: string; languageId: string }): TranslationLayerDocType {
  return {
    textId: 'text_1',
    name: { eng: overrides.key },
    layerType: 'transcription',
    modality: 'text',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeTier(overrides: Partial<TierDefinitionDocType> & { id: string; textId: string; key: string }): TierDefinitionDocType {
  return {
    name: { eng: overrides.key },
    tierType: 'time-aligned',
    contentType: 'transcription',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

async function clearAll() {
  await Promise.all([
    db.tier_definitions.clear(),
    db.tier_annotations.clear(),
    db.layer_links.clear(),
  ]);
}

describe('TierBridgeService', () => {
  beforeEach(async () => {
    await db.open();
    await clearAll();
  });

  describe('syncLayerToTier', () => {
    it('creates a new TierDefinition when none exists', async () => {
      const layer = makeLayer({ id: 'l1', key: 'trc_cmn_abc', languageId: 'cmn' });
      await (await getDb()).collections.translation_layers.insert(layer);

      const tier = await syncLayerToTier(layer, 'text_1');

      expect(tier.key).toBe('bridge_trc_cmn_abc');
      expect(tier.tierType).toBe('time-aligned');
      expect(tier.contentType).toBe('transcription');
      expect(tier.languageId).toBe('cmn');
      expect(tier.textId).toBe('text_1');

      // Persisted in DB
      const stored = await db.tier_definitions.toArray();
      expect(stored).toHaveLength(1);
      expect(stored[0]!.key).toBe('bridge_trc_cmn_abc');
    });

    it('returns existing tier without duplicating', async () => {
      const layer = makeLayer({ id: 'l1', key: 'trc_cmn_abc', languageId: 'cmn' });
      await (await getDb()).collections.translation_layers.insert(layer);

      const tier1 = await syncLayerToTier(layer, 'text_1');
      const tier2 = await syncLayerToTier(layer, 'text_1');

      expect(tier2.id).toBe(tier1.id);
      const stored = await db.tier_definitions.toArray();
      expect(stored).toHaveLength(1);
    });

    it('updates tier when layer language changes', async () => {
      const layer = makeLayer({ id: 'l1', key: 'trc_cmn_abc', languageId: 'cmn' });
      await (await getDb()).collections.translation_layers.insert(layer);
      await syncLayerToTier(layer, 'text_1');

      const updated = { ...layer, languageId: 'yue' };
      const tier = await syncLayerToTier(updated, 'text_1');

      expect(tier.languageId).toBe('yue');
    });

    it('maps translation layer to translation contentType', async () => {
      const layer = makeLayer({ id: 'l1', key: 'trl_eng_xyz', languageId: 'eng', layerType: 'translation' });
      await (await getDb()).collections.translation_layers.insert(layer);

      const tier = await syncLayerToTier(layer, 'text_1');
      expect(tier.contentType).toBe('translation');
    });
  });

  describe('syncTierToLayer', () => {
    it('creates layer from bridge-prefixed tier', async () => {
      const tier = makeTier({ id: 't1', textId: 'text_1', key: 'bridge_trc_cmn_abc', languageId: 'cmn' });
      await db.tier_definitions.put(tier);

      const layer = await syncTierToLayer(tier);

      expect(layer).not.toBeNull();
      expect(layer!.key).toBe('trc_cmn_abc');
      expect(layer!.languageId).toBe('cmn');
    });

    it('ignores non-bridge tiers', async () => {
      const tier = makeTier({ id: 't1', textId: 'text_1', key: 'utterance', languageId: 'cmn' });
      const layer = await syncTierToLayer(tier);
      expect(layer).toBeNull();
    });

    it('returns existing layer without duplicating', async () => {
      const layer = makeLayer({ id: 'l1', key: 'trc_cmn_abc', languageId: 'cmn' });
      await (await getDb()).collections.translation_layers.insert(layer);

      const tier = makeTier({ id: 'l1', textId: 'text_1', key: 'bridge_trc_cmn_abc', languageId: 'cmn' });
      await db.tier_definitions.put(tier);

      const synced = await syncTierToLayer(tier);
      expect(synced!.id).toBe('l1');

      const stored = await (await getDb()).collections.translation_layers.find().exec();
      expect(stored).toHaveLength(1);
    });
  });

  describe('validateLayerTierConsistency', () => {
    it('does not report missing tier for layer in unified model', async () => {
      const layer = makeLayer({ id: 'l1', key: 'trc_cmn_abc', languageId: 'cmn' });
      await (await getDb()).collections.translation_layers.insert(layer);

      const issues = await validateLayerTierConsistency('text_1');
      expect(issues.some((i) => i.kind === 'missing-tier' && i.layerId === 'l1')).toBe(false);
    });

    it('does not report missing layer for bridge tier in unified model', async () => {
      const tier = makeTier({ id: 't1', textId: 'text_1', key: 'bridge_trc_cmn_abc' });
      await db.tier_definitions.put(tier);

      const issues = await validateLayerTierConsistency('text_1');
      expect(issues.some((i) => i.kind === 'missing-layer' && i.tierId === 't1')).toBe(false);
    });

    it('reports language mismatch', async () => {
      const layer = makeLayer({ id: 'l1', key: 'trc_cmn_abc', languageId: 'cmn' });
      await (await getDb()).collections.translation_layers.insert(layer);

      const tier = makeTier({ id: 't1', textId: 'text_1', key: 'bridge_trc_cmn_abc', languageId: 'yue' });
      await db.tier_definitions.put(tier);

      const issues = await validateLayerTierConsistency('text_1');
      expect(issues.some((i) => i.kind === 'mismatch')).toBe(true);
    });

    it('returns no issues when consistent', async () => {
      const layer = makeLayer({ id: 'l1', key: 'trc_cmn_abc', languageId: 'cmn' });
      await (await getDb()).collections.translation_layers.insert(layer);

      const tier = makeTier({ id: 't1', textId: 'text_1', key: 'bridge_trc_cmn_abc', languageId: 'cmn' });
      await db.tier_definitions.put(tier);

      const issues = await validateLayerTierConsistency('text_1');
      expect(issues).toHaveLength(0);
    });
  });
});
