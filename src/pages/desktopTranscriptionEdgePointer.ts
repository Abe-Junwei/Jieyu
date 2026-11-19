import type { PointerEvent as ReactPointerEvent } from 'react';
import { edgeKeyAction } from '../desktop/edgeKeys';
import { formatPlaybackTime } from './useDesktopTranscriptionMediaController';
import {
  previewDrag,
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
    if (action === 'deleteSegment') {
      const id = read.selectedUnitId();
      if (id === null) return;
      event.preventDefault();
      read.remove(id);
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

export function startEmptyCreate(input: {
  event: ReactPointerEvent<HTMLDivElement>;
  zoomPxPerSec: number;
  setPreview: (preview: ShownPreview | null) => void;
  commit: (startMs: number, endMs: number) => void;
}) {
  const event = input.event;
  if (event.button !== 0 || event.target !== event.currentTarget || !(input.zoomPxPerSec > 0))
    return;
  const zoom = input.zoomPxPerSec;
  const origin = event.currentTarget;
  const start = Math.round(((event.clientX - origin.getBoundingClientRect().left) / zoom) * 1000);
  let startMs = start;
  let endMs = start;
  listen(
    (pointer) => {
      const end = Math.round(
        ((pointer.clientX - origin.getBoundingClientRect().left) / zoom) * 1000,
      );
      startMs = Math.min(start, end);
      endMs = Math.max(start, end);
      input.setPreview({
        unitId: null,
        startMs,
        endMs,
        otherId: null,
        otherStartMs: null,
        otherEndMs: null,
        tip: null,
        x: pointer.clientX,
        y: pointer.clientY,
      });
    },
    () => {
      input.setPreview(null);
      if (endMs - startMs >= EDGE_MIN_MS) input.commit(startMs, endMs);
    },
  );
}
