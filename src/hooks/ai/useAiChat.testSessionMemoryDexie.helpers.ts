import type { AiSessionMemory } from '../../ai/chat/chatDomain.types';
import { getDb } from '../../db';

export async function readDexieSessionMemory(conversationId: string): Promise<AiSessionMemory> {
  const db = await getDb();
  const row = await db.collections.ai_session_memories
    .findOne({ selector: { conversationId } })
    .exec();
  return (row?.toJSON().payload ?? {}) as AiSessionMemory;
}

/** Seed a conversation row + Dexie session memory so bootstrap + binding hydrate correctly. */
export async function seedAiChatConversationWithSessionMemory(
  memory: AiSessionMemory,
  options?: { conversationId?: string; updatedAt?: string },
): Promise<string> {
  const db = await getDb();
  const conversationId = options?.conversationId ?? `conv-test-${crypto.randomUUID()}`;
  const timestamp = options?.updatedAt ?? new Date().toISOString();
  await db.collections.ai_conversations.insert({
    id: conversationId,
    title: 'Test conversation',
    mode: 'assistant',
    providerId: 'mock',
    model: 'mock',
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await db.collections.ai_session_memories.insert({
    id: conversationId,
    conversationId,
    payload: memory,
    updatedAt: timestamp,
  });
  return conversationId;
}

export async function waitForDexieSessionMemory(
  conversationId: string,
  predicate: (memory: AiSessionMemory) => boolean,
  timeoutMs = 3000,
): Promise<AiSessionMemory> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const memory = await readDexieSessionMemory(conversationId);
    if (predicate(memory)) {
      return memory;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const last = await readDexieSessionMemory(conversationId);
  throw new Error(`Timed out waiting for Dexie session memory: ${JSON.stringify(last)}`);
}
