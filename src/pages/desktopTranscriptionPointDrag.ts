import type { PointerEvent as ReactPointerEvent } from 'react';
import { clampPointMs, type PointView } from './desktopTranscriptionPointOps';

/** Bind preview-only drag; commit once on pointerup. Esc or pointercancel only clear preview. */
export function bindPointDrag(input: {
  event: ReactPointerEvent<HTMLElement>;
  point: PointView;
  layerId: string;
  msAt: (clientX: number) => number;
  durationSec: () => number;
  dragOrigin: { current: { pointId: string; layerId: string; timeMs: number } | null };
  setDrag: (preview: { layerId: string; pointId: string; timeMs: number } | null) => void;
  commitMove: (pointId: string, timeMs: number) => void;
}): void {
  const { event, point, layerId } = input;
  input.dragOrigin.current = { pointId: point.id, layerId, timeMs: point.timeMs };
  const target = event.currentTarget;
  if (typeof target.setPointerCapture === 'function') {
    target.setPointerCapture(event.pointerId);
  }
  const dropListeners = () => {
    target.removeEventListener('pointermove', onMove);
    target.removeEventListener('pointerup', onUp);
    target.removeEventListener('pointercancel', onCancel);
  };
  const release = (pointerId: number) => {
    if (typeof target.releasePointerCapture === 'function') {
      try {
        target.releasePointerCapture(pointerId);
      } catch {
        /* already released */
      }
    }
  };
  const clearPreview = () => {
    input.dragOrigin.current = null;
    input.setDrag(null);
  };
  const onMove = (move: PointerEvent) => {
    if (input.dragOrigin.current?.pointId !== point.id) return;
    input.setDrag({
      layerId,
      pointId: point.id,
      timeMs: clampPointMs(input.msAt(move.clientX), input.durationSec()),
    });
  };
  const onUp = (up: PointerEvent) => {
    release(up.pointerId);
    dropListeners();
    const preview = input.dragOrigin.current;
    clearPreview();
    if (preview === null) return;
    const next = clampPointMs(input.msAt(up.clientX), input.durationSec());
    if (next === preview.timeMs) return;
    input.commitMove(preview.pointId, next);
  };
  const onCancel = (cancel: PointerEvent) => {
    release(cancel.pointerId);
    dropListeners();
    clearPreview();
  };
  target.addEventListener('pointermove', onMove);
  target.addEventListener('pointerup', onUp);
  target.addEventListener('pointercancel', onCancel);
}
