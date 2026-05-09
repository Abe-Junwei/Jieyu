import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from 'react';
import type { useWaveSurfer } from '../hooks/useWaveSurfer';

type PlayerSlice = Pick<ReturnType<typeof useWaveSurfer>, 'isReady' | 'duration' | 'instanceRef'>;

/**
 * RAF-coalesced hover time + waveform scroll-left mirror state.
 */
export function useWaveformBridgeHoverScrollRaf(input: {
  waveCanvasRef: RefObject<HTMLDivElement | null>;
  player: PlayerSlice;
  zoomPxPerSec: number;
}): {
  hoverTime: { time: number; x: number; y: number } | null;
  waveformScrollLeft: number;
  scheduleHoverTime: (next: { time: number; x: number; y: number } | null) => void;
  commitWaveformScrollLeft: (nextScrollLeft: number) => void;
  scheduleWaveformScrollLeft: (nextScrollLeft: number) => void;
  handleWaveformAreaMouseMove: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleWaveformAreaMouseLeave: () => void;
} {
  const { waveCanvasRef, player, zoomPxPerSec } = input;
  const [hoverTime, setHoverTime] = useState<{ time: number; x: number; y: number } | null>(null);
  const pendingHoverTimeRef = useRef<{ time: number; x: number; y: number } | null | undefined>(
    undefined,
  );
  const hoverTimeRafRef = useRef<number | null>(null);
  const [waveformScrollLeft, setWaveformScrollLeft] = useState(0);
  const pendingWaveformScrollLeftRef = useRef<number | null>(null);
  const waveformScrollRafRef = useRef<number | null>(null);

  const scheduleHoverTime = useCallback((next: { time: number; x: number; y: number } | null) => {
    pendingHoverTimeRef.current = next;
    if (hoverTimeRafRef.current !== null) return;
    hoverTimeRafRef.current = requestAnimationFrame(() => {
      hoverTimeRafRef.current = null;
      const pending = pendingHoverTimeRef.current;
      pendingHoverTimeRef.current = undefined;
      if (pending === undefined) return;
      setHoverTime(pending);
    });
  }, []);

  const commitWaveformScrollLeft = useCallback((nextScrollLeft: number) => {
    setWaveformScrollLeft((prev) =>
      Math.abs(prev - nextScrollLeft) > 0.5 ? nextScrollLeft : prev,
    );
  }, []);

  const scheduleWaveformScrollLeft = useCallback(
    (nextScrollLeft: number) => {
      pendingWaveformScrollLeftRef.current = nextScrollLeft;
      if (waveformScrollRafRef.current !== null) return;
      waveformScrollRafRef.current = requestAnimationFrame(() => {
        waveformScrollRafRef.current = null;
        const pending = pendingWaveformScrollLeftRef.current;
        pendingWaveformScrollLeftRef.current = null;
        if (pending == null) return;
        commitWaveformScrollLeft(pending);
      });
    },
    [commitWaveformScrollLeft],
  );

  useEffect(
    () => () => {
      if (hoverTimeRafRef.current !== null) {
        cancelAnimationFrame(hoverTimeRafRef.current);
        hoverTimeRafRef.current = null;
      }
      pendingHoverTimeRef.current = undefined;
      if (waveformScrollRafRef.current !== null) {
        cancelAnimationFrame(waveformScrollRafRef.current);
        waveformScrollRafRef.current = null;
      }
      pendingWaveformScrollLeftRef.current = null;
    },
    [],
  );

  const handleWaveformAreaMouseMove = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const el = waveCanvasRef.current;
      if (!el || !player.isReady) {
        scheduleHoverTime(null);
        return;
      }
      const rect = el.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom + 30
      ) {
        scheduleHoverTime(null);
        return;
      }
      const ws = player.instanceRef.current;
      const scrollLeft = ws ? ws.getScroll() : 0;
      const time = (scrollLeft + (event.clientX - rect.left)) / zoomPxPerSec;
      scheduleHoverTime({
        time: Math.max(0, Math.min(time, player.duration)),
        x: event.clientX,
        y: rect.top - 4,
      });
    },
    [
      player.duration,
      player.instanceRef,
      player.isReady,
      scheduleHoverTime,
      waveCanvasRef,
      zoomPxPerSec,
    ],
  );

  const handleWaveformAreaMouseLeave = useCallback(() => {
    if (hoverTimeRafRef.current !== null) {
      cancelAnimationFrame(hoverTimeRafRef.current);
      hoverTimeRafRef.current = null;
    }
    pendingHoverTimeRef.current = undefined;
    setHoverTime(null);
  }, []);

  return {
    hoverTime,
    waveformScrollLeft,
    scheduleHoverTime,
    commitWaveformScrollLeft,
    scheduleWaveformScrollLeft,
    handleWaveformAreaMouseMove,
    handleWaveformAreaMouseLeave,
  };
}
