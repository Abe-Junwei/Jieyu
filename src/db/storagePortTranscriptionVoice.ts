import { getDb } from './engine';
import { validateLayerUnitContentDoc, validateMediaItemDoc } from './schemas';
import { StorageReadbackError } from './storageReadbackError';
import type { LayerUnitContentDocType, MediaItemDocType } from './types';

export async function listTranscriptionContentsByUnitId(
  unitId: string,
): Promise<LayerUnitContentDocType[]> {
  const id = unitId.trim();
  if (id.length === 0) return [];
  const database = await getDb();
  return database.dexie.layer_unit_contents.where('unitId').equals(id).toArray();
}

export async function insertTranscriptionMediaItem(media: MediaItemDocType): Promise<void> {
  const id = media.id.trim();
  if (id.length === 0) throw new StorageReadbackError('insertTranscriptionMediaItem');
  const row: MediaItemDocType = { ...media, id };
  validateMediaItemDoc(row);
  const database = await getDb();
  await database.dexie.media_items.put(row);
  const stored = await database.dexie.media_items.get(id);
  if (!stored || stored.id !== id || stored.textId !== row.textId) {
    throw new StorageReadbackError('insertTranscriptionMediaItem');
  }
}

export async function deleteTranscriptionMediaItem(id: string): Promise<void> {
  const key = id.trim();
  if (key.length === 0) throw new StorageReadbackError('deleteTranscriptionMediaItem');
  const database = await getDb();
  await database.dexie.media_items.delete(key);
  const stored = await database.dexie.media_items.get(key);
  if (stored) throw new StorageReadbackError('deleteTranscriptionMediaItem');
}

export async function putTranscriptionLayerUnitContent(
  content: LayerUnitContentDocType,
): Promise<void> {
  const id = content.id.trim();
  if (id.length === 0) throw new StorageReadbackError('putTranscriptionLayerUnitContent');
  const row: LayerUnitContentDocType = { ...content, id };
  validateLayerUnitContentDoc(row);
  const database = await getDb();
  await database.dexie.layer_unit_contents.put(row);
  const stored = await database.dexie.layer_unit_contents.get(id);
  if (!stored || stored.id !== id)
    throw new StorageReadbackError('putTranscriptionLayerUnitContent');
}

export async function deleteTranscriptionLayerUnitContent(id: string): Promise<void> {
  const key = id.trim();
  if (key.length === 0) throw new StorageReadbackError('deleteTranscriptionLayerUnitContent');
  const database = await getDb();
  await database.dexie.layer_unit_contents.delete(key);
  const stored = await database.dexie.layer_unit_contents.get(key);
  if (stored) throw new StorageReadbackError('deleteTranscriptionLayerUnitContent');
}
