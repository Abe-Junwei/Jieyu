import { getDb } from './engine';
import { readBackCollectionGone, readBackCollectionId } from './storagePortReadback';
import { withTransaction } from './withTransaction';
import type { LayerDocType } from './types';
import { removeLayerTierBridge, syncLayerToTier } from './storagePortServiceTierBridge';
import { stampLayerDocumentId } from './storagePortServiceAnnotationDocument';

/**
 * Unified orchestration for Layer/Tier operations.
 * Stage-1 goal: centralize cross-table write paths to prevent drift.
 */
export class LayerTierUnifiedService {
  static async createLayer(layer: LayerDocType): Promise<void> {
    const db = await getDb();
    await withTransaction(
      db,
      'rw',
      [db.dexie.tier_definitions, db.dexie.layer_links, db.dexie.texts],
      async () => {
        // 2B-E：新层归属项目的默认文档 | 2B-E: a new layer belongs to the project's default document
        const stamped = await stampLayerDocumentId(db, layer);
        await db.collections.layers.insert(stamped);
        await syncLayerToTier(stamped, stamped.textId, db);
      },
    );
    await readBackCollectionId(db, 'layers', layer.id, 'createLayer');
  }

  static async updateLayer(layer: LayerDocType): Promise<void> {
    const db = await getDb();
    await withTransaction(db, 'rw', [db.dexie.tier_definitions, db.dexie.layer_links], async () => {
      await db.collections.layers.insert(layer);
      await syncLayerToTier(layer, layer.textId, db);
    });
    await readBackCollectionId(db, 'layers', layer.id, 'updateLayer');
  }

  static async deleteLayer(layer: Pick<LayerDocType, 'id' | 'textId' | 'key'>): Promise<void> {
    const db = await getDb();
    await withTransaction(db, 'rw', [db.dexie.tier_definitions, db.dexie.layer_links], async () => {
      await db.collections.layers.remove(layer.id);
      await removeLayerTierBridge(layer, db);
      // 清理关联的 layer_links，防止孤立记录 | Clean up associated layer_links to prevent orphans
      await db.collections.layer_links.removeBySelector({ layerId: layer.id });
    });
    await readBackCollectionGone(db, 'layers', layer.id, 'deleteLayer');
  }

  static async updateLayerSortOrder(
    layerId: string,
    sortOrder: number,
    existingDb?: Awaited<ReturnType<typeof getDb>>,
  ): Promise<void> {
    const db = existingDb ?? (await getDb());
    let wrote = false;
    await withTransaction(db, 'rw', [db.dexie.tier_definitions, db.dexie.layer_links], async () => {
      const layer = await db.collections.layers.findOne({ selector: { id: layerId } }).exec();
      if (!layer) return;
      const updated = {
        ...(layer.toJSON() as LayerDocType),
        sortOrder,
        updatedAt: new Date().toISOString(),
      };
      await db.collections.layers.insert(updated);
      await syncLayerToTier(updated, updated.textId, db);
      wrote = true;
    });
    if (wrote) await readBackCollectionId(db, 'layers', layerId, 'updateLayerSortOrder');
  }
}
