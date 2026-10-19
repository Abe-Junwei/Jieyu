import { getDb } from './engine';
import { validateAiSessionMemoryDoc } from './schemas';
import { StorageReadbackError } from './storageReadbackError';
import type { AiSessionMemoryDoc } from './types';

export async function readAiSessionMemory(
  conversationId: string,
): Promise<AiSessionMemoryDoc | undefined> {
  if (conversationId.length === 0) return undefined;
  const database = await getDb();
  return database.dexie.ai_session_memories.get(conversationId);
}

export async function putAiSessionMemory(doc: AiSessionMemoryDoc): Promise<void> {
  validateAiSessionMemoryDoc(doc);
  const database = await getDb();
  await database.dexie.ai_session_memories.put(doc);
  const stored = await database.dexie.ai_session_memories.get(doc.conversationId);
  if (!stored || stored.id !== doc.id) throw new StorageReadbackError('putAiSessionMemory');
}
