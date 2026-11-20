import { EDIT_OUTCOME_UNKNOWN } from '../app/desktopProjectReadPageAccess';
export const EDGE_MIN_MS = 10;
export const SNAP_PX = 8;

export type TimeEdge = 'start' | 'end';

export interface EdgeSelection {
  unitId: string;
  edge: TimeEdge | 'shared';
  otherId: string | null;
}

export interface TimedEdgeUnit {
  id: string;
  startMs: number;
  endMs: number;
}

const TIMECODE = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/;

/** A finished `HH:MM:SS.mmm`. Anything else stays a draft. */
export function parseTimecode(raw: string): number | null {
  const match = TIMECODE.exec(raw);
  if (!match) return null;
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (minutes > 59 || seconds > 59) return null;
  return ((Number(match[1]) * 60 + minutes) * 60 + seconds) * 1000 + Number(match[4]);
}

export function dragTimeMs(originMs: number, deltaPx: number, zoomPxPerSec: number): number {
  if (!(zoomPxPerSec > 0)) return originMs;
  return originMs + Math.round((deltaPx / zoomPxPerSec) * 1000);
}

export type SnapKind = 'neighbor' | 'playhead';

export function snapEdgeMs(input: {
  timeMs: number;
  zoomPxPerSec: number;
  neighborMs: readonly number[];
  playheadMs: number | null;
  alt: boolean;
}): { timeMs: number; kind: SnapKind | null } {
  if (input.alt || !(input.zoomPxPerSec > 0)) return { timeMs: input.timeMs, kind: null };
  const marks: { ms: number; kind: SnapKind }[] = input.neighborMs.map((ms) => ({
    ms,
    kind: 'neighbor',
  }));
  if (input.playheadMs !== null) marks.push({ ms: input.playheadMs, kind: 'playhead' });
  let best: { ms: number; px: number; kind: SnapKind } | null = null;
  for (const mark of marks) {
    const px = (Math.abs(mark.ms - input.timeMs) / 1000) * input.zoomPxPerSec;
    if (px <= SNAP_PX && (best === null || px < best.px))
      best = { ms: mark.ms, px, kind: mark.kind };
  }
  if (best === null) return { timeMs: input.timeMs, kind: null };
  return { timeMs: best.ms, kind: best.kind };
}

export function sharedEdge(units: readonly TimedEdgeUnit[], unitId: string): EdgeSelection | null {
  const pair = touchingPair(units, unitId, 'end') ?? touchingPair(units, unitId, 'start');
  if (!pair) return null;
  return {
    unitId,
    edge: 'shared',
    otherId: pair.leftId === unitId ? pair.rightId : pair.leftId,
  };
}

export function touchingPair(
  units: readonly TimedEdgeUnit[],
  unitId: string,
  edge: TimeEdge,
): { leftId: string; rightId: string; timeMs: number } | null {
  const unit = units.find((item) => item.id === unitId);
  if (!unit) return null;
  if (edge === 'end') {
    const right = units.find((item) => item.id !== unitId && item.startMs === unit.endMs);
    return right ? { leftId: unit.id, rightId: right.id, timeMs: unit.endMs } : null;
  }
  const left = units.find((item) => item.id !== unitId && item.endMs === unit.startMs);
  return left ? { leftId: left.id, rightId: unit.id, timeMs: unit.startMs } : null;
}

/** The touching pair a shared selection names; `otherId` says which side. */
export function selectedPair(
  units: readonly TimedEdgeUnit[],
  selected: EdgeSelection,
): { leftId: string; rightId: string; timeMs: number } | null {
  const after = touchingPair(units, selected.unitId, 'end');
  const before = touchingPair(units, selected.unitId, 'start');
  if (selected.otherId !== null) {
    if (after?.rightId === selected.otherId) return after;
    if (before?.leftId === selected.otherId) return before;
    return null;
  }
  return after ?? before;
}

/** start → end → shared with the next unit → shared with the previous unit (shared only when touching). */
export function cycleEdge(
  units: readonly TimedEdgeUnit[],
  unitId: string,
  current: EdgeSelection | null,
): EdgeSelection | null {
  if (!units.some((unit) => unit.id === unitId)) return null;
  const options: EdgeSelection[] = [
    { unitId, edge: 'start', otherId: null },
    { unitId, edge: 'end', otherId: null },
  ];
  const after = touchingPair(units, unitId, 'end');
  if (after) options.push({ unitId, edge: 'shared', otherId: after.rightId });
  const before = touchingPair(units, unitId, 'start');
  if (before) options.push({ unitId, edge: 'shared', otherId: before.leftId });
  const index =
    current?.unitId === unitId
      ? options.findIndex(
          (option) => option.edge === current.edge && option.otherId === current.otherId,
        )
      : -1;
  return options[(index + 1) % options.length] ?? null;
}

