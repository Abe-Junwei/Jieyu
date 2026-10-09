import { getDb, withTransaction, type LayerDocType } from '../db';
import { syncLayerToTier } from './TierBridgeService';
import { readOtherDocumentLayerIds } from './annotationDocumentService';

/** 第 5 批：`allDocuments` 才列出项目所有文稿的层 | Batch 5: `allDocuments` lists every document's layers */
export type ProjectLayerListOptions = { allDocuments?: boolean };

export async function listDistinctProjectLanguageIds(): Promise<string[]> {
  const db = await getDb();
  const docs = await db.collections.layers.find().exec();
  const seen = new Set<string>();
  docs.forEach((doc) => {
    const languageId = doc.toJSON().languageId?.trim().toLowerCase();
    if (languageId) {
      seen.add(languageId);
    }
  });
  return Array.from(seen).sort();
}

export async function getTranslationLayers(
  layerType?: LayerDocType['layerType'],
  textId?: string,
  options?: ProjectLayerListOptions,
): Promise<LayerDocType[]> {
  const db = await getDb();
  if (textId) {
    // 第 5 批：按项目列层时默认只给当前文稿的层 | Batch 5: per-project lists default to the current document
    const [docs, otherDocumentLayerIds] = await Promise.all([
      db.collections.layers.findByIndex('textId', textId),
      options?.allDocuments === true ? new Set<string>() : readOtherDocumentLayerIds(db, textId),
    ]);
    const layers = docs
      .map((doc) => doc.toJSON())
      .filter((layer) => !otherDocumentLayerIds.has(layer.id));
    return layerType ? layers.filter((l) => l.layerType === layerType) : layers;
  }
  if (layerType) {
    const docs = await db.collections.layers.findByIndex('layerType', layerType);
    return docs.map((doc) => doc.toJSON());
  }
  const docs = await db.collections.layers.find().exec();
  return docs.map((doc) => doc.toJSON());
}

export async function saveTranslationLayer(data: LayerDocType): Promise<string> {
  const db = await getDb();
  const doc = await db.collections.layers.insert(data);
  return doc.primary;
}

/**
 * 协同远端 upsert：按 id 覆盖层并同步 tier 索引，整体一个事务（N5）。
 * 覆盖用 `put` 而不是先删再插，所以项目归属由 DBCore 归属中间件把关：已有层属于别的项目时
 * 抛 `JieyuOwnershipImmutabilityError` 并回滚。
 * Inbound collaboration upsert: overwrite the layer by id and sync the tier index in one
 * transaction (N5). Overwriting with `put` (not delete + insert) lets the ownership middleware
 * reject a layer that belongs to another project, rolling everything back.
 */
export async function upsertLayer(data: LayerDocType): Promise<void> {
  const db = await getDb();
  await withTransaction(
    db,
    'rw',
    [db.dexie.tier_definitions, db.dexie.layer_links],
    async () => {
      await db.collections.layers.insert(data);
      await syncLayerToTier(data, data.textId, db);
    },
    { label: 'linguisticServiceLayerOps.upsertLayer' },
  );
}
