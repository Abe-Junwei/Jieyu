import { getDb } from './engine';
import { validateLayerLinkDoc } from './schemas';
import { StorageReadbackError } from './storageReadbackError';
import type { LayerLinkDocType } from './types';
import { LayerTierUnifiedService } from '../services/LayerTierUnifiedService';
import { listUnitTextsByUnits } from '../services/LayerSegmentationTextService';
import {
  deleteLayerSegmentGraphByLayerId,
  listUnitUnitPrimaryKeysByTextId,
} from '../services/LayerSegmentGraphService';

export async function insertTranscriptionLayerLink(
  link: LayerLinkDocType,
): Promise<LayerLinkDocType> {
  const id = link.id.trim();
  if (id.length === 0) throw new StorageReadbackError('insertTranscriptionLayerLink');
  const row: LayerLinkDocType = { ...link, id };
  validateLayerLinkDoc(row);
  const database = await getDb();
  await database.dexie.layer_links.put(row);
  const stored = await database.dexie.layer_links.get(id);
  if (!stored || stored.id !== id) throw new StorageReadbackError('insertTranscriptionLayerLink');
  return stored;
}

export async function deleteTranscriptionLayerLink(id: string): Promise<void> {
  const key = id.trim();
  if (key.length === 0) throw new StorageReadbackError('deleteTranscriptionLayerLink');
  const database = await getDb();
  await database.dexie.layer_links.delete(key);
  const stored = await database.dexie.layer_links.get(key);
  if (stored) throw new StorageReadbackError('deleteTranscriptionLayerLink');
}

export async function updateTranscriptionLayerLink(
  id: string,
  changes: Partial<LayerLinkDocType>,
): Promise<void> {
  const key = id.trim();
  if (key.length === 0) throw new StorageReadbackError('updateTranscriptionLayerLink');
  const database = await getDb();
  const existing = await database.dexie.layer_links.get(key);
  if (!existing) return;
  await database.dexie.layer_links
    .where(':id')
    .equals(key)
    .modify((row) => {
      Object.assign(row, changes);
    });
  const stored = await database.dexie.layer_links.get(key);
  if (!stored || stored.id !== key) throw new StorageReadbackError('updateTranscriptionLayerLink');
  if (changes.isPreferred !== undefined && stored.isPreferred !== changes.isPreferred) {
    throw new StorageReadbackError('updateTranscriptionLayerLink');
  }
}

/** Indexed delete matching `collections.layer_links.removeBySelector`. */
export async function deleteTranscriptionLayerLinksBySelector(selector: {
  transcriptionLayerKey?: string;
  layerId?: string;
}): Promise<number> {
  const transcriptionLayerKey = selector.transcriptionLayerKey?.trim() ?? '';
  const layerId = selector.layerId?.trim() ?? '';
  const field = transcriptionLayerKey.length > 0 ? 'transcriptionLayerKey' : 'layerId';
  const value = transcriptionLayerKey.length > 0 ? transcriptionLayerKey : layerId;
  if (value.length === 0) return 0;
  const database = await getDb();
  const ids = (await database.dexie.layer_links
    .where(field)
    .equals(value)
    .primaryKeys()) as string[];
  if (ids.length === 0) return 0;
  await database.dexie.layer_links.bulkDelete(ids);
  const leftover = await database.dexie.layer_links.bulkGet(ids);
  if (leftover.some((row) => row !== undefined)) {
    throw new StorageReadbackError('deleteTranscriptionLayerLinksBySelector');
  }
  return ids.length;
}

export async function updateTranscriptionLayerSortOrder(
  layerId: string,
  sortOrder: number,
): Promise<void> {
  const database = await getDb();
  await LayerTierUnifiedService.updateLayerSortOrder(layerId, sortOrder, database);
}

export async function listTranscriptionUnitPrimaryKeysByTextId(
  textId: string,
  layerIds: ReadonlySet<string>,
): Promise<string[]> {
  const database = await getDb();
  return listUnitUnitPrimaryKeysByTextId(database, textId, layerIds);
}

export async function deleteTranscriptionLayerSegmentGraph(layerId: string): Promise<{
  affectedUnitIds: string[];
  deletedSegmentIds: string[];
}> {
  const database = await getDb();
  return deleteLayerSegmentGraphByLayerId(database, layerId);
}

export async function listTranscriptionUnitTextsByUnits(unitIds: readonly string[]) {
  const database = await getDb();
  return listUnitTextsByUnits(database, unitIds);
}
