import { getDb, type TranslationLayerDocType } from '../db';
import { syncLayerToTier } from './TierBridgeService';

const BRIDGE_KEY_PREFIX = 'bridge_';

/**
 * Unified orchestration for Layer/Tier operations.
 * Stage-1 goal: centralize cross-table write paths to prevent drift.
 */
export class LayerTierUnifiedService {
  static async createLayer(layer: TranslationLayerDocType): Promise<void> {
    const db = await getDb();
    await db.collections.translation_layers.insert(layer);
    await syncLayerToTier(layer, layer.textId);
  }

  static async deleteLayer(layer: Pick<TranslationLayerDocType, 'id' | 'textId' | 'key'>): Promise<void> {
    const db = await getDb();
    await db.collections.translation_layers.remove(layer.id);

    const bridgeKey = `${BRIDGE_KEY_PREFIX}${layer.key}`;
    await db.collections.tier_definitions.removeBySelector({
      textId: layer.textId,
      key: bridgeKey,
    } as any);
  }
}
