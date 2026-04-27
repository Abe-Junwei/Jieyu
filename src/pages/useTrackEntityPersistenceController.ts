import { useEffect } from 'react';
import type { TranscriptionTrackDisplayMode } from '../hooks/useTranscriptionUIState';
import type { TrackEntityStateMap } from '../types/trackEntityStateMap.types';
import { saveTrackEntityStateToDb, upsertTrackEntityState } from '../utils/pageTrackEntityStore';

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
    void saveTrackEntityStateToDb(activeTextId, trackEntityScopedKey, next[trackEntityScopedKey]!);
  }, [activeTextId, effectiveLaneLockMap, trackEntityHydratedKeyRef, trackEntityScopedKey, trackEntityStateByMediaRef, transcriptionTrackMode]);
}