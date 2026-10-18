import { getDb } from './engine';
import { validateAiSourceSetDoc } from './schemas';
import { StorageReadbackError } from './storageReadbackError';
import type { AiSourceSetDoc } from './types';

export interface SourceSetCorpusIds {
  textIds: string[];
  lexemeIds: string[];
  noteIds: string[];
  mediaIds: string[];
  layerLinkIds: string[];
}

async function idList(read: () => Promise<Array<{ id: string }>>): Promise<string[]> {
  try {
    const rows = await read();
    return rows.map((row) => row.id);
  } catch {
    return [];
  }
}

export async function listAiSourceSets(): Promise<AiSourceSetDoc[]> {
  const database = await getDb();
  // shortcut(P2-3): 全局表，量小 | global table, small
  return database.dexie.ai_source_sets.toArray();
}

/** 失效检查用的成员 id。单表失败按空集，和原先各自 catch 一样。 */
export async function listSourceSetCorpusIds(): Promise<SourceSetCorpusIds> {
  const database = await getDb();
  const [textIds, lexemeIds, noteIds, mediaIds, layerLinkIds] = await Promise.all([
    idList(() => {
      // shortcut(P2-3): 全局表，量小 | global table, small
      return database.dexie.texts.toArray();
    }),
    idList(() => {
      // shortcut(P2-3): 全局表，量小 | global table, small
      return database.dexie.lexemes.toArray();
    }),
    idList(() => {
      // shortcut(P2-3): 全局表，量小 | global table, small
      return database.dexie.user_notes.toArray();
    }),
    idList(() => {
      // shortcut(P2-3): 全局表，量小 | global table, small
      return database.dexie.media_items.toArray();
    }),
    idList(() => {
      // shortcut(P2-3): 全局表，量小 | global table, small
      return database.dexie.layer_links.toArray();
    }),
  ]);
  return { textIds, lexemeIds, noteIds, mediaIds, layerLinkIds };
}

export async function putAiSourceSet(doc: AiSourceSetDoc): Promise<void> {
  const id = doc.id.trim();
  if (id.length === 0) throw new StorageReadbackError('putAiSourceSet');
  const row: AiSourceSetDoc = { ...doc, id };
  validateAiSourceSetDoc(row);
  const database = await getDb();
  await database.dexie.ai_source_sets.put(row);
  const stored = await database.dexie.ai_source_sets.get(id);
  if (
    !stored ||
    stored.id !== id ||
    stored.updatedAt !== row.updatedAt ||
    stored.status !== row.status
  ) {
    throw new StorageReadbackError('putAiSourceSet');
  }
}
