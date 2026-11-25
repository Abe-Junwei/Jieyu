import type { PointerEvent as ReactPointerEvent } from 'react';
import { clampPointMs, type PointView } from './desktopTranscriptionPointOps';

/** Bind preview-only drag on window; commit once on pointerup. Esc / cancel clear preview. */
export function bindPointDrag(input: {
  event: ReactPointerEvent<HTMLElement>;
  point: PointView;
  layerId: string;
  msAt: (clientX: number) => number;
  durationSec: () => number;
  dragOrigin: { current: { pointId: string; layerId: string; timeMs: number } | null };
  setDrag: (preview: { layerId: string; pointId: string; timeMs: number } | null) => void;
  commitMove: (pointId: string, timeMs: number) => void;
}): () => void {
  const { point, layerId } = input;
  const pointerId = input.event.pointerId;
  const originX = input.event.clientX;
  const originMs = input.msAt(originX);
  let moved = false;
  const timeAt = (x: number) =>
    clampPointMs(point.timeMs + input.msAt(x) - originMs, input.durationSec());
  input.dragOrigin.current = { pointId: point.id, layerId, timeMs: point.timeMs };
  const dropListeners = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
  };
  const clearPreview = () => {
    input.dragOrigin.current = null;
    input.setDrag(null);
  };
  const onMove = (move: PointerEvent) => {
    if (move.pointerId !== pointerId) return;
    if (input.dragOrigin.current?.pointId !== point.id) return;
    if (!moved && Math.abs(move.clientX - originX) < 4) return;
    moved = true;
    input.setDrag({
      layerId,
      pointId: point.id,
      timeMs: timeAt(move.clientX),
    });
  };
  const onUp = (up: PointerEvent) => {
    if (up.pointerId !== pointerId) return;
    dropListeners();
    const preview = input.dragOrigin.current;
    clearPreview();
    if (preview === null || !moved) return;
    const next = timeAt(up.clientX);
    if (next === preview.timeMs) return;
    input.commitMove(preview.pointId, next);
  };
  const onCancel = (cancel: PointerEvent) => {
    if (cancel.pointerId !== pointerId) return;
    dropListeners();
    clearPreview();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  return () => {
    dropListeners();
    clearPreview();
  };
}
