import { createLogger } from '../../observability/logger';
import { detectLocale } from '../../i18n';
import { getAppDataResilienceMessages } from '../../i18n/appDataResilienceMessages';
import { dispatchAppGlobalToast } from '../../utils/appGlobalToast';
import type { CollaborationProjectChangeRecord } from './syncTypes';
import { loadCollabClientStateBlobFromIdb, saveCollabClientStateBlobToIdb } from './CollaborationClientStateStore.idb';

const log = createLogger('CollaborationClientStateStore');

let lastCollabQuotaToastAt = 0;
const COLLAB_QUOTA_TOAST_COOLDOWN_MS = 90_000;

const COLLAB_CLIENT_STATE_STORAGE_KEY = 'jieyu:collab-client-state:v1';

interface CollaborationClientProjectState {
  lastSeenRevision?: number;
  pendingOutboundChanges?: CollaborationProjectChangeRecord[];
  updatedAt: string;
}

type CollaborationClientStateMap = Record<string, CollaborationClientProjectState>;

/** In-memory overlay when `localStorage.setItem` hits quota; keyed by the same Storage object (incl. tests). */
const volatileByStorage = new WeakMap<Storage, CollaborationClientStateMap>();

function getDefaultStorage(): Storage | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  return window.localStorage;
}

function isQuotaExceededError(error: unknown): boolean {
  return error instanceof DOMException
    && (error.name === 'QuotaExceededError' || error.code === 22);
}

function sanitizeChangeRecord(value: unknown): CollaborationProjectChangeRecord | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  if (typeof source.projectId !== 'string' || source.projectId.trim().length === 0) return null;
  if (typeof source.clientOpId !== 'string' || source.clientOpId.trim().length === 0) return null;
  if (typeof source.entityType !== 'string' || source.entityType.trim().length === 0) return null;
  if (typeof source.entityId !== 'string' || source.entityId.trim().length === 0) return null;
  if (typeof source.opType !== 'string' || source.opType.trim().length === 0) return null;
  if (typeof source.createdAt !== 'string' || source.createdAt.trim().length === 0) return null;
  return source as unknown as CollaborationProjectChangeRecord;
}

function sanitizeProjectState(value: unknown): CollaborationClientProjectState | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const next: CollaborationClientProjectState = {
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : new Date(0).toISOString(),
  };

  if (typeof source.lastSeenRevision === 'number' && Number.isFinite(source.lastSeenRevision) && source.lastSeenRevision >= 0) {
    next.lastSeenRevision = Math.floor(source.lastSeenRevision);
  }

  if (Array.isArray(source.pendingOutboundChanges)) {
    const pending = source.pendingOutboundChanges
      .map(sanitizeChangeRecord)
      .filter((item): item is CollaborationProjectChangeRecord => item !== null);
    if (pending.length > 0) {
      next.pendingOutboundChanges = pending;
    }
  }

  return next;
}

function parseRawToStateMap(raw: string): CollaborationClientStateMap {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object') return {};

  const next: CollaborationClientStateMap = {};
  for (const [projectId, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!projectId.trim()) continue;
    const sanitized = sanitizeProjectState(value);
    if (!sanitized) continue;
    next[projectId] = sanitized;
  }
  return next;
}

function loadBaseStateMapFromStorage(target: Storage): CollaborationClientStateMap {
  try {
    const raw = target.getItem(COLLAB_CLIENT_STATE_STORAGE_KEY);
    if (!raw) return {};
    return parseRawToStateMap(raw);
  } catch {
    return {};
  }
}

function loadStateMap(storage?: Storage): CollaborationClientStateMap {
  const target = storage ?? getDefaultStorage();
  if (!target) return {};
  const fromLs = loadBaseStateMapFromStorage(target);
  const vol = volatileByStorage.get(target);
  return vol ? { ...fromLs, ...vol } : fromLs;
}

function tryFlushVolatileCollabStateToLocalStorage(target: Storage): void {
  const overlay = volatileByStorage.get(target);
  if (!overlay) return;
  const base = loadBaseStateMapFromStorage(target);
  const merged = { ...base, ...overlay };
  try {
    target.setItem(COLLAB_CLIENT_STATE_STORAGE_KEY, JSON.stringify(merged));
    volatileByStorage.delete(target);
  } catch (e) {
    if (!isQuotaExceededError(e)) return;
  }
}

