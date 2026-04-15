import type { UtteranceDocType } from '../db';
import type { TimelineUnitView } from '../hooks/timelineUnitView';

/** Resolve backing utterance doc for speaker/batch/AI tools from a unified row view. */
export function utteranceDocForSpeakerTargetFromUnitView(
  view: TimelineUnitView | null | undefined,
  getUtteranceDocById: (id: string) => UtteranceDocType | undefined,
): UtteranceDocType | null {
  if (!view) return null;
  if (view.kind === 'utterance') return getUtteranceDocById(view.id) ?? null;
  const pid = view.parentUtteranceId?.trim();
  return pid ? getUtteranceDocById(pid) ?? null : null;
}

export function resolveSpeakerTargetUtteranceIdFromUnitId(
  unitId: string,
  unitViewById: ReadonlyMap<string, TimelineUnitView>,
): string | undefined {
  const view = unitViewById.get(unitId);
  if (!view) return undefined;
  if (view.kind === 'utterance') return view.id;
  return view.parentUtteranceId?.trim() || undefined;
}

export function utteranceUnitsOnMedia(units: ReadonlyArray<TimelineUnitView>): TimelineUnitView[] {
  return units.filter((u) => u.kind === 'utterance');
}

export function findUtteranceUnitById(
  units: ReadonlyArray<TimelineUnitView>,
  id: string,
): TimelineUnitView | undefined {
  const row = units.find((x) => x.id === id);
  return row?.kind === 'utterance' ? row : undefined;
}

/** Time-subdivision: parent by `parentUtteranceId` or containment of segment bounds. */
export function findParentUtteranceUnitForSegment(
  units: ReadonlyArray<TimelineUnitView>,
  segment: { parentUtteranceId?: string; startTime: number; endTime: number },
): TimelineUnitView | undefined {
  if (segment.parentUtteranceId) {
    return findUtteranceUnitById(units, segment.parentUtteranceId);
  }
  return utteranceUnitsOnMedia(units).find(
    (u) => u.startTime <= segment.startTime + 0.01 && u.endTime >= segment.endTime - 0.01,
  );
}

/** Subdivision: utterance that fully contains [innerStart, innerEnd]. */
export function findUtteranceContainingTimeRange(
  units: ReadonlyArray<TimelineUnitView>,
  innerStart: number,
  innerEnd: number,
): TimelineUnitView | undefined {
  return utteranceUnitsOnMedia(units).find(
    (u) => u.startTime <= innerStart + 0.01 && u.endTime >= innerEnd - 0.01,
  );
}

/** Independent segment: any utterance overlapping the range (open interval tolerance). */
export function findOverlappingUtteranceUnit(
  units: ReadonlyArray<TimelineUnitView>,
  rangeStart: number,
  rangeEnd: number,
): TimelineUnitView | undefined {
  return utteranceUnitsOnMedia(units).find(
    (u) => u.startTime <= rangeEnd - 0.01 && u.endTime >= rangeStart + 0.01,
  );
}

export type ParentUtteranceBounds = {
  id: string;
  startTime: number;
  endTime: number;
  speakerId?: string;
};

/** Batch merge: shared parent id wins; else utterance containing [first.start, last.end]. */
export function findParentUtteranceForMergedSegmentRange(
  units: ReadonlyArray<TimelineUnitView>,
  firstSegment: { parentUtteranceId?: string; startTime: number },
  lastSegment: { parentUtteranceId?: string; endTime: number },
): TimelineUnitView | undefined {
  if (
    firstSegment.parentUtteranceId
    && firstSegment.parentUtteranceId === lastSegment.parentUtteranceId
  ) {
    return findUtteranceUnitById(units, firstSegment.parentUtteranceId);
  }
  return utteranceUnitsOnMedia(units).find(
    (u) => u.startTime <= firstSegment.startTime + 0.01 && u.endTime >= lastSegment.endTime - 0.01,
  );
}
