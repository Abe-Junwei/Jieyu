import type { CollaborationProjectChangeRecord } from './syncTypes';

const COLLAB_CLIENT_STATE_STORAGE_KEY = 'jieyu:collab-client-state:v1';

interface CollaborationClientProjectState {
  lastSeenRevision?: number;
  pendingOutboundChanges?: CollaborationProjectChangeRecord[];
  updatedAt: string;
}

type CollaborationClientStateMap = Record<string, CollaborationClientProjectState>;

function getDefaultStorage(): Storage | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  return window.localStorage;
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

function loadStateMap(storage?: Storage): CollaborationClientStateMap {
  if (!storage) return {};
  try {
    const raw = storage.getItem(COLLAB_CLIENT_STATE_STORAGE_KEY);
    if (!raw) return {};
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
  } catch {
    return {};
  }
}

function saveStateMap(stateMap: CollaborationClientStateMap, storage?: Storage): void {
  if (!storage) return;
  try {
    storage.setItem(COLLAB_CLIENT_STATE_STORAGE_KEY, JSON.stringify(stateMap));
  } catch {
    // no-op
  }
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
