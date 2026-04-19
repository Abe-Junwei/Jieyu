import { useEffect, useRef, useState } from 'react';
import type { TranscriptionTrackDisplayMode } from '../hooks/useTranscriptionUIState';
import type { TrackEntityStateMap } from '../services/TrackEntityStore';
import { getTrackEntityState, loadTrackEntityStateMapFromDb } from '../services/TrackEntityStore';

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
  const { activeTextId, selectedTimelineMediaId, setTranscriptionTrackMode } = input;

  const trackEntityProjectKey = activeTextId?.trim() || '__no-project__';
  const trackEntityScopedKey = selectedTimelineMediaId ? `${trackEntityProjectKey}::${selectedTimelineMediaId}` : null;

  useEffect(() => {
    if (!activeTextId) return;
    let cancelled = false;

    loadTrackEntityStateMapFromDb(activeTextId).then((dbStateMap) => {
      if (cancelled) return;
      trackEntityStateByMediaRef.current = dbStateMap;
      if (trackEntityScopedKey) {
        const saved = dbStateMap[trackEntityScopedKey] ?? null;
        setLaneLockMap(saved?.laneLockMap ?? {});
        setTranscriptionTrackMode(saved?.mode ?? 'single');
        trackEntityHydratedKeyRef.current = trackEntityScopedKey;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeTextId, setTranscriptionTrackMode, trackEntityScopedKey]);

  useEffect(() => {
    if (!trackEntityScopedKey) {
      trackEntityHydratedKeyRef.current = null;
      setLaneLockMap({});
      setTranscriptionTrackMode('single');
      return;
    }
    if (trackEntityStateByMediaRef.current === null) return;
    const saved = getTrackEntityState(trackEntityStateByMediaRef.current, trackEntityScopedKey);
    if (!saved) {
      setLaneLockMap({});
      setTranscriptionTrackMode('single');
      trackEntityHydratedKeyRef.current = trackEntityScopedKey;
      return;
    }
    setLaneLockMap(saved.laneLockMap);
    setTranscriptionTrackMode(saved.mode);
    trackEntityHydratedKeyRef.current = trackEntityScopedKey;
  }, [setTranscriptionTrackMode, trackEntityScopedKey]);

  return {
    laneLockMap,
    setLaneLockMap,
    persistenceContext: {
      activeTextId,
      trackEntityScopedKey,
      trackEntityStateByMediaRef,
      trackEntityHydratedKeyRef,
    },
  };
}