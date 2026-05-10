import { getDb, type LayerDocType } from '../db';
import { syncLayerToTier } from './TierBridgeService';

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
): Promise<LayerDocType[]> {
  const db = await getDb();
  if (textId) {
    const docs = await db.collections.layers.findByIndex('textId', textId);
    const layers = docs.map((doc) => doc.toJSON());
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

/** 协同远端 upsert：按 id 替换层并同步 tier 索引 | Replace layer by id for inbound collaboration */
export async function upsertLayer(data: LayerDocType): Promise<void> {
  const db = await getDb();
  if (data.id) {
    const existingDoc = await db.collections.layers.findOne({ selector: { id: data.id } }).exec();
    if (existingDoc) {
      await db.collections.layers.remove(data.id);
    }
  }
  await db.collections.layers.insert(data);
  await syncLayerToTier(data, data.textId);
}
