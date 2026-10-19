import { getDb } from './engine';
import { validateAiConversationDoc } from './schemas';
import { StorageReadbackError } from './storageReadbackError';
import type { AiConversationDoc } from './types';
import { withTransaction } from './withTransaction';

export interface AiConversationPatch {
  title?: string;
  updatedAt?: string;
}

export async function listRecentAiConversations(limit: number): Promise<AiConversationDoc[]> {
  const capped = Math.max(0, Math.floor(limit));
  if (capped === 0) return [];
  const database = await getDb();
  return database.dexie.ai_conversations.orderBy('updatedAt').reverse().limit(capped).toArray();
}

export async function readAiConversation(id: string): Promise<AiConversationDoc | undefined> {
  const key = id.trim();
  if (key.length === 0) return undefined;
  const database = await getDb();
  return database.dexie.ai_conversations.get(key);
}

export async function patchAiConversation(
  id: string,
  patch: AiConversationPatch,
): Promise<AiConversationDoc | undefined> {
  const key = id.trim();
  if (key.length === 0) return undefined;
  const database = await getDb();
  const current = await database.dexie.ai_conversations.get(key);
  if (!current) return undefined;
  const next: AiConversationDoc = {
    ...current,
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.updatedAt !== undefined ? { updatedAt: patch.updatedAt } : {}),
  };
  validateAiConversationDoc(next);
  await database.dexie.ai_conversations.put(next);
  const stored = await database.dexie.ai_conversations.get(key);
  if (
    !stored ||
    stored.id !== key ||
    stored.title !== next.title ||
    stored.updatedAt !== next.updatedAt
  ) {
    throw new StorageReadbackError('patchAiConversation');
  }
  return stored;
}

/** 删掉这个会话的消息；会话行还在时只改 updatedAt。消息删不干净就抛错。 */
export async function clearAiConversationMessages(
  conversationId: string,
  updatedAt: string,
): Promise<boolean> {
  const id = conversationId.trim();
  if (id.length === 0) return false;
  const database = await getDb();
  const current = await database.dexie.ai_conversations.get(id);
  await withTransaction(
    database,
    'rw',
    [database.dexie.ai_messages, database.dexie.ai_conversations],
    async () => {
      await database.dexie.ai_messages.where('conversationId').equals(id).delete();
      if (!current) return;
      const next: AiConversationDoc = { ...current, updatedAt };
      validateAiConversationDoc(next);
      await database.dexie.ai_conversations.put(next);
    },
    { label: 'clearAiConversationMessages' },
  );
  const remaining = await database.dexie.ai_messages.where('conversationId').equals(id).count();
  if (remaining !== 0) throw new StorageReadbackError('clearAiConversationMessages');
  if (!current) return false;
  const stored = await database.dexie.ai_conversations.get(id);
  if (!stored || stored.updatedAt !== updatedAt) {
    throw new StorageReadbackError('clearAiConversationMessages');
  }
  return true;
}
