import { createLogger } from '../../observability/logger';
import { getDb } from '../../db';
import type { AiSessionMemory } from './chatDomain.types';
import { normalizeSessionMemory } from './sessionMemoryNormalize';

const log = createLogger('aiChatSessionMemoryStore');

const MAX_MEMORY_CACHE_ENTRIES = 32;

const memoryCache = new Map<string, AiSessionMemory>();
const pendingPersistByConversation = new Map<string, AiSessionMemory>();
let activeConversationId: string | null = null;
let hydratedConversationId: string | null = null;

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

async function readSessionMemoryBaselineFromDexie(
  conversationId: string,
): Promise<AiSessionMemory> {
  try {
    const db = await getDb();
    const row = await db.collections.ai_session_memories
      .findOne({ selector: { conversationId } })
      .exec();
    if (row) {
      return normalizeSessionMemory(row.toJSON().payload ?? {});
    }
  } catch (error) {
    log.warn('Failed to read session memory baseline for pending flush', {
      conversationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return {};
}

async function flushPendingSessionMemoryForConversationAsync(
  conversationId: string,
): Promise<void> {
  const pending = pendingPersistByConversation.get(conversationId);
  if (pending === undefined) return;
  pendingPersistByConversation.delete(conversationId);

  const baseline =
    hydratedConversationId === conversationId
      ? (memoryCache.get(conversationId) ?? {})
      : await readSessionMemoryBaselineFromDexie(conversationId);

  await persistSessionMemoryAsync(
    conversationId,
    normalizeSessionMemory({ ...baseline, ...pending }),
  );
}

function flushPendingSessionMemoryForConversation(conversationId: string): void {
  if (!pendingPersistByConversation.has(conversationId)) return;
  void flushPendingSessionMemoryForConversationAsync(conversationId);
}

function markConversationHydrated(conversationId: string): void {
  hydratedConversationId = conversationId;
  const pending = pendingPersistByConversation.get(conversationId);
  if (pending === undefined) return;
  pendingPersistByConversation.delete(conversationId);
  const baseline = memoryCache.get(conversationId) ?? {};
  void persistSessionMemoryAsync(
    conversationId,
    normalizeSessionMemory({ ...baseline, ...pending }),
  );
}

/** Binds sync load/persist to a conversation; call when `conversationId` changes (G1a). */
export function bindSessionMemoryConversation(conversationId: string | null): void {
  if (conversationId !== activeConversationId) {
    if (activeConversationId) {
      flushPendingSessionMemoryForConversation(activeConversationId);
    }
  }
  activeConversationId = conversationId;
  if (conversationId !== hydratedConversationId) {
    hydratedConversationId = null;
  }
}

/** Test-only: reset in-memory session memory store between cases. */
export function resetSessionMemoryStoreForTests(): void {
  memoryCache.clear();
  pendingPersistByConversation.clear();
  activeConversationId = null;
  hydratedConversationId = null;
}

export async function loadSessionMemoryAsync(conversationId: string): Promise<AiSessionMemory> {
  if (typeof window === 'undefined') return {};
  if (hydratedConversationId === conversationId) {
    const cached = memoryCache.get(conversationId);
    if (cached !== undefined) {
      touchMemoryCache(conversationId, cached);
      return cached;
    }
  }

  try {
    const db = await getDb();
    const row = await db.collections.ai_session_memories
      .findOne({ selector: { conversationId } })
      .exec();
    if (row) {
      const payload = normalizeSessionMemory(row.toJSON().payload ?? {});
      touchMemoryCache(conversationId, payload);
      markConversationHydrated(conversationId);
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
  markConversationHydrated(conversationId);
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
  if (hydratedConversationId !== activeConversationId) {
    pendingPersistByConversation.set(activeConversationId, normalized);
    return;
  }
  void persistSessionMemoryAsync(activeConversationId, normalized);
}
