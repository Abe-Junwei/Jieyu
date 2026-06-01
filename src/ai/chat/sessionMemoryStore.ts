import { createLogger } from '../../observability/logger';
import { getDb } from '../../db';
import type { AiSessionMemory } from './chatDomain.types';
import { normalizeSessionMemory } from './sessionMemoryNormalize';

const log = createLogger('aiChatSessionMemoryStore');

const MAX_MEMORY_CACHE_ENTRIES = 32;

const memoryCache = new Map<string, AiSessionMemory>();
let activeConversationId: string | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function touchMemoryCache(conversationId: string, payload: AiSessionMemory): void {
  if (memoryCache.has(conversationId)) {
    memoryCache.delete(conversationId);
  }
  memoryCache.set(conversationId, payload);
  while (memoryCache.size > MAX_MEMORY_CACHE_ENTRIES) {
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey === undefined) break;
    memoryCache.delete(oldestKey);
  }
}

/** Binds sync load/persist to a conversation; call when `conversationId` changes (G1a). */
export function bindSessionMemoryConversation(conversationId: string | null): void {
  activeConversationId = conversationId;
}

/** Test-only: reset in-memory session memory store between cases. */
export function resetSessionMemoryStoreForTests(): void {
  memoryCache.clear();
  activeConversationId = null;
}

export async function loadSessionMemoryAsync(conversationId: string): Promise<AiSessionMemory> {
  if (typeof window === 'undefined') return {};
  const cached = memoryCache.get(conversationId);
  if (cached !== undefined) {
    touchMemoryCache(conversationId, cached);
    return cached;
  }

  try {
    const db = await getDb();
    const row = await db.collections.ai_session_memories
      .findOne({ selector: { conversationId } })
      .exec();
    if (row) {
      const payload = normalizeSessionMemory(row.toJSON().payload ?? {});
      touchMemoryCache(conversationId, payload);
      return payload;
    }
  } catch (error) {
    log.warn('Failed to load AI session memory from Dexie', {
      conversationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const empty: AiSessionMemory = {};
  touchMemoryCache(conversationId, empty);
  return empty;
}

export async function persistSessionMemoryAsync(
  conversationId: string,
  mem: AiSessionMemory,
): Promise<void> {
  if (typeof window === 'undefined') return;
  const payload = normalizeSessionMemory(mem);
  touchMemoryCache(conversationId, payload);
  try {
    const db = await getDb();
    // CollectionAdapter.insert delegates to Dexie table.put (upsert by primary key).
    await db.collections.ai_session_memories.insert({
      id: conversationId,
      conversationId,
      payload,
      updatedAt: nowIso(),
    });
  } catch (error) {
    log.warn('Failed to persist AI session memory to Dexie', {
      conversationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function loadSessionMemory(): AiSessionMemory {
  if (!activeConversationId) {
    return {};
  }
  return memoryCache.get(activeConversationId) ?? {};
}

export function persistSessionMemory(mem: AiSessionMemory): void {
  const normalized = normalizeSessionMemory(mem);
  if (!activeConversationId) {
    log.warn('persistSessionMemory called without bound conversation; skipped Dexie write');
    return;
  }
  touchMemoryCache(activeConversationId, normalized);
  void persistSessionMemoryAsync(activeConversationId, normalized);
}
