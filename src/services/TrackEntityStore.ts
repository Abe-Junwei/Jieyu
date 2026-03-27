import type { TranscriptionTrackDisplayMode } from '../hooks/useTranscriptionUIState';
import type { TrackEntityDocType } from '../db';
import { getDb } from '../db';

export type TrackEntityState = {
  mode: TranscriptionTrackDisplayMode;
  laneLockMap: Record<string, number>;
  updatedAt: string;
};

export type TrackEntityStateMap = Record<string, TrackEntityState>;

export const TRACK_ENTITY_STORAGE_KEY = 'jieyu:track-entity-state:v1';

function sanitizeLaneLockMap(input: unknown): Record<string, number> {
  if (!input || typeof input !== 'object') return {};
  const next: Record<string, number> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!Number.isInteger(value) || (value as number) < 0) continue;
    next[key] = value as number;
  }
  return next;
}

function sanitizeMode(value: unknown): TranscriptionTrackDisplayMode {
  if (value === 'multi-auto' || value === 'multi-locked' || value === 'single') return value;
  return 'single';
}

export function loadTrackEntityStateMap(storage?: Storage): TrackEntityStateMap {
  if (!storage) return {};
  try {
    const raw = storage.getItem(TRACK_ENTITY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const next: TrackEntityStateMap = {};
    for (const [mediaId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const row = value as Record<string, unknown>;
      next[mediaId] = {
        mode: sanitizeMode(row.mode),
        laneLockMap: sanitizeLaneLockMap(row.laneLockMap),
        updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : new Date(0).toISOString(),
      };
    }
    return next;
  } catch {
    return {};
  }
}

export function saveTrackEntityStateMap(stateMap: TrackEntityStateMap, storage?: Storage): void {
  if (!storage) return;
  try {
    storage.setItem(TRACK_ENTITY_STORAGE_KEY, JSON.stringify(stateMap));
  } catch {
    // no-op
  }
}

export function getTrackEntityState(stateMap: TrackEntityStateMap, mediaId: string): TrackEntityState | null {
  return stateMap[mediaId] ?? null;
}

export function upsertTrackEntityState(
  stateMap: TrackEntityStateMap,
  mediaId: string,
  update: Pick<TrackEntityState, 'mode' | 'laneLockMap'>,
): TrackEntityStateMap {
  return {
    ...stateMap,
    [mediaId]: {
      mode: sanitizeMode(update.mode),
      laneLockMap: sanitizeLaneLockMap(update.laneLockMap),
      updatedAt: new Date().toISOString(),
    },
  };
}

// ─── DB-backed async API (v2, replaces LocalStorage) ──────────────────────────

/**
 * Load all track entities from DB for a given textId.
 * Returns a map keyed by mediaId.
 * Fallback: If no rows found for the textId, queries '__unknown__' (v26 migration placeholder).
 * 加载给定 textId 的所有 track entities | 回退：如无结果，查询 '__unknown__'（v26 迁移占位符）
 */
export async function loadTrackEntityStateMapFromDb(textId: string): Promise<TrackEntityStateMap> {
  const db = await getDb();
  let rows = await db.dexie.track_entities.where('textId').equals(textId).toArray();
  
  // Fallback to '__unknown__' if no rows found (v26 migration compatibility) | 如无结果则回退到 '__unknown__'（v26 迁移兼容性）
  if (rows.length === 0) {
    rows = await db.dexie.track_entities.where('textId').equals('__unknown__').toArray();
  }
  
  const next: TrackEntityStateMap = {};
  for (const row of rows) {
    next[row.mediaId] = {
      mode: row.mode,
      laneLockMap: row.laneLockMap,
      updatedAt: row.updatedAt,
    };
  }
  return next;
}

/**
 * Persist a single media's track state to DB.
 * Updates existing row or inserts new one.
 */
export async function saveTrackEntityStateToDb(
  textId: string,
  mediaId: string,
  state: TrackEntityState,
): Promise<void> {
  const db = await getDb();
  const id = `track_${mediaId}`;
  const doc: TrackEntityDocType = {
    id,
    textId,
    mediaId,
    mode: sanitizeMode(state.mode),
    laneLockMap: sanitizeLaneLockMap(state.laneLockMap),
    updatedAt: state.updatedAt,
  };
  await db.dexie.track_entities.put(doc);
}

/**
 * Bulk-persist a full state map to DB.
 * Replaces all entries for the given textId.
 */
export async function saveTrackEntityStateMapToDb(
  textId: string,
  stateMap: TrackEntityStateMap,
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  const docs: TrackEntityDocType[] = Object.entries(stateMap).map(([mediaId, state]) => ({
    id: `track_${mediaId}`,
    textId,
    mediaId,
    mode: sanitizeMode(state.mode),
    laneLockMap: sanitizeLaneLockMap(state.laneLockMap),
    updatedAt: state.updatedAt || now,
  }));
  await db.dexie.transaction('rw', db.dexie.track_entities, async () => {
    // Delete all existing entries for this textId, then insert new ones
    const existing = await db.dexie.track_entities.where('textId').equals(textId).primaryKeys();
    if (existing.length > 0) {
      await db.dexie.track_entities.bulkDelete(existing);
    }
    if (docs.length > 0) {
      await db.dexie.track_entities.bulkPut(docs);
    }
  });
}
