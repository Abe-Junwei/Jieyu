import { getDb } from './engine';
import { validateAiSessionMemoryDoc } from './schemas';
import { StorageReadbackError } from './storageReadbackError';
import type { AiSessionMemoryDoc } from './types';

function trimmed(id: string): string {
  return id.trim();
}

export async function readAiSessionMemory(
  conversationId: string,
): Promise<AiSessionMemoryDoc | undefined> {
  const id = trimmed(conversationId);
  if (id.length === 0) return undefined;
  const database = await getDb();
  return database.dexie.ai_session_memories.get(id);
}

export async function insertAiSessionMemory(doc: AiSessionMemoryDoc): Promise<void> {
  const conversationId = trimmed(doc.conversationId);
  if (conversationId.length === 0) throw new StorageReadbackError('insertAiSessionMemory');
  const row: AiSessionMemoryDoc = { ...doc, conversationId, id: doc.id.trim() };
  validateAiSessionMemoryDoc(row);
  const database = await getDb();
  await database.dexie.ai_session_memories.put(row);
  const stored = await database.dexie.ai_session_memories.get(conversationId);
  if (
    !stored ||
    stored.conversationId !== conversationId ||
    stored.id !== row.id ||
    stored.updatedAt !== row.updatedAt
  ) {
    throw new StorageReadbackError('insertAiSessionMemory');
  }
}

export async function deleteAiSessionMemoryByConversation(conversationId: string): Promise<void> {
  const id = trimmed(conversationId);
  if (id.length === 0) return;
  const database = await getDb();
  await database.dexie.ai_session_memories.where('conversationId').equals(id).delete();
  const stored = await database.dexie.ai_session_memories.get(id);
  if (stored) throw new StorageReadbackError('deleteAiSessionMemoryByConversation');
}
