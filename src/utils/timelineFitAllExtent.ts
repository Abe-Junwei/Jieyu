export type TimelineFitExtent = {
  start: number;
  end: number;
};

const MIN_EXTENT_SEC = 0.05;

/** Earliest start and latest end of timed rows. Empty text still counts. */
export function resolveAnnotationExtent(
  segments: ReadonlyArray<{ startTime: number; endTime: number }>,
): TimelineFitExtent | null {
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  for (const segment of segments) {
    if (!Number.isFinite(segment.startTime) || !Number.isFinite(segment.endTime)) continue;
    if (!(segment.endTime > segment.startTime)) continue;
    start = Math.min(start, segment.startTime);
    end = Math.max(end, segment.endTime);
  }
  if (!(end - start >= MIN_EXTENT_SEC)) return null;
  return { start, end };
}

/**
 * Zoom percent that places [start, end] across `fill` of the viewport.
 * 100 means the whole fit span fills the viewport. This does not use glyph width.
 */
export function resolveExtentFitZoomPercent(input: {
  fitSpanSec: number;
  extentSec: number;
  fill: number;
}): number {
  if (!(input.fitSpanSec > 0) || !(input.extentSec > 0) || !(input.fill > 0)) return 100;
  return Math.max(1, Math.round((input.fitSpanSec / input.extentSec) * input.fill * 100));
}
