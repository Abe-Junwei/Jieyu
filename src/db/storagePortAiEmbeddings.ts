import { listUnitTextsByUnits } from '../services/LayerSegmentationTextService';
import { getDb } from './engine';
import { validateEmbeddingDoc, validateMediaItemDoc } from './schemas';
import { StorageReadbackError } from './storageReadbackError';
import type { EmbeddingDoc, EmbeddingSourceType, MediaItemDocType, UserNoteDocType } from './types';

export async function listEmbeddingsByTextSourceModel(
  textId: string,
  sourceType: EmbeddingSourceType,
  modelId: string,
): Promise<EmbeddingDoc[]> {
  if (textId.length === 0) return [];
  const database = await getDb();
  return database.dexie.embeddings
    .where('[textId+sourceType+model]')
    .equals([textId, sourceType, modelId])
    .toArray();
}

export async function listEmbeddingsByIds(ids: readonly string[]): Promise<EmbeddingDoc[]> {
  if (ids.length === 0) return [];
  const database = await getDb();
  const rows = await database.dexie.embeddings.bulkGet([...ids]);
  return rows.filter((row): row is EmbeddingDoc => row != null);
}

export async function putEmbeddings(docs: readonly EmbeddingDoc[]): Promise<void> {
  if (docs.length === 0) return;
  for (const doc of docs) validateEmbeddingDoc(doc);
  const database = await getDb();
  await database.dexie.embeddings.bulkPut([...docs]);
  const stored = await database.dexie.embeddings.bulkGet(docs.map((doc) => doc.id));
  for (let index = 0; index < docs.length; index += 1) {
    const row = stored[index];
    const expected = docs[index];
    if (!row || !expected || row.id !== expected.id) {
      throw new StorageReadbackError('putEmbeddings');
    }
  }
}

export async function listUserNotesByTextId(textId: string): Promise<UserNoteDocType[]> {
  if (textId.length === 0) return [];
  const database = await getDb();
  return database.dexie.user_notes.where('textId').equals(textId).toArray();
}

export async function listUserNotesByIds(ids: readonly string[]): Promise<UserNoteDocType[]> {
  if (ids.length === 0) return [];
  const database = await getDb();
  const rows = await database.dexie.user_notes.bulkGet([...ids]);
  return rows.filter((row): row is UserNoteDocType => row != null);
}

export async function listMediaItemsByTextId(textId: string): Promise<MediaItemDocType[]> {
  const database = await getDb();
  return database.dexie.media_items.where('textId').equals(textId).toArray();
}

export async function listMediaItemsByIds(ids: readonly string[]): Promise<MediaItemDocType[]> {
  if (ids.length === 0) return [];
  const database = await getDb();
  const rows = await database.dexie.media_items.bulkGet([...ids]);
  return rows.filter((row): row is MediaItemDocType => row != null);
}

export async function putMediaItem(doc: MediaItemDocType): Promise<void> {
  validateMediaItemDoc(doc);
  const database = await getDb();
  await database.dexie.media_items.put(doc);
  const stored = await database.dexie.media_items.get(doc.id);
  if (!stored || stored.id !== doc.id) throw new StorageReadbackError('putMediaItem');
}

export async function listUnitTextsForUnitIds(
  unitIds: Iterable<string>,
): Promise<Awaited<ReturnType<typeof listUnitTextsByUnits>>> {
  const database = await getDb();
  return listUnitTextsByUnits(database, unitIds);
}
