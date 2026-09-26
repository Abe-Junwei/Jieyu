/** Chrome around the segment label: item padding plus the text input's horizontal padding. */
export const TIMELINE_SEGMENT_TEXT_CHROME_PX = 36;

/**
 * One em at `.timeline-text-input`'s default font size.
 * Wide enough for CJK and Tibetan, so Latin lines are a little loose rather than clipped.
 */
export const TIMELINE_SEGMENT_TEXT_EM_PX = 14;

/** Browser layout ceiling. Beyond this, content-fit zoom stops growing. */
export const TIMELINE_CONTENT_FIT_MAX_SCROLL_PX = 6_000_000;

export type TimelineContentFitSegment = {
  startTime: number;
  endTime: number;
  text: string;
  mediaId?: string;
};

export function estimateTimelineSegmentTextWidthPx(text: string): number {
  const chars = [...text.trim()].length;
  if (chars === 0) return 0;
  return TIMELINE_SEGMENT_TEXT_CHROME_PX + chars * TIMELINE_SEGMENT_TEXT_EM_PX;
}

/** Strictest pixels-per-second required for every segment's text to fit its time span. */
export function resolveContentFitPxPerSec(
  segments: ReadonlyArray<TimelineContentFitSegment>,
): number {
  let maxPxPerSec = 0;
  for (const segment of segments) {
    const durationSec = segment.endTime - segment.startTime;
    if (!(durationSec > 0)) continue;
    const textWidthPx = estimateTimelineSegmentTextWidthPx(segment.text);
    if (!(textWidthPx > 0)) continue;
    const pxPerSec = textWidthPx / durationSec;
    if (pxPerSec > maxPxPerSec) maxPxPerSec = pxPerSec;
  }
  return maxPxPerSec;
}

/**
 * Zoom percent relative to fit-all (100 = entire span in the viewport).
 * Returns 100 when the fit-all zoom already shows every segment's text.
 */
export function resolveContentFitZoomPercent(input: {
  fitPxPerSec: number;
  fitSpanSec: number;
  segments: ReadonlyArray<TimelineContentFitSegment>;
}): number {
  if (!(input.fitPxPerSec > 0)) return 100;
  const contentPxPerSec = resolveContentFitPxPerSec(input.segments);
  if (!(contentPxPerSec > input.fitPxPerSec)) return 100;
  const spanCapPxPerSec =
    input.fitSpanSec > 0 ? TIMELINE_CONTENT_FIT_MAX_SCROLL_PX / input.fitSpanSec : contentPxPerSec;
  const targetPxPerSec = Math.min(contentPxPerSec, spanCapPxPerSec);
  if (!(targetPxPerSec > input.fitPxPerSec)) return 100;
  return Math.max(100, Math.ceil((targetPxPerSec / input.fitPxPerSec) * 100));
}

export function flattenTimelineContentFitSegments(
  byLayer: ReadonlyMap<string, ReadonlyArray<TimelineContentFitSegment>>,
  currentMediaId?: string,
): TimelineContentFitSegment[] {
  const mediaId = currentMediaId?.trim() ?? '';
  const segments: TimelineContentFitSegment[] = [];
  for (const rows of byLayer.values()) {
    for (const row of rows) {
      const rowMediaId = row.mediaId ?? '';
      if (mediaId.length > 0 && rowMediaId.length > 0 && rowMediaId !== mediaId) continue;
      segments.push({
        startTime: row.startTime,
        endTime: row.endTime,
        text: row.text,
        ...(rowMediaId.length > 0 ? { mediaId: rowMediaId } : {}),
      });
    }
  }
  return segments;
}
