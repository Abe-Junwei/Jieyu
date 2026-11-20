import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import { EDGE_MIN_MS } from './desktopTranscriptionEdge';

const DRAG_THRESHOLD_PX = 4;

/**
 * Drag on the waveform to create a unit. A press that never moves past the threshold is left to
 * the waveform's own click-to-seek; a real drag swallows the trailing click.
 */
export function useDesktopWaveformCreate(input: {
  hostRef: RefObject<HTMLElement | null>;
  zoomPxPerSec: number;
  scrollLeftPx: number;
  enabled: boolean;
  createRangeRef: MutableRefObject<((startMs: number, endMs: number) => void) | null>;
}) {
  const live = useRef(input);
  live.current = input;
  const [range, setRange] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const host = input.hostRef.current;
    if (!host) return undefined;
    const onDown = (event: PointerEvent) => {
      const current = live.current;
      if (event.button !== 0 || !current.enabled || !(current.zoomPxPerSec > 0)) return;
      const rect = host.getBoundingClientRect();
      const originX = event.clientX;
      const toMs = (clientX: number) =>
        Math.max(
          0,
          Math.round(
            ((clientX - rect.left + live.current.scrollLeftPx) / live.current.zoomPxPerSec) * 1000,
          ),
        );
      let dragged = false;
      const onMove = (move: PointerEvent) => {
        if (!dragged && Math.abs(move.clientX - originX) < DRAG_THRESHOLD_PX) return;
        dragged = true;
        const a = Math.min(originX, move.clientX) - rect.left;
        setRange({ left: a, width: Math.abs(move.clientX - originX) });
      };
      const finish = (up: PointerEvent) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        setRange(null);
        if (!dragged) return;
        const swallow = (click: MouseEvent) => click.stopPropagation();
        host.addEventListener('click', swallow, { capture: true, once: true });
        window.setTimeout(() => host.removeEventListener('click', swallow, true), 0);
        const startMs = toMs(Math.min(originX, up.clientX));
        const endMs = toMs(Math.max(originX, up.clientX));
        if (up.type === 'pointerup' && endMs - startMs >= EDGE_MIN_MS) {
          live.current.createRangeRef.current?.(startMs, endMs);
        }
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    };
    host.addEventListener('pointerdown', onDown);
    return () => host.removeEventListener('pointerdown', onDown);
  }, [input.hostRef, input.enabled]);

  return range;
}
