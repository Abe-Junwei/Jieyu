import { getDb } from './engine';
import { StorageReadbackError } from './storageReadbackError';
import type { MediaItemDocType } from './types';

function trimmed(id: string): string {
  return id.trim();
}

export async function listMediaByText(textId: string): Promise<MediaItemDocType[]> {
  const id = trimmed(textId);
  if (id.length === 0) return [];
  const database = await getDb();
  return database.dexie.media_items.where('textId').equals(id).toArray();
}

export async function saveMediaItem(data: MediaItemDocType): Promise<string> {
  const id = trimmed(data.id);
  if (id.length === 0) throw new StorageReadbackError('saveMediaItem');
  const database = await getDb();
  const row: MediaItemDocType = { ...data, id };
  await database.dexie.media_items.put(row);
  const stored = await database.dexie.media_items.get(id);
  if (!stored || stored.id !== id || stored.textId !== row.textId) {
    throw new StorageReadbackError('saveMediaItem');
  }
  return stored.id;
}
