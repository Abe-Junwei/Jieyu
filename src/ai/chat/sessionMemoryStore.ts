import { createLogger } from '../../observability/logger';
import { getDb } from '../../db';
import type { AiSessionMemory } from './chatDomain.types';
import { normalizeSessionMemory } from './sessionMemoryNormalize';

const log = createLogger('aiChatSessionMemoryStore');

const AI_SESSION_MEMORY_STORAGE_KEY = 'jieyu.aiChat.sessionMemory';
/** Cross-tab: legacy localStorage migration completed (G2e). */
const LEGACY_SESSION_MEMORY_MIGRATED_KEY = 'jieyu.aiChat.sessionMemory.migrated.v1';

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

function isLegacySessionMemoryMigrationMarkedComplete(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(LEGACY_SESSION_MEMORY_MIGRATED_KEY) === '1';
}

function markLegacySessionMemoryMigrationComplete(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LEGACY_SESSION_MEMORY_MIGRATED_KEY, '1');
}

function readLegacySessionMemoryFromLocalStorage(): AiSessionMemory | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AI_SESSION_MEMORY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AiSessionMemory;
    if (!parsed || typeof parsed !== 'object') return null;
    return normalizeSessionMemory(parsed);
  } catch (error) {
    log.warn('Failed to load legacy AI session memory from localStorage', {
      storageKey: AI_SESSION_MEMORY_STORAGE_KEY,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function removeLegacySessionMemoryFromLocalStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(AI_SESSION_MEMORY_STORAGE_KEY);
  } catch {
    // best-effort
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

async function migrateLegacySessionMemoryToDexie(
  conversationId: string,
): Promise<AiSessionMemory | null> {
  if (isLegacySessionMemoryMigrationMarkedComplete()) return null;
  const legacy = readLegacySessionMemoryFromLocalStorage();
  if (!legacy) return null;
  try {
    await persistSessionMemoryAsync(conversationId, legacy);
    markLegacySessionMemoryMigrationComplete();
    removeLegacySessionMemoryFromLocalStorage();
    return legacy;
  } catch (error) {
    log.warn('Failed to migrate legacy session memory to Dexie', {
      conversationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return legacy;
  }
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

/** Returns the conversation id currently bound for sync persist (null when unbound). */
export function getBoundSessionMemoryConversationId(): string | null {
  return activeConversationId;
}

/** Test-only: reset in-memory session memory store between cases. */
export function resetSessionMemoryStoreForTests(): void {
  memoryCache.clear();
  pendingPersistByConversation.clear();
  activeConversationId = null;
  hydratedConversationId = null;
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(LEGACY_SESSION_MEMORY_MIGRATED_KEY);
  }
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

  // If a persist completed while Dexie read was in flight, honor the freshest in-memory payload.
  const inMemoryUpdated = memoryCache.get(conversationId);
  if (inMemoryUpdated !== undefined) {
    touchMemoryCache(conversationId, inMemoryUpdated);
    markConversationHydrated(conversationId);
    return inMemoryUpdated;
  }

  const migrated = await migrateLegacySessionMemoryToDexie(conversationId);
  if (migrated) {
    touchMemoryCache(conversationId, migrated);
    return migrated;
  }

  // Cross-tab: another tab may have migrated to Dexie and cleared legacy localStorage.
  try {
    const db = await getDb();
    const retryRow = await db.collections.ai_session_memories
      .findOne({ selector: { conversationId } })
      .exec();
    if (retryRow) {
      const payload = normalizeSessionMemory(retryRow.toJSON().payload ?? {});
      touchMemoryCache(conversationId, payload);
      return payload;
    }
  } catch (error) {
    log.warn('Failed to re-read AI session memory from Dexie after legacy migration', {
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
    return readLegacySessionMemoryFromLocalStorage() ?? {};
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
