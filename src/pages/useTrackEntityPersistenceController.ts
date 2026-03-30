import { useEffect } from 'react';
import type { TranscriptionTrackDisplayMode } from '../hooks/useTranscriptionUIState';
import {
  loadTrackEntityStateMap,
  saveTrackEntityStateMap,
  saveTrackEntityStateToDb,
  upsertTrackEntityState,
} from '../services/TrackEntityStore';

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
  useEffect(() => {
    if (!input.trackEntityScopedKey || !input.activeTextId) return;
    if (input.trackEntityHydratedKeyRef.current !== input.trackEntityScopedKey) return;
    const next = upsertTrackEntityState(
      input.trackEntityStateByMediaRef.current ?? {},
      input.trackEntityScopedKey,
      { mode: input.transcriptionTrackMode, laneLockMap: input.effectiveLaneLockMap },
    );
    input.trackEntityStateByMediaRef.current = next;
    saveTrackEntityStateMap(next, typeof window !== 'undefined' ? window.localStorage : undefined);
    void saveTrackEntityStateToDb(input.activeTextId, input.trackEntityScopedKey, next[input.trackEntityScopedKey]!);
  }, [input]);
}