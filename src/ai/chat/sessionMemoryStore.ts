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
const cacheRevisionByConversation = new Map<string, number>();
const pendingPersistByConversation = new Map<string, AiSessionMemory>();
const persistChainsByConversation = new Map<string, Promise<void>>();
let activeConversationId: string | null = null;
let hydratedConversationId: string | null = null;
/** Incremented on every bind; stale loadSessionMemoryAsync completions must not mutate hydration. */
let bindGeneration = 0;

function nowIso(): string {
  return new Date().toISOString();
}

function touchMemoryCache(conversationId: string, payload: AiSessionMemory): void {
  if (memoryCache.has(conversationId)) {
    memoryCache.delete(conversationId);
  }
  memoryCache.set(conversationId, payload);
  cacheRevisionByConversation.set(
    conversationId,
    (cacheRevisionByConversation.get(conversationId) ?? 0) + 1,
  );
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

function isLoadStillValid(conversationId: string, capturedBindGeneration: number): boolean {
  return capturedBindGeneration === bindGeneration && activeConversationId === conversationId;
}

function markConversationHydrated(conversationId: string, capturedBindGeneration: number): void {
  if (!isLoadStillValid(conversationId, capturedBindGeneration)) return;
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

function resolveLoadedMemoryPayload(
  conversationId: string,
  dexiePayload: AiSessionMemory,
  loadStartedRevision: number,
): AiSessionMemory {
  const currentRevision = cacheRevisionByConversation.get(conversationId) ?? 0;
  if (currentRevision > loadStartedRevision) {
    const inMemoryUpdated = memoryCache.get(conversationId);
    if (inMemoryUpdated !== undefined) {
      return inMemoryUpdated;
    }
  }
  touchMemoryCache(conversationId, dexiePayload);
  return dexiePayload;
}

/** Binds sync load/persist to a conversation; call when `conversationId` changes (G1a). */
export function bindSessionMemoryConversation(conversationId: string | null): void {
  if (conversationId !== activeConversationId) {
    if (activeConversationId) {
      flushPendingSessionMemoryForConversation(activeConversationId);
    }
  }
  activeConversationId = conversationId;
  bindGeneration += 1;
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
  cacheRevisionByConversation.clear();
  pendingPersistByConversation.clear();
  persistChainsByConversation.clear();
  activeConversationId = null;
  hydratedConversationId = null;
  bindGeneration = 0;
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(LEGACY_SESSION_MEMORY_MIGRATED_KEY);
  }
}

export async function loadSessionMemoryAsync(conversationId: string): Promise<AiSessionMemory> {
  if (typeof window === 'undefined') return {};
  const loadStartedRevision = cacheRevisionByConversation.get(conversationId) ?? 0;
  const capturedBindGeneration = bindGeneration;
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
      const dexiePayload = normalizeSessionMemory(row.toJSON().payload ?? {});
      if (!isLoadStillValid(conversationId, capturedBindGeneration)) {
        return memoryCache.get(conversationId) ?? dexiePayload;
      }
      const payload = resolveLoadedMemoryPayload(conversationId, dexiePayload, loadStartedRevision);
      if (!isLoadStillValid(conversationId, capturedBindGeneration)) {
        return memoryCache.get(conversationId) ?? payload;
      }
      markConversationHydrated(conversationId, capturedBindGeneration);
      return payload;
    }
  } catch (error) {
    log.warn('Failed to load AI session memory from Dexie', {
      conversationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const inMemoryUpdated = memoryCache.get(conversationId);
  if (
    inMemoryUpdated !== undefined &&
    (cacheRevisionByConversation.get(conversationId) ?? 0) > loadStartedRevision
  ) {
    if (!isLoadStillValid(conversationId, capturedBindGeneration)) {
      return inMemoryUpdated;
    }
    touchMemoryCache(conversationId, inMemoryUpdated);
    markConversationHydrated(conversationId, capturedBindGeneration);
    return inMemoryUpdated;
  }

  const migrated = await migrateLegacySessionMemoryToDexie(conversationId);
  if (migrated) {
    if (!isLoadStillValid(conversationId, capturedBindGeneration)) {
      return memoryCache.get(conversationId) ?? migrated;
    }
    touchMemoryCache(conversationId, migrated);
    markConversationHydrated(conversationId, capturedBindGeneration);
    return migrated;
  }

  try {
    const db = await getDb();
    const retryRow = await db.collections.ai_session_memories
      .findOne({ selector: { conversationId } })
      .exec();
    if (retryRow) {
      const dexiePayload = normalizeSessionMemory(retryRow.toJSON().payload ?? {});
      if (!isLoadStillValid(conversationId, capturedBindGeneration)) {
        return memoryCache.get(conversationId) ?? dexiePayload;
      }
      const payload = resolveLoadedMemoryPayload(conversationId, dexiePayload, loadStartedRevision);
      if (!isLoadStillValid(conversationId, capturedBindGeneration)) {
        return memoryCache.get(conversationId) ?? payload;
      }
      markConversationHydrated(conversationId, capturedBindGeneration);
      return payload;
    }
  } catch (error) {
    log.warn('Failed to re-read AI session memory from Dexie after legacy migration', {
      conversationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const empty: AiSessionMemory = {};
  if (!isLoadStillValid(conversationId, capturedBindGeneration)) {
    return memoryCache.get(conversationId) ?? empty;
  }
  touchMemoryCache(conversationId, empty);
  markConversationHydrated(conversationId, capturedBindGeneration);
  return empty;
}

async function writeSessionMemoryToDexie(
  conversationId: string,
  payload: AiSessionMemory,
): Promise<void> {
  const db = await getDb();
  await db.collections.ai_session_memories.insert({
    id: conversationId,
    conversationId,
    payload,
    updatedAt: nowIso(),
  });
}

export async function persistSessionMemoryAsync(
  conversationId: string,
  mem: AiSessionMemory,
): Promise<void> {
  if (typeof window === 'undefined') return;
  const payload = normalizeSessionMemory(mem);
  touchMemoryCache(conversationId, payload);

  const previous = persistChainsByConversation.get(conversationId) ?? Promise.resolve();
  const next = previous
    .catch(() => {
      // Keep the chain alive after a failed write.
    })
    .then(async () => {
      try {
        await writeSessionMemoryToDexie(conversationId, payload);
      } catch (error) {
        log.warn('Failed to persist AI session memory to Dexie', {
          conversationId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  persistChainsByConversation.set(conversationId, next);
  await next;
  if (persistChainsByConversation.get(conversationId) === next) {
    persistChainsByConversation.delete(conversationId);
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
    log.debug('persistSessionMemory called without bound conversation; skipped Dexie write');
    return;
  }
  touchMemoryCache(activeConversationId, normalized);
  if (hydratedConversationId !== activeConversationId) {
    pendingPersistByConversation.set(activeConversationId, normalized);
    return;
  }
  void persistSessionMemoryAsync(activeConversationId, normalized);
}
