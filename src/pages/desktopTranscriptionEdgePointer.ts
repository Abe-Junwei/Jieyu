import type { PointerEvent as ReactPointerEvent } from 'react';
import { edgeKeyAction } from '../desktop/edgeKeys';
import { formatPlaybackTime } from './useDesktopTranscriptionMediaController';
import {
  neighborTargets,
  previewDrag,
  snapEdgeMs,
  touchingPair,
  EDGE_MIN_MS,
  type EdgeSelection,
  type TimeEdge,
  type TimedEdgeUnit,
} from './desktopTranscriptionEdge';
export interface ShownPreview {
  unitId: string | null;
  startMs: number;
  endMs: number;
  otherId: string | null;
  otherStartMs: number | null;
  otherEndMs: number | null;
  tip: string | null;
  x: number;
  y: number;
}

export function bindEdgeKeys(read: {
  selectedUnitId: () => string | null;
  edge: () => EdgeSelection | null;
  undo: () => void;
  redo: () => void;
  remove: (unitId: string) => void;
  cycle: (unitId: string) => void;
  nudge: (edge: EdgeSelection, delta: number) => void;
}): () => void {
  const onKey = (event: KeyboardEvent) => {
    const action = edgeKeyAction(event);
    if (action === null) return;
    if (action === 'undo' || action === 'redo') {
      event.preventDefault();
      if (action === 'undo') read.undo();
      else read.redo();
      return;
    }
    if (action === 'deleteSegment' || action === 'cycleEdge') {
      const id = read.selectedUnitId();
      if (id === null) return;
      event.preventDefault();
      if (action === 'cycleEdge') read.cycle(id);
      else read.remove(id);
      return;
    }
    const selected = read.edge();
    if (selected === null) return;
    event.preventDefault();
    const step = action.endsWith('Coarse') ? 100 : 10;
    read.nudge(selected, (action.includes('Back') ? -1 : 1) * step);
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}

function listen(onMove: (event: PointerEvent) => void, onUp: () => void) {
  const move = (event: PointerEvent) => onMove(event);
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    onUp();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

export function startEdgeDrag(input: {
  unitId: string;
  edge: TimeEdge;
  event: ReactPointerEvent<HTMLElement>;
  units: readonly TimedEdgeUnit[];
  readZoom: () => number;
  playheadMs: () => number | null;
  snapMessage: (kind: 'neighbor' | 'playhead', time: string) => string;
  setPreview: (preview: ShownPreview | null) => void;
  select: (edge: EdgeSelection) => void;
  linked: boolean;
  commit: (
    shared: { leftId: string; rightId: string } | null,
    time: number,
    originMs: number,
  ) => void;
}) {
  const event = input.event;
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const unit = input.units.find((item) => item.id === input.unitId);
  if (!unit) return;
  const shared =
    event.shiftKey || input.linked ? touchingPair(input.units, input.unitId, input.edge) : null;
  const originMs = shared ? shared.timeMs : input.edge === 'start' ? unit.startMs : unit.endMs;
  const originX = event.clientX;
  input.select({
    unitId: input.unitId,
    edge: shared ? 'shared' : input.edge,
    otherId: shared ? (input.edge === 'end' ? shared.rightId : shared.leftId) : null,
  });
  let time = originMs;
  listen(
    (pointer) => {
      const next = previewDrag({
        unit,
        edge: input.edge,
        shared,
        deltaPx: pointer.clientX - originX,
        zoomPxPerSec: input.readZoom(),
        units: input.units,
        playheadMs: input.playheadMs(),
        alt: pointer.altKey,
      });
      time = next.timeMs;
      const tip =
        next.kind === null
          ? null
          : input.snapMessage(next.kind, formatPlaybackTime(next.timeMs / 1000));
      input.setPreview({ ...next, tip, x: pointer.clientX, y: pointer.clientY });
    },
    () => {
      input.setPreview(null);
      input.commit(shared, time, originMs);
    },
  );
}

/** Under this horizontal travel a press stays a click (seek / select). */
export const CREATE_DRAG_PX = 4;

/** Eats the click the browser sends after a create drag, so the drag does not also seek. */
function swallowNextClick() {
  const swallow = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
  };
  window.addEventListener('click', swallow, { capture: true, once: true });
  window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
}

/**
 * Press on empty time and drag to create a unit. Shared by the lane track and the waveform.
 * Snaps both ends like an edge drag (8px to neighbor edges and the playhead; Alt turns it off).
 */
export function startCreate(input: {
  event: ReactPointerEvent<HTMLElement>;
  msAt: (clientX: number) => number;
  zoomPxPerSec: number;
  units: readonly TimedEdgeUnit[];
  playheadMs: () => number | null;
  snapMessage: (kind: 'neighbor' | 'playhead', time: string) => string;
  setPreview: (preview: ShownPreview | null) => void;
  commit: (startMs: number, endMs: number) => void;
  tooShort: (endMs: number) => void;
}) {
  const event = input.event;
  if (event.button !== 0 || !(input.zoomPxPerSec > 0)) return;
  const pressMs = Math.round(input.msAt(event.clientX));
  if (input.units.some((unit) => pressMs >= unit.startMs && pressMs < unit.endMs)) return;
  const zoom = input.zoomPxPerSec;
  const snap = (timeMs: number, alt: boolean) =>
    snapEdgeMs({
      timeMs,
      zoomPxPerSec: zoom,
      neighborMs: neighborTargets(input.units, []),
      playheadMs: input.playheadMs(),
      alt,
    });
  const originX = event.clientX;
  let range: { startMs: number; endMs: number } | null = null;
  listen(
    (pointer) => {
      if (range === null && Math.abs(pointer.clientX - originX) <= CREATE_DRAG_PX) return;
      const start = snap(pressMs, pointer.altKey).timeMs;
      const end = snap(Math.round(input.msAt(pointer.clientX)), pointer.altKey);
      range = { startMs: Math.min(start, end.timeMs), endMs: Math.max(start, end.timeMs) };
      input.setPreview({
        unitId: null,
        ...range,
        otherId: null,
        otherStartMs: null,
        otherEndMs: null,
        tip:
          end.kind === null
            ? null
            : input.snapMessage(end.kind, formatPlaybackTime(end.timeMs / 1000)),
        x: pointer.clientX,
        y: pointer.clientY,
      });
    },
    () => {
      const done = range;
      if (done === null) return;
      input.setPreview(null);
      swallowNextClick();
      if (done.endMs - done.startMs < EDGE_MIN_MS) input.tooShort(done.endMs);
      else input.commit(done.startMs, done.endMs);
    },
  );
}
