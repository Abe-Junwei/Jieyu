/**
 * In-memory snapshots for `list_units` when the project row count exceeds the snapshot threshold.
 * Not persisted to Dexie: tab-scoped, TTL-bounded, capped to avoid unbounded growth.
 */

export const LIST_UNITS_SNAPSHOT_TTL_MS = 15 * 60 * 1000;
const LIST_UNITS_SNAPSHOT_MAX_ENTRIES = 20;
/** When `localUnitIndex` row count exceeds this, first `list_units` response uses a `resultHandle` for paging. */
export const LIST_UNITS_SNAPSHOT_ROW_THRESHOLD = 50;

/** Same shape as normalized rows used by `list_units` (kept local to avoid circular imports). */
export interface ListUnitsSnapshotRow {
  id: string;
  kind: 'unit' | 'segment';
  layerId: string;
  textId?: string;
  mediaId?: string;
  startTime: number;
  endTime: number;
  transcription: string;
  speakerId?: string;
  annotationStatus?: string;
}

export interface ListUnitsSnapshotEntry {
  kind: 'rows';
  /** Unsorted copy of rows at capture time; caller sorts per request (limit/offset/sort). */
  rows: ListUnitsSnapshotRow[];
  /** Captured scope for this snapshot page handle. */
  scope?: 'project' | 'current_track' | 'current_scope';
  /** `timelineReadModelEpoch` when the snapshot was created; paged reads must match current context epoch. */
  epoch?: number;
  createdAt: number;
}

/** Scope captured for a persistent `list_units` page token. Not a copy of the rows. */
export interface ListUnitsPersistentQuery {
  textId?: string;
  mediaId?: string;
  layerId?: string;
}

/** Exclusive cursor in the list_units total order. One boundary row, not a page buffer. */
export interface ListUnitsQueryCursorKey {
  startTime: number;
  endTime: number;
  segmentId: string;
  id: string;
}

export interface ListUnitsQueryHandleEntry {
  kind: 'query';
  scope: 'project' | 'current_track' | 'current_scope';
  query: ListUnitsPersistentQuery;
  sort: 'time_asc' | 'time_desc';
  after: ListUnitsQueryCursorKey | null;
  nextOffset: number;
  epoch?: number;
  createdAt: number;
}

export type ListUnitsHandleEntry = ListUnitsSnapshotEntry | ListUnitsQueryHandleEntry;

const store = new Map<string, ListUnitsHandleEntry>();

function newSnapshotId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `lus_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function pruneExpiredAndCap(): void {
  const now = Date.now();
  for (const [id, entry] of store) {
    if (now - entry.createdAt > LIST_UNITS_SNAPSHOT_TTL_MS) {
      store.delete(id);
    }
  }
  if (store.size <= LIST_UNITS_SNAPSHOT_MAX_ENTRIES) return;
  const sorted = [...store.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
  const overflow = store.size - LIST_UNITS_SNAPSHOT_MAX_ENTRIES;
  for (let i = 0; i < overflow; i += 1) {
    const first = sorted[i];
    if (first) store.delete(first[0]);
  }
}

export function createListUnitsSnapshot(
  rows: ListUnitsSnapshotRow[],
  epoch?: number,
  scope?: 'project' | 'current_track' | 'current_scope',
): string {
  pruneExpiredAndCap();
  const id = newSnapshotId();
  store.set(id, {
    kind: 'rows',
    rows: rows.map((row) => ({ ...row })),
    ...(scope ? { scope } : {}),
    ...(typeof epoch === 'number' && Number.isFinite(epoch) ? { epoch } : {}),
    createdAt: Date.now(),
  });
  return id;
}

export function createListUnitsQueryHandle(entry: {
  scope: ListUnitsQueryHandleEntry['scope'];
  query: ListUnitsPersistentQuery;
  sort: ListUnitsQueryHandleEntry['sort'];
  after: ListUnitsQueryCursorKey | null;
  nextOffset: number;
  epoch?: number;
}): string {
  pruneExpiredAndCap();
  const id = newSnapshotId();
  store.set(id, {
    kind: 'query',
    scope: entry.scope,
    query: { ...entry.query },
    sort: entry.sort,
    after: entry.after ? { ...entry.after } : null,
    nextOffset: entry.nextOffset,
    ...(typeof entry.epoch === 'number' && Number.isFinite(entry.epoch)
      ? { epoch: entry.epoch }
      : {}),
    createdAt: Date.now(),
  });
  return id;
}

export function updateListUnitsQueryHandle(
  id: string,
  patch: {
    sort: ListUnitsQueryHandleEntry['sort'];
    after: ListUnitsQueryCursorKey | null;
    nextOffset: number;
  },
): void {
  const entry = store.get(id.trim());
  if (!entry || entry.kind !== 'query') return;
  entry.sort = patch.sort;
  entry.after = patch.after ? { ...patch.after } : null;
  entry.nextOffset = patch.nextOffset;
}

function readLiveHandle(id: string): ListUnitsHandleEntry | null {
  pruneExpiredAndCap();
  const entry = store.get(id.trim());
  if (!entry) return null;
  if (Date.now() - entry.createdAt > LIST_UNITS_SNAPSHOT_TTL_MS) {
    store.delete(id.trim());
    return null;
  }
  return entry;
}

export function getListUnitsHandle(id: string): ListUnitsHandleEntry | null {
  return readLiveHandle(id);
}

export function getListUnitsSnapshot(id: string): ListUnitsSnapshotEntry | null {
  const entry = readLiveHandle(id);
  if (!entry || entry.kind !== 'rows') return null;
  return entry;
}

/** Test-only: clear all snapshots. */
export function clearListUnitsSnapshotsForTests(): void {
  store.clear();
}
