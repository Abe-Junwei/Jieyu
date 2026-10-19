import Dexie from 'dexie';
import type { JieyuDatabase } from './engine';
import { StorageReadbackError } from './storageReadbackError';
import type { CollectionAdapter, JieyuCollections } from './types';

function stillInsideCallerTransaction(): boolean {
  return Dexie.currentTransaction != null;
}

function collectionById(database: JieyuDatabase, collection: keyof JieyuCollections) {
  return database.collections[collection] as unknown as CollectionAdapter<{ id: string }>;
}

/** Read a row back after a top-level write. Nested Dexie transactions skip this. */
export async function readBackCollectionId(
  database: JieyuDatabase,
  collection: keyof JieyuCollections,
  id: string,
  operation: string,
): Promise<void> {
  if (stillInsideCallerTransaction()) return;
  const row = await collectionById(database, collection).findOne({ selector: { id } }).exec();
  if (!row || row.id !== id) throw new StorageReadbackError(operation);
}

export async function readBackCollectionIds(
  database: JieyuDatabase,
  collection: keyof JieyuCollections,
  ids: readonly string[],
  operation: string,
): Promise<void> {
  if (stillInsideCallerTransaction()) return;
  const adapter = collectionById(database, collection);
  for (const id of ids) {
    const row = await adapter.findOne({ selector: { id } }).exec();
    if (!row || row.id !== id) throw new StorageReadbackError(operation);
  }
}

export async function readBackCollectionGone(
  database: JieyuDatabase,
  collection: keyof JieyuCollections,
  id: string,
  operation: string,
): Promise<void> {
  if (stillInsideCallerTransaction()) return;
  const row = await collectionById(database, collection).findOne({ selector: { id } }).exec();
  if (row) throw new StorageReadbackError(operation);
}

export async function readBackDexieId(
  operation: string,
  id: string,
  read: () => Promise<{ id: string } | undefined>,
): Promise<void> {
  if (stillInsideCallerTransaction()) return;
  const row = await read();
  if (!row || row.id !== id) throw new StorageReadbackError(operation);
}

export async function readBackDexieGone(
  operation: string,
  read: () => Promise<unknown>,
): Promise<void> {
  if (stillInsideCallerTransaction()) return;
  const row = await read();
  if (row !== undefined && row !== null) throw new StorageReadbackError(operation);
}
