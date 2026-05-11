import type { LayerUnitDocType } from '../types/jieyuDbDocTypes';
import type { TimelineUnitView } from '../hooks/transcription/timelineUnitView';

export function isTimelineUnitView(
  item: TimelineUnitView | LayerUnitDocType,
): item is TimelineUnitView {
  const kind = (item as TimelineUnitView).kind;
  return kind === 'unit' || kind === 'segment';
}

type OverlapLike = {
  id: string;
  startTime: number;
  endTime: number;
};

export function hasOverlappingTimeRanges(items: OverlapLike[]): boolean {
  if (items.length < 2) return false;
  const sorted = [...items].sort((a, b) => {
    if (a.startTime !== b.startTime) return a.startTime - b.startTime;
    if (a.endTime !== b.endTime) return a.endTime - b.endTime;
    return a.id.localeCompare(b.id);
  });
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index]!.startTime < sorted[index - 1]!.endTime) {
      return true;
    }
  }
  return false;
}
