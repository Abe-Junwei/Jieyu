/**
 * In-memory snapshots for `list_units` when the project row count exceeds the snapshot threshold.
 * Not persisted to Dexie: tab-scoped, TTL-bounded, capped to avoid unbounded growth.
 */

export const LIST_UNITS_SNAPSHOT_TTL_MS = 15 * 60 * 1000;
export const LIST_UNITS_SNAPSHOT_MAX_ENTRIES = 20;
/** When `localUnitIndex` row count exceeds this, first `list_units` response uses a `resultHandle` for paging. */
export const LIST_UNITS_SNAPSHOT_ROW_THRESHOLD = 50;

/** Same shape as normalized rows used by `list_units` (kept local to avoid circular imports). */
export interface ListUnitsSnapshotRow {
  id: string;
  kind: 'utterance' | 'segment';
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
  /** Unsorted copy of rows at capture time; caller sorts per request (limit/offset/sort). */
  rows: ListUnitsSnapshotRow[];
  /** `timelineReadModelEpoch` when the snapshot was created; paged reads must match current context epoch. */
  epoch?: number;
  createdAt: number;
}

const store = new Map<string, ListUnitsSnapshotEntry>();

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
): string {
  pruneExpiredAndCap();
  const id = newSnapshotId();
  store.set(id, {
    rows: rows.map((row) => ({ ...row })),
    ...(typeof epoch === 'number' && Number.isFinite(epoch) ? { epoch } : {}),
    createdAt: Date.now(),
  });
  return id;
}

export function getListUnitsSnapshot(id: string): ListUnitsSnapshotEntry | null {
  pruneExpiredAndCap();
  const entry = store.get(id.trim());
  if (!entry) return null;
  if (Date.now() - entry.createdAt > LIST_UNITS_SNAPSHOT_TTL_MS) {
    store.delete(id.trim());
    return null;
  }
  return entry;
}

/** Test-only: clear all snapshots. */
export function clearListUnitsSnapshotsForTests(): void {
  store.clear();
}