/** Which edge the selection names, for the visible status text. */
export function edgeFocusKind(
  units: readonly TimedEdgeUnit[],
  selected: EdgeSelection,
): 'start' | 'end' | 'sharedNext' | 'sharedPrev' {
  if (selected.edge !== 'shared') return selected.edge;
  const pair = selectedPair(units, selected);
  return pair?.leftId === selected.unitId ? 'sharedNext' : 'sharedPrev';
}

export function neighborTargets(
  units: readonly TimedEdgeUnit[],
  movingIds: readonly string[],
): number[] {
  const skip = new Set(movingIds);
  const targets: number[] = [];
  for (const unit of units) {
    if (skip.has(unit.id)) continue;
    targets.push(unit.startMs, unit.endMs);
  }
  return targets;
}

export interface DragPreview {
  unitId: string;
  startMs: number;
  endMs: number;
  otherId: string | null;
  otherStartMs: number | null;
  otherEndMs: number | null;
  timeMs: number;
  kind: SnapKind | null;
}

export function previewDrag(input: {
  unit: TimedEdgeUnit;
  edge: TimeEdge;
  shared: { leftId: string; rightId: string; timeMs: number } | null;
  deltaPx: number;
  zoomPxPerSec: number;
  units: readonly TimedEdgeUnit[];
  playheadMs: number | null;
  alt: boolean;
}): DragPreview {
  const origin = input.shared
    ? input.shared.timeMs
    : input.edge === 'start'
      ? input.unit.startMs
      : input.unit.endMs;
  const snapped = snapEdgeMs({
    timeMs: dragTimeMs(origin, input.deltaPx, input.zoomPxPerSec),
    zoomPxPerSec: input.zoomPxPerSec,
    neighborMs: neighborTargets(
      input.units,
      input.shared ? [input.shared.leftId, input.shared.rightId] : [input.unit.id],
    ),
    playheadMs: input.playheadMs,
    alt: input.alt,
  });
  if (input.shared) {
    const left = input.units.find((item) => item.id === input.shared?.leftId);
    const right = input.units.find((item) => item.id === input.shared?.rightId);
    if (!left || !right) {
      return {
        unitId: input.unit.id,
        startMs: input.unit.startMs,
        endMs: input.unit.endMs,
        otherId: null,
        otherStartMs: null,
        otherEndMs: null,
        timeMs: snapped.timeMs,
        kind: snapped.kind,
      };
    }
    const draggingLeft = input.unit.id === left.id;
    return {
      unitId: input.unit.id,
      startMs: draggingLeft ? left.startMs : snapped.timeMs,
      endMs: draggingLeft ? snapped.timeMs : right.endMs,
      otherId: draggingLeft ? right.id : left.id,
      otherStartMs: draggingLeft ? snapped.timeMs : left.startMs,
      otherEndMs: draggingLeft ? right.endMs : snapped.timeMs,
      timeMs: snapped.timeMs,
      kind: snapped.kind,
    };
  }
  return {
    unitId: input.unit.id,
    startMs: input.edge === 'start' ? snapped.timeMs : input.unit.startMs,
    endMs: input.edge === 'end' ? snapped.timeMs : input.unit.endMs,
    otherId: null,
    otherStartMs: null,
    otherEndMs: null,
    timeMs: snapped.timeMs,
    kind: snapped.kind,
  };
}

export function edgeRejectKind(
  message: string,
):
  | 'overlap'
  | 'outside'
  | 'outsideParent'
  | 'short'
  | 'createShort'
  | 'noParent'
  | 'hasChildren'
  | 'apart'
  | 'order'
  | 'unknown'
  | 'failed' {
  if (message.includes(EDIT_OUTCOME_UNKNOWN)) return 'unknown';
  if (message.includes('same speaker intervals overlap')) return 'overlap';
  if (message.includes('edge is outside the media')) return 'outside';
  if (message.includes('edge span is under 10ms')) return 'short';
  if (message.includes('unit has time subdivisions')) return 'hasChildren';
  if (message.includes('time subdivision is outside its parent')) return 'outsideParent';
  if (message.includes('time subdivision')) return 'noParent';
  if (message.includes('boundary units are not adjacent')) return 'apart';
  if (message.includes('timed units are out of sort order')) return 'order';
  return 'failed';
}