function saveStateMap(stateMap: CollaborationClientStateMap, storage?: Storage): void {
  const target = storage ?? getDefaultStorage();
  if (!target) return;
  try {
    target.setItem(COLLAB_CLIENT_STATE_STORAGE_KEY, JSON.stringify(stateMap));
    volatileByStorage.delete(target);
  } catch (e) {
    if (!isQuotaExceededError(e)) return;
    volatileByStorage.set(target, stateMap);
    void saveCollabClientStateBlobToIdb(JSON.stringify(stateMap)).catch((err) => {
      log.error('collab client state idb mirror failed', { err });
    });
    log.warn('collab client state localStorage quota exceeded; volatile overlay + IndexedDB mirror', {
      projectCount: Object.keys(stateMap).length,
    });
    const now = Date.now();
    if (now - lastCollabQuotaToastAt >= COLLAB_QUOTA_TOAST_COOLDOWN_MS) {
      lastCollabQuotaToastAt = now;
      const toastMsg = getAppDataResilienceMessages(detectLocale()).collabLocalStorageQuotaToast;
      dispatchAppGlobalToast({ message: toastMsg, variant: 'error', autoDismissMs: 14_000 });
    }
  }
}

/**
 * Merge persisted IDB mirror into the default localStorage view and retry flush.
 * Call before reading project cursor / pending outbound on bridge bootstrap (F-3).
 */
export async function hydrateCollabClientStateFromIdb(): Promise<void> {
  const raw = await loadCollabClientStateBlobFromIdb();
  if (!raw) return;
  let idbMap: CollaborationClientStateMap;
  try {
    idbMap = parseRawToStateMap(raw);
  } catch {
    return;
  }
  const target = getDefaultStorage();
  if (!target) return;
  const prev = volatileByStorage.get(target);
  volatileByStorage.set(target, prev ? { ...idbMap, ...prev } : idbMap);
  tryFlushVolatileCollabStateToLocalStorage(target);
}

/** Vitest: drop volatile overlay for a mocked Storage instance. */
export function resetCollabClientStateVolatileOverlayForTests(storage: Storage): void {
  volatileByStorage.delete(storage);
}

function upsertProjectState(
  projectId: string,
  updater: (existing: CollaborationClientProjectState | undefined) => CollaborationClientProjectState | null,
  storage?: Storage,
): void {
  if (!projectId.trim()) return;
  const targetStorage = storage ?? getDefaultStorage();
  if (!targetStorage) return;

  const stateMap = loadStateMap(targetStorage);
  const previous = stateMap[projectId];
  const next = updater(previous);

  if (!next) {
    delete stateMap[projectId];
  } else {
    stateMap[projectId] = next;
  }

  saveStateMap(stateMap, targetStorage);
}

export function loadProjectLastSeenRevision(projectId: string, storage?: Storage): number {
  if (!projectId.trim()) return 0;
  const targetStorage = storage ?? getDefaultStorage();
  const stateMap = loadStateMap(targetStorage);
  const revision = stateMap[projectId]?.lastSeenRevision;
  if (typeof revision === 'number' && Number.isFinite(revision) && revision >= 0) {
    return Math.floor(revision);
  }
  return 0;
}

export function saveProjectLastSeenRevision(projectId: string, revision: number, storage?: Storage): void {
  if (!projectId.trim()) return;
  if (!Number.isFinite(revision) || revision < 0) return;
  const normalizedRevision = Math.floor(revision);

  upsertProjectState(projectId, (existing) => ({
    ...(existing ?? {}),
    lastSeenRevision: normalizedRevision,
    updatedAt: new Date().toISOString(),
  }), storage);
}

export function loadProjectPendingOutboundChanges(
  projectId: string,
  storage?: Storage,
): CollaborationProjectChangeRecord[] {
  if (!projectId.trim()) return [];
  const targetStorage = storage ?? getDefaultStorage();
  const stateMap = loadStateMap(targetStorage);
  return stateMap[projectId]?.pendingOutboundChanges ?? [];
}

export function saveProjectPendingOutboundChanges(
  projectId: string,
  changes: CollaborationProjectChangeRecord[],
  storage?: Storage,
): void {
  if (!projectId.trim()) return;

  const normalizedChanges = changes
    .map((change) => sanitizeChangeRecord(change))
    .filter((item): item is CollaborationProjectChangeRecord => item !== null);

  upsertProjectState(projectId, (existing) => {
    const lastSeenRevision = existing?.lastSeenRevision;
    if (normalizedChanges.length === 0 && lastSeenRevision === undefined) {
      return null;
    }
    return {
      ...(lastSeenRevision !== undefined ? { lastSeenRevision } : {}),
      ...(normalizedChanges.length > 0 ? { pendingOutboundChanges: normalizedChanges } : {}),
      updatedAt: new Date().toISOString(),
    };
  }, storage);
}
