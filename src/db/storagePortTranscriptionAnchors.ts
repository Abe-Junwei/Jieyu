import { getDb } from './engine';
import { validateAnchorDoc } from './schemas';
import { StorageReadbackError } from './storageReadbackError';
import type { AnchorDocType } from './types';

export async function putTranscriptionAnchor(anchor: AnchorDocType): Promise<AnchorDocType> {
  const id = anchor.id.trim();
  if (id.length === 0) throw new StorageReadbackError('putTranscriptionAnchor');
  const row: AnchorDocType = { ...anchor, id };
  validateAnchorDoc(row);
  const database = await getDb();
  await database.dexie.anchors.put(row);
  const stored = await database.dexie.anchors.get(id);
  if (!stored || stored.id !== id) throw new StorageReadbackError('putTranscriptionAnchor');
  return stored;
}

export async function deleteTranscriptionAnchor(id: string): Promise<void> {
  const key = id.trim();
  if (key.length === 0) throw new StorageReadbackError('deleteTranscriptionAnchor');
  const database = await getDb();
  await database.dexie.anchors.delete(key);
  const stored = await database.dexie.anchors.get(key);
  if (stored) throw new StorageReadbackError('deleteTranscriptionAnchor');
}
