import { useMemo } from 'react';
import {
  flattenTimelineContentFitSegments,
  resolveContentFitZoomPercent,
  type TimelineContentFitSegment,
} from '../utils/timelineContentFitZoom';

/** Slider ceiling only. Fit-all does not apply this percent. */
export function useTimelineContentFitZoom(input: {
  fitPxPerSec: number;
  fitSpanSec: number;
  byLayer: ReadonlyMap<string, ReadonlyArray<TimelineContentFitSegment>>;
  currentMediaId?: string;
}): number {
  const { fitPxPerSec, fitSpanSec, byLayer, currentMediaId } = input;
  const segments = useMemo(
    () => flattenTimelineContentFitSegments(byLayer, currentMediaId),
    [byLayer, currentMediaId],
  );
  return useMemo(
    () =>
      resolveContentFitZoomPercent({
        fitPxPerSec,
        fitSpanSec,
        segments,
      }),
    [fitPxPerSec, fitSpanSec, segments],
  );
}
