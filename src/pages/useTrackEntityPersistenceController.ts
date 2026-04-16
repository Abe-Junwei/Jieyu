import { useEffect } from 'react';
import type { TranscriptionTrackDisplayMode } from '../hooks/useTranscriptionUIState';
import { loadTrackEntityStateMap, saveTrackEntityStateMap, saveTrackEntityStateToDb, upsertTrackEntityState } from '../services/TrackEntityStore';

type TrackEntityStateMap = ReturnType<typeof loadTrackEntityStateMap>;

interface UseTrackEntityPersistenceControllerInput {
  activeTextId: string | null;
  trackEntityScopedKey: string | null;
  trackEntityStateByMediaRef: React.MutableRefObject<TrackEntityStateMap | null>;
  trackEntityHydratedKeyRef: React.MutableRefObject<string | null>;
  transcriptionTrackMode: TranscriptionTrackDisplayMode;
  effectiveLaneLockMap: Record<string, number>;
}

export function useTrackEntityPersistenceController(
  input: UseTrackEntityPersistenceControllerInput,
): void {
  const {
    activeTextId,
    trackEntityScopedKey,
    trackEntityStateByMediaRef,
    trackEntityHydratedKeyRef,
    transcriptionTrackMode,
    effectiveLaneLockMap,
  } = input;

  useEffect(() => {
    if (!trackEntityScopedKey || !activeTextId) return;
    if (trackEntityHydratedKeyRef.current !== trackEntityScopedKey) return;
    const next = upsertTrackEntityState(
      trackEntityStateByMediaRef.current ?? {},
      trackEntityScopedKey,
      { mode: transcriptionTrackMode, laneLockMap: effectiveLaneLockMap },
    );
    trackEntityStateByMediaRef.current = next;
    saveTrackEntityStateMap(next, typeof window !== 'undefined' ? window.localStorage : undefined);
    void saveTrackEntityStateToDb(activeTextId, trackEntityScopedKey, next[trackEntityScopedKey]!);
  }, [activeTextId, effectiveLaneLockMap, trackEntityHydratedKeyRef, trackEntityScopedKey, trackEntityStateByMediaRef, transcriptionTrackMode]);
}