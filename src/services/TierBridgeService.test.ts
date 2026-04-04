import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getDb } from '../db';
import { syncLayerToTier, syncTierToLayer, validateLayerTierConsistency } from './TierBridgeService';

const NOW = '2026-04-04T00:00:00.000Z';

describe('TierBridgeService bridge synchronization', () => {
  beforeEach(async () => {
    await db.open();
    const database = await getDb();
    await Promise.all([
      db.texts.clear(),
      database.collections.layers.removeBySelector({}),
      db.tier_definitions.clear(),
      db.user_notes.clear(),
    ]);
  });

  it('clears stale orthography/bridge fields on tier when layer omits them', async () => {
    const database = await getDb();
    await database.collections.tier_definitions.insert({
      id: 'layer_sync',
      textId: 'text_sync',
      key: 'bridge_trc_sync',
      name: { default: 'Layer Sync' },
      tierType: 'time-aligned',
      contentType: 'transcription',
      languageId: 'ara',
      orthographyId: 'ortho-ar',
      bridgeId: 'xf-legacy',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const updatedTier = await syncLayerToTier({
      id: 'layer_sync',
      textId: 'text_sync',
      key: 'trc_sync',
      name: { default: 'Layer Sync' },
      layerType: 'transcription',
      languageId: 'ara',
      modality: 'text',
      createdAt: NOW,
      updatedAt: NOW,
    }, 'text_sync');

    expect(updatedTier.orthographyId).toBeUndefined();
    expect(updatedTier.bridgeId).toBeUndefined();

    const storedTier = await db.tier_definitions.get('layer_sync');
    expect(storedTier?.orthographyId).toBeUndefined();
    expect(storedTier?.bridgeId).toBeUndefined();
  });

  it('clears stale orthography/bridge fields on layer when tier omits them', async () => {
    const database = await getDb();
    await database.collections.layers.insert({
      id: 'layer_sync',
      textId: 'text_sync',
      key: 'trc_sync',
      name: { default: 'Layer Sync' },
      layerType: 'transcription',
      languageId: 'ara',
      orthographyId: 'ortho-ar',
      bridgeId: 'xf-legacy',
      modality: 'text',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const updatedLayer = await syncTierToLayer({
      id: 'layer_sync',
      textId: 'text_sync',
      key: 'bridge_trc_sync',
      name: { default: 'Layer Sync' },
      tierType: 'time-aligned',
      contentType: 'transcription',
      languageId: 'ara',
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(updatedLayer?.orthographyId).toBeUndefined();
    expect(updatedLayer?.bridgeId).toBeUndefined();

    const storedLayer = await database.collections.layers.findOne({ selector: { id: 'layer_sync' } }).exec();
    expect(storedLayer?.toJSON().orthographyId).toBeUndefined();
    expect(storedLayer?.toJSON().bridgeId).toBeUndefined();
  });

  it('reports bridge mismatch when layer and tier bridge ids diverge', async () => {
    const database = await getDb();
    await database.collections.layers.insert({
      id: 'layer_check',
      textId: 'text_check',
      key: 'trc_check',
      name: { default: 'Layer Check' },
      layerType: 'transcription',
      languageId: 'ara',
      orthographyId: 'ortho-ar',
      bridgeId: 'xf-layer',
      modality: 'text',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await database.collections.tier_definitions.insert({
      id: 'tier_check',
      textId: 'text_check',
      key: 'bridge_trc_check',
      name: { default: 'Layer Check' },
      tierType: 'time-aligned',
      contentType: 'transcription',
      languageId: 'ara',
      orthographyId: 'ortho-ar',
      bridgeId: 'xf-tier',
      createdAt: NOW,
      updatedAt: NOW,
    });

    await expect(validateLayerTierConsistency('text_check')).resolves.toEqual([
      expect.objectContaining({
        kind: 'mismatch',
        layerId: 'layer_check',
        message: 'Bridge mismatch: layer="xf-layer", tier="xf-tier".',
      }),
    ]);
  });
});