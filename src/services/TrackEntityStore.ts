import type { TranscriptionTrackDisplayMode } from '../hooks/useTranscriptionUIState';

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
