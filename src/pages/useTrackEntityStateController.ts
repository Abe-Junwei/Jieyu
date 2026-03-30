import { useEffect, useRef, useState } from 'react';
import type { TranscriptionTrackDisplayMode } from '../hooks/useTranscriptionUIState';
import {
  getTrackEntityState,
  loadTrackEntityStateMap,
  loadTrackEntityStateMapFromDb,
} from '../services/TrackEntityStore';

type TrackEntityStateMap = ReturnType<typeof loadTrackEntityStateMap>;

interface UseTrackEntityStateControllerInput {
  activeTextId: string | null;
  selectedTimelineMediaId: string | null;
  setTranscriptionTrackMode: React.Dispatch<React.SetStateAction<TranscriptionTrackDisplayMode>>;
}

interface UseTrackEntityStateControllerResult {
  laneLockMap: Record<string, number>;
  setLaneLockMap: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  persistenceContext: {
    activeTextId: string | null;
    trackEntityScopedKey: string | null;
    trackEntityStateByMediaRef: React.MutableRefObject<TrackEntityStateMap | null>;
    trackEntityHydratedKeyRef: React.MutableRefObject<string | null>;
  };
}

export function useTrackEntityStateController(
  input: UseTrackEntityStateControllerInput,
): UseTrackEntityStateControllerResult {
  const [laneLockMap, setLaneLockMap] = useState<Record<string, number>>({});
  const trackEntityStateByMediaRef = useRef<TrackEntityStateMap | null>(null);
  const trackEntityHydratedKeyRef = useRef<string | null>(null);

  const trackEntityProjectKey = input.activeTextId?.trim() || '__no-project__';
  const trackEntityScopedKey = input.selectedTimelineMediaId ? `${trackEntityProjectKey}::${input.selectedTimelineMediaId}` : null;

  useEffect(() => {
    if (!input.activeTextId) return;
    let cancelled = false;

    loadTrackEntityStateMapFromDb(input.activeTextId).then((dbStateMap) => {
      if (cancelled) return;
      trackEntityStateByMediaRef.current = dbStateMap;
      if (trackEntityScopedKey) {
        const saved = dbStateMap[trackEntityScopedKey] ?? null;
        setLaneLockMap(saved?.laneLockMap ?? {});
        input.setTranscriptionTrackMode(saved?.mode ?? 'single');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [input.activeTextId, input, trackEntityScopedKey]);

  useEffect(() => {
    if (!trackEntityScopedKey) {
      trackEntityHydratedKeyRef.current = null;
      setLaneLockMap({});
      input.setTranscriptionTrackMode('single');
      return;
    }
    if (trackEntityStateByMediaRef.current === null) return;
    const saved = getTrackEntityState(trackEntityStateByMediaRef.current, trackEntityScopedKey);
    if (!saved) {
      setLaneLockMap({});
      input.setTranscriptionTrackMode('single');
      trackEntityHydratedKeyRef.current = trackEntityScopedKey;
      return;
    }
    setLaneLockMap(saved.laneLockMap);
    input.setTranscriptionTrackMode(saved.mode);
    trackEntityHydratedKeyRef.current = trackEntityScopedKey;
  }, [input, trackEntityScopedKey]);

  return {
    laneLockMap,
    setLaneLockMap,
    persistenceContext: {
      activeTextId: input.activeTextId,
      trackEntityScopedKey,
      trackEntityStateByMediaRef,
      trackEntityHydratedKeyRef,
    },
  };
}