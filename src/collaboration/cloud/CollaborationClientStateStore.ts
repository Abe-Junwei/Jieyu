import { createLogger } from '../../observability/logger';
import { getStoredLocalePreference, normalizeLocale } from '../../i18n';
import { getAppDataResilienceMessages } from '../../i18n/messages';
import { dispatchAppGlobalToast } from '../../utils/appGlobalToast';
import type { CollaborationProjectChangeRecord } from './syncTypes';
import {
  advanceOutboundCursorInIdb,
  deleteCollabClientStateBlobFromIdb,
  deleteOutboundCursorFromIdb,
  deleteOutboundOpFromIdb,
  listAllOutboundOpsFromIdb,
  listOutboundCursorsFromIdb,
  loadCollabClientStateBlobFromIdb,
  mirrorOutboundOpToIdb,
} from './CollaborationClientStateStore.idb';

const log = createLogger('CollaborationClientStateStore');

let lastCollabQuotaToastAt = 0;
let idbTail: Promise<void> = Promise.resolve();

function trackIdb(work: Promise<void>): void {
  idbTail = idbTail.then(
    () => work,
    () => work,
  );
}

/** Vitest: wait until cursor/op mirrors have hit IndexedDB. */
export function flushCollabClientStateWritesForTests(): Promise<void> {
  return idbTail;
}
const COLLAB_QUOTA_TOAST_COOLDOWN_MS = 90_000;

const COLLAB_CLIENT_STATE_STORAGE_KEY = 'jieyu:collab-client-state:v1';
const MIGRATED_FLAG_KEY = 'jieyu:collab-client-state:v1-migrated';
const CURSOR_KEY_PREFIX = 'jieyu:collab-cursor:v2:';
const OP_KEY_PREFIX = 'jieyu:collab-op:v2:';

interface CollaborationClientProjectState {
  lastSeenRevision?: number;
  pendingOutboundChanges?: CollaborationProjectChangeRecord[];
  updatedAt: string;
}

type CollaborationClientStateMap = Record<string, CollaborationClientProjectState>;

/** Per-key overlay when `setItem` hits quota. Whole-map overlay rewrote every project. */
const volatileByStorage = new WeakMap<Storage, Map<string, string>>();

function getDefaultStorage(): Storage | undefined {
  if (typeof window === 'undefined' || window.localStorage === undefined) return undefined;
  return window.localStorage;
}

function isQuotaExceededError(error: unknown): boolean {
  return (
    error instanceof DOMException && (error.name === 'QuotaExceededError' || error.code === 22)
  );
}

function resolveCollabToastLocale() {
  const stored = getStoredLocalePreference();
  if (stored !== null && stored.length > 0) return stored;
  if (typeof navigator === 'undefined') return 'zh-CN';
  return normalizeLocale(navigator.language) ?? 'zh-CN';
}

function sanitizeChangeRecord(value: unknown): CollaborationProjectChangeRecord | null {
  if (value === null || value === undefined || typeof value !== 'object') return null;
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
  if (value === null || value === undefined || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const next: CollaborationClientProjectState = {
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : new Date(0).toISOString(),
  };

  if (
    typeof source.lastSeenRevision === 'number' &&
    Number.isFinite(source.lastSeenRevision) &&
    source.lastSeenRevision >= 0
  ) {
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
  if (parsed === null || parsed === undefined || typeof parsed !== 'object') return {};

  const next: CollaborationClientStateMap = {};
  for (const [projectId, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (projectId.trim().length === 0) continue;
    const sanitized = sanitizeProjectState(value);
    if (sanitized === null) continue;
    next[projectId] = sanitized;
  }
  return next;
}

function cursorStorageKey(projectId: string): string {
  return `${CURSOR_KEY_PREFIX}${encodeURIComponent(projectId)}`;
}

function opStoragePrefix(projectId: string): string {
  return `${OP_KEY_PREFIX}${encodeURIComponent(projectId)}:`;
}

export function outboundOpStorageKey(change: CollaborationProjectChangeRecord): string {
  const clientId = typeof change.clientId === 'string' ? change.clientId : '';
  return `${opStoragePrefix(change.projectId)}${encodeURIComponent(clientId)}:${encodeURIComponent(change.clientOpId)}`;
}

function overlayFor(storage: Storage): Map<string, string> {
  let overlay = volatileByStorage.get(storage);
  if (overlay === undefined) {
    overlay = new Map();
    volatileByStorage.set(storage, overlay);
  }
  return overlay;
}

function readItem(storage: Storage, key: string): string | null {
  const overlay = volatileByStorage.get(storage)?.get(key);
  if (overlay !== undefined) return overlay;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function noteQuota(storage: Storage): void {
  log.warn('collab client state localStorage quota exceeded; volatile overlay + IndexedDB mirror');
  if (storage !== getDefaultStorage()) return;
  const now = Date.now();
  if (now - lastCollabQuotaToastAt < COLLAB_QUOTA_TOAST_COOLDOWN_MS) return;
  lastCollabQuotaToastAt = now;
  const toastMsg = getAppDataResilienceMessages(
    resolveCollabToastLocale(),
  ).collabLocalStorageQuotaToast;
  dispatchAppGlobalToast({ message: toastMsg, variant: 'error', autoDismissMs: 14_000 });
}

function writeItem(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
    volatileByStorage.get(storage)?.delete(key);
  } catch (error) {
    if (!isQuotaExceededError(error)) return;
    overlayFor(storage).set(key, value);
    noteQuota(storage);
  }
}

function removeItem(storage: Storage, key: string): void {
  volatileByStorage.get(storage)?.delete(key);
  try {
    storage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function listKeys(storage: Storage, prefix: string): string[] {
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key !== null && key.startsWith(prefix)) keys.push(key);
    }
  } catch {
    /* ignore */
  }
  const overlay = volatileByStorage.get(storage);
  if (overlay !== undefined) {
    for (const key of overlay.keys()) {
      if (key.startsWith(prefix) && !keys.includes(key)) keys.push(key);
    }
  }
  return keys;
}

function usesDefaultStorage(storage: Storage): boolean {
  return storage === getDefaultStorage();
}

function mirrorOp(
  storage: Storage,
  key: string,
  change: CollaborationProjectChangeRecord,
  json: string,
): Promise<void> {
  if (!usesDefaultStorage(storage)) return Promise.resolve();
  return mirrorOutboundOpToIdb(key, change.projectId, json).catch((err) => {
    log.error('collab outbound op idb mirror failed', { err });
  });
}

function forgetOp(storage: Storage, key: string): Promise<void> {
  if (!usesDefaultStorage(storage)) return Promise.resolve();
  return deleteOutboundOpFromIdb(key).catch((err) => {
    log.error('collab outbound op idb delete failed', { err });
  });
}

/**
 * 协同客户端状态能否读出（D6：读不出就判定不了）。没有记录也算能读。
 * Whether the client state can be read (D6: unreadable = undecidable). No record counts as readable.
 */
export function probeCollabClientStateReadable(storage?: Storage): boolean {
  const target = storage ?? getDefaultStorage();
  if (target === undefined) return false;
  try {
    if (readItem(target, MIGRATED_FLAG_KEY) === '1') return true;
    const raw = target.getItem(COLLAB_CLIENT_STATE_STORAGE_KEY);
    if (raw === null || raw.length === 0) return true;
    const parsed = JSON.parse(raw) as unknown;
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

function ensureMigrated(storage: Storage): void {
  if (readItem(storage, MIGRATED_FLAG_KEY) === '1') return;
  const raw = readItem(storage, COLLAB_CLIENT_STATE_STORAGE_KEY);
  if (raw !== null && raw.length > 0) {
    try {
      const map = parseRawToStateMap(raw);
      for (const [projectId, state] of Object.entries(map)) {
        if (state.lastSeenRevision !== undefined) {
          const key = cursorStorageKey(projectId);
          const current = Number(readItem(storage, key) ?? 0);
          if (state.lastSeenRevision > current)
            writeItem(storage, key, String(state.lastSeenRevision));
        }
        for (const change of state.pendingOutboundChanges ?? []) {
          const key = outboundOpStorageKey(change);
          if (readItem(storage, key) === null) writeItem(storage, key, JSON.stringify(change));
        }
      }
    } catch {
      /* drop a corrupt legacy blob */
    }
    removeItem(storage, COLLAB_CLIENT_STATE_STORAGE_KEY);
  }
  writeItem(storage, MIGRATED_FLAG_KEY, '1');
}

function resolveStorage(storage?: Storage): Storage | undefined {
  const target = storage ?? getDefaultStorage();
  if (target !== undefined) ensureMigrated(target);
  return target;
}

/**
 * Import the legacy singleton blob once, then delete it so an ACK'd queue cannot come back.
 * Call before reading the cursor or pending outbound on bridge bootstrap.
 */
export async function hydrateCollabClientStateFromIdb(): Promise<void> {
  const target = getDefaultStorage();
  if (target === undefined) return;
  if (readItem(target, MIGRATED_FLAG_KEY) !== '1') {
    const blob = await loadCollabClientStateBlobFromIdb();
    if (
      blob !== null &&
      blob.length > 0 &&
      readItem(target, COLLAB_CLIENT_STATE_STORAGE_KEY) === null
    ) {
      writeItem(target, COLLAB_CLIENT_STATE_STORAGE_KEY, blob);
    }
    ensureMigrated(target);
  }
  await deleteCollabClientStateBlobFromIdb().catch((err) => {
    log.error('collab client state blob delete failed', { err });
  });
  const ops = await listAllOutboundOpsFromIdb().catch(() => []);
  for (const op of ops) {
    if (readItem(target, op.key) === null) writeItem(target, op.key, op.json);
  }
  const cursors = await listOutboundCursorsFromIdb().catch(() => []);
  for (const cursor of cursors) {
    const key = cursorStorageKey(cursor.projectId);
    const current = Number(readItem(target, key) ?? 0);
    if (cursor.revision > current) writeItem(target, key, String(cursor.revision));
  }
}

/** Vitest: drop volatile overlay for a mocked Storage instance. */
export function resetCollabClientStateVolatileOverlayForTests(storage: Storage): void {
  volatileByStorage.delete(storage);
}

export function loadProjectLastSeenRevision(projectId: string, storage?: Storage): number {
  if (projectId.trim().length === 0) return 0;
  const target = resolveStorage(storage);
  if (target === undefined) return 0;
  const revision = Number(readItem(target, cursorStorageKey(projectId)) ?? 0);
  if (!Number.isFinite(revision) || revision < 0) return 0;
  return Math.floor(revision);
}

export function saveProjectLastSeenRevision(
  projectId: string,
  revision: number,
  storage?: Storage,
): void {
  if (projectId.trim().length === 0) return;
  if (!Number.isFinite(revision) || revision < 0) return;
  const target = resolveStorage(storage);
  if (target === undefined) return;
  const normalizedRevision = Math.floor(revision);
  const key = cursorStorageKey(projectId);
  const current = Number(readItem(target, key) ?? 0);
  if (normalizedRevision <= current) return;
  writeItem(target, key, String(normalizedRevision));
  if (!usesDefaultStorage(target)) return;
  trackIdb(
    advanceOutboundCursorInIdb(projectId, normalizedRevision).catch((err) => {
      log.error('collab cursor idb advance failed', { err });
    }),
  );
}

function normalizedPending(
  changes: CollaborationProjectChangeRecord[],
): CollaborationProjectChangeRecord[] {
  return changes
    .map((change) => sanitizeChangeRecord(change))
    .filter((item): item is CollaborationProjectChangeRecord => item !== null);
}

export function loadProjectPendingOutboundChanges(
  projectId: string,
  storage?: Storage,
): CollaborationProjectChangeRecord[] {
  if (projectId.trim().length === 0) return [];
  const target = resolveStorage(storage);
  if (target === undefined) return [];
  const pending: CollaborationProjectChangeRecord[] = [];
  for (const key of listKeys(target, opStoragePrefix(projectId))) {
    const raw = readItem(target, key);
    if (raw === null) continue;
    try {
      const change = sanitizeChangeRecord(JSON.parse(raw) as unknown);
      if (change !== null) pending.push(change);
    } catch {
      /* drop a corrupt op */
    }
  }
  return pending;
}

export function putProjectPendingOutboundChange(
  change: CollaborationProjectChangeRecord,
  storage?: Storage,
): Promise<void> {
  const record = sanitizeChangeRecord(change);
  const target = resolveStorage(storage);
  if (record === null || target === undefined) return Promise.resolve();
  const key = outboundOpStorageKey(record);
  const json = JSON.stringify(record);
  writeItem(target, key, json);
  return mirrorOp(target, key, record, json);
}

export function deleteProjectPendingOutboundByKey(key: string, storage?: Storage): Promise<void> {
  const target = resolveStorage(storage);
  if (target === undefined || !key.startsWith(OP_KEY_PREFIX)) return Promise.resolve();
  removeItem(target, key);
  return forgetOp(target, key);
}

/** Replace one project's pending ops. Cursor is a different key and is left alone. */
export function saveProjectPendingOutboundChanges(
  projectId: string,
  changes: CollaborationProjectChangeRecord[],
  storage?: Storage,
): void {
  if (projectId.trim().length === 0) return;
  const target = resolveStorage(storage);
  if (target === undefined) return;
  const next = normalizedPending(changes).filter((change) => change.projectId === projectId);
  const nextKeys = new Set(next.map((change) => outboundOpStorageKey(change)));
  for (const key of listKeys(target, opStoragePrefix(projectId))) {
    if (!nextKeys.has(key)) {
      removeItem(target, key);
      trackIdb(forgetOp(target, key));
    }
  }
  for (const change of next) {
    const key = outboundOpStorageKey(change);
    const json = JSON.stringify(change);
    writeItem(target, key, json);
    trackIdb(mirrorOp(target, key, change, json));
  }
}

const UNVERIFIED_KEY_PREFIX = 'jieyu:collab-unverified:v1:';

export interface UnverifiedCollabMutation {
  id: string;
  entityType: string;
  entityId: string;
  opType: string;
  payload?: Record<string, unknown>;
  payloadRefPath?: string;
}

function unverifiedStorageKey(projectId: string): string {
  return `${UNVERIFIED_KEY_PREFIX}${encodeURIComponent(projectId)}`;
}

function isUnverifiedMutation(value: unknown): value is UnverifiedCollabMutation {
  if (value === null || typeof value !== 'object') return false;
  const source = value as Record<string, unknown>;
  return (
    typeof source.id === 'string' &&
    source.id.length > 0 &&
    typeof source.entityType === 'string' &&
    typeof source.entityId === 'string' &&
    typeof source.opType === 'string'
  );
}

function readUnverified(storage: Storage, projectId: string): UnverifiedCollabMutation[] {
  const raw = readItem(storage, unverifiedStorageKey(projectId));
  if (raw === null || raw.length === 0) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isUnverifiedMutation);
  } catch {
    return [];
  }
}

/** Edits that committed locally but are not yet in the outbound queue. */
export function loadUnverifiedCollabMutations(
  projectId: string,
  storage?: Storage,
): UnverifiedCollabMutation[] {
  if (projectId.trim().length === 0) return [];
  const target = storage ?? getDefaultStorage();
  if (target === undefined) return [];
  return readUnverified(target, projectId);
}

export function rememberUnverifiedCollabMutation(
  projectId: string,
  input: Omit<UnverifiedCollabMutation, 'id'>,
  storage?: Storage,
): string {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
  const target = storage ?? getDefaultStorage();
  if (target === undefined || projectId.trim().length === 0) return id;
  const next = [...readUnverified(target, projectId), { ...input, id }];
  writeItem(target, unverifiedStorageKey(projectId), JSON.stringify(next));
  return id;
}

export function forgetUnverifiedCollabMutation(
  projectId: string,
  id: string,
  storage?: Storage,
): void {
  const target = storage ?? getDefaultStorage();
  if (target === undefined || projectId.trim().length === 0) return;
  const next = readUnverified(target, projectId).filter((item) => item.id !== id);
  const key = unverifiedStorageKey(projectId);
  if (next.length === 0) removeItem(target, key);
  else writeItem(target, key, JSON.stringify(next));
}

/**
 * 删除项目在本机的协同状态（游标与待发队列），清理任务用（rev5 9.1）。
 * Drop a project's local sync state (cursor and pending queue); used by the cleanup job (rev5 9.1).
 */
export function clearProjectCollabClientState(projectId: string, storage?: Storage): void {
  if (projectId.trim().length === 0) return;
  const target = resolveStorage(storage);
  if (target === undefined) return;
  for (const key of listKeys(target, opStoragePrefix(projectId))) {
    removeItem(target, key);
    trackIdb(forgetOp(target, key));
  }
  removeItem(target, cursorStorageKey(projectId));
  removeItem(target, unverifiedStorageKey(projectId));
  if (!usesDefaultStorage(target)) return;
  trackIdb(
    deleteOutboundCursorFromIdb(projectId).catch((err) => {
      log.error('collab cursor idb delete failed', { err });
    }),
  );
}
