import { getDb } from './engine';
import { validateAiConversationDoc } from './schemas';
import { StorageReadbackError } from './storageReadbackError';
import type { AiConversationDoc } from './types';
import { withTransaction } from './withTransaction';

function rethrowStorageReadback(error: unknown): never {
  if (error instanceof StorageReadbackError) throw error;
  if (error instanceof Error && error.cause instanceof StorageReadbackError) throw error.cause;
  throw error;
}

function trimmed(id: string): string {
  return id.trim();
}

export type AiConversationFieldPatch = Partial<
  Pick<
    AiConversationDoc,
    'title' | 'providerId' | 'model' | 'updatedAt' | 'clearedAt' | 'archived' | 'textId'
  >
>;

function conversationReadbackMatches(
  stored: AiConversationDoc,
  id: string,
  patch: AiConversationFieldPatch,
): boolean {
  if (stored.id !== id) return false;
  if (patch.title !== undefined && stored.title !== patch.title) return false;
  if (patch.providerId !== undefined && stored.providerId !== patch.providerId) return false;
  if (patch.model !== undefined && stored.model !== patch.model) return false;
  if (patch.updatedAt !== undefined && stored.updatedAt !== patch.updatedAt) return false;
  if (patch.clearedAt !== undefined && stored.clearedAt !== patch.clearedAt) return false;
  if (patch.archived !== undefined && stored.archived !== patch.archived) return false;
  if (patch.textId !== undefined && stored.textId !== patch.textId) return false;
  return true;
}

export async function readAiConversation(id: string): Promise<AiConversationDoc | undefined> {
  const key = trimmed(id);
  if (key.length === 0) return undefined;
  const database = await getDb();
  return database.dexie.ai_conversations.get(key);
}

export async function insertAiConversation(doc: AiConversationDoc): Promise<void> {
  const id = trimmed(doc.id);
  if (id.length === 0) throw new StorageReadbackError('insertAiConversation');
  const row: AiConversationDoc = { ...doc, id };
  validateAiConversationDoc(row);
  const database = await getDb();
  await database.dexie.ai_conversations.put(row);
  const stored = await database.dexie.ai_conversations.get(id);
  if (!stored || !conversationReadbackMatches(stored, id, row)) {
    throw new StorageReadbackError('insertAiConversation');
  }
}

export async function patchAiConversation(
  id: string,
  patch: AiConversationFieldPatch,
): Promise<AiConversationDoc | undefined> {
  const key = trimmed(id);
  if (key.length === 0) return undefined;
  const database = await getDb();
  try {
    return await withTransaction(
      database,
      'rw',
      [database.dexie.ai_conversations],
      async () => {
        const current = await database.dexie.ai_conversations.get(key);
        if (!current) return undefined;
        const next: AiConversationDoc = { ...current, ...patch, id: key };
        validateAiConversationDoc(next);
        await database.dexie.ai_conversations.put(next);
        const stored = await database.dexie.ai_conversations.get(key);
        if (!stored || !conversationReadbackMatches(stored, key, patch)) {
          throw new StorageReadbackError('patchAiConversation');
        }
        return stored;
      },
      { label: 'patchAiConversation' },
    );
  } catch (error) {
    rethrowStorageReadback(error);
  }
}

export async function deleteAiConversation(id: string): Promise<void> {
  const key = trimmed(id);
  if (key.length === 0) return;
  const database = await getDb();
  await database.dexie.ai_conversations.delete(key);
  const stored = await database.dexie.ai_conversations.get(key);
  if (stored) throw new StorageReadbackError('deleteAiConversation');
}
