import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';

type RegionUpdateHandler = (regionId: string, start: number, end: number) => void;

/**
 * RAF-coalesces WaveSurfer region drag updates; flush on drag end.
 * Extracted from useTranscriptionWaveformBridgeController to reduce controller size.
 */
export function useWaveformBridgeRegionDragRaf(
  handleWaveformRegionUpdateRef: MutableRefObject<RegionUpdateHandler | undefined>,
  handleWaveformRegionUpdateEndRef: MutableRefObject<RegionUpdateHandler | undefined>,
): {
  onRegionUpdate: (regionId: string, start: number, end: number) => void;
  onRegionUpdateEnd: (regionId: string, start: number, end: number) => void;
} {
  const pendingDragUpdateRef = useRef<{ regionId: string; start: number; end: number } | null>(
    null,
  );
  const dragUpdateRafRef = useRef<number | null>(null);

  const onRegionUpdate = useCallback(
    (regionId: string, start: number, end: number) => {
      pendingDragUpdateRef.current = { regionId, start, end };
      if (dragUpdateRafRef.current !== null) return;
      dragUpdateRafRef.current = requestAnimationFrame(() => {
        dragUpdateRafRef.current = null;
        const pending = pendingDragUpdateRef.current;
        pendingDragUpdateRef.current = null;
        if (!pending) return;
        handleWaveformRegionUpdateRef.current?.(pending.regionId, pending.start, pending.end);
      });
    },
    [handleWaveformRegionUpdateRef],
  );

  const onRegionUpdateEnd = useCallback(
    (regionId: string, start: number, end: number) => {
      if (dragUpdateRafRef.current !== null) {
        cancelAnimationFrame(dragUpdateRafRef.current);
        dragUpdateRafRef.current = null;
      }
      pendingDragUpdateRef.current = null;
      handleWaveformRegionUpdateEndRef.current?.(regionId, start, end);
    },
    [handleWaveformRegionUpdateEndRef],
  );

  useEffect(
    () => () => {
      if (dragUpdateRafRef.current !== null) {
        cancelAnimationFrame(dragUpdateRafRef.current);
        dragUpdateRafRef.current = null;
      }
      pendingDragUpdateRef.current = null;
    },
    [],
  );

  return { onRegionUpdate, onRegionUpdateEnd };
}
