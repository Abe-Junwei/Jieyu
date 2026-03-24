import { getDb, type TranslationLayerDocType } from '../db';
import { removeLayerTierBridge, syncLayerToTier } from './TierBridgeService';

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
    await removeLayerTierBridge(layer);
  }

  static async updateLayerSortOrder(layerId: string, sortOrder: number): Promise<void> {
    const db = await getDb();
    const layer = await db.collections.translation_layers.findOne({ selector: { id: layerId } }).exec();
    if (!layer) return;
    const updated = {
      ...layer.toJSON() as TranslationLayerDocType,
      sortOrder,
      updatedAt: new Date().toISOString(),
    };
    await db.collections.translation_layers.insert(updated);
    await syncLayerToTier(updated, updated.textId);
  }
}
