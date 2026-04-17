import type { TimelineUnitView } from '../hooks/timelineUnitView';

/** Resolve backing unit doc for speaker/batch/AI tools from a unified row view. */
export function unitDocForSpeakerTargetFromUnitView<T extends { id: string }>(
  view: TimelineUnitView | null | undefined,
  getUnitDocById: (id: string) => T | undefined,
): T | null {
  if (!view) return null;
  if (view.kind === 'unit') return getUnitDocById(view.id) ?? null;
  const pid = view.parentUnitId?.trim();
  return pid ? getUnitDocById(pid) ?? null : null;
}

export function resolveSpeakerTargetUnitIdFromUnitId(
  unitId: string,
  unitViewById: ReadonlyMap<string, TimelineUnitView>,
  resolveUnitViewById?: (unitId: string) => TimelineUnitView | undefined,
): string | undefined {
  const view = resolveUnitViewById?.(unitId) ?? unitViewById.get(unitId);
  if (!view) return undefined;
  if (view.kind === 'unit') return view.id;
  return view.parentUnitId?.trim() || undefined;
}

export function unitUnitsOnMedia(units: ReadonlyArray<TimelineUnitView>): TimelineUnitView[] {
  return units.filter((u) => u.kind === 'unit');
}

export function findUnitUnitById(
  units: ReadonlyArray<TimelineUnitView>,
  id: string,
): TimelineUnitView | undefined {
  const row = units.find((x) => x.id === id);
  return row?.kind === 'unit' ? row : undefined;
}

/** Time-subdivision: parent by `parentUnitId` or containment of segment bounds. */
export function findParentUnitUnitForSegment(
  units: ReadonlyArray<TimelineUnitView>,
  segment: { parentUnitId?: string; startTime: number; endTime: number },
): TimelineUnitView | undefined {
  if (segment.parentUnitId) {
    return findUnitUnitById(units, segment.parentUnitId);
  }
  return unitUnitsOnMedia(units).find(
    (u) => u.startTime <= segment.startTime + 0.01 && u.endTime >= segment.endTime - 0.01,
  );
}

/** Subdivision: unit that fully contains [innerStart, innerEnd]. */
export function findUnitContainingTimeRange(
  units: ReadonlyArray<TimelineUnitView>,
  innerStart: number,
  innerEnd: number,
): TimelineUnitView | undefined {
  return unitUnitsOnMedia(units).find(
    (u) => u.startTime <= innerStart + 0.01 && u.endTime >= innerEnd - 0.01,
  );
}

/** Independent segment: any unit overlapping the range (open interval tolerance). */
export function findOverlappingUnitUnit(
  units: ReadonlyArray<TimelineUnitView>,
  rangeStart: number,
  rangeEnd: number,
): TimelineUnitView | undefined {
  return unitUnitsOnMedia(units).find(
    (u) => u.startTime <= rangeEnd - 0.01 && u.endTime >= rangeStart + 0.01,
  );
}

export type ParentUnitBounds = {
  id: string;
  startTime: number;
  endTime: number;
  speakerId?: string | undefined;
};

/** Batch merge: shared parent id wins; else unit containing [first.start, last.end]. */
export function findParentUnitForMergedSegmentRange(
  units: ReadonlyArray<TimelineUnitView>,
  firstSegment: { parentUnitId?: string; startTime: number },
  lastSegment: { parentUnitId?: string; endTime: number },
): TimelineUnitView | undefined {
  if (
    firstSegment.parentUnitId
    && firstSegment.parentUnitId === lastSegment.parentUnitId
  ) {
    return findUnitUnitById(units, firstSegment.parentUnitId);
  }
  return unitUnitsOnMedia(units).find(
    (u) => u.startTime <= firstSegment.startTime + 0.01 && u.endTime >= lastSegment.endTime - 0.01,
  );
}
