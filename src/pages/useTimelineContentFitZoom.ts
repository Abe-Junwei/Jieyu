import { useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import {
  flattenTimelineContentFitSegments,
  resolveContentFitZoomPercent,
  type TimelineContentFitSegment,
} from '../utils/timelineContentFitZoom';

function contentFitSegmentSignature(segments: readonly TimelineContentFitSegment[]): string {
  let hash = segments.length >>> 0;
  for (const segment of segments) {
    const text = segment.text.trim();
    hash = Math.imul(hash, 33) ^ text.length;
    hash = Math.imul(hash, 33) ^ Math.round(segment.startTime * 1000);
    hash = Math.imul(hash, 33) ^ Math.round(segment.endTime * 1000);
    hash = Math.imul(hash, 33) ^ (text.codePointAt(0) ?? 0);
    hash = Math.imul(hash, 33) ^ (text.length > 0 ? text.charCodeAt(text.length - 1) : 0);
  }
  return `${segments.length}:${hash >>> 0}`;
}

/**
 * While zoom is still the default fit-all (100%), raise it until every visible
 * segment is wide enough for its text. Toolbar "fit all" returns to 100% and
 * stays there until the user leaves fit-all mode.
 */
export function useTimelineContentFitZoom(input: {
  zoomMode: 'fit-all' | 'fit-selection' | 'custom';
  zoomPercent: number;
  setZoomPercent: Dispatch<SetStateAction<number>>;
  fitPxPerSec: number;
  fitSpanSec: number;
  containerWidth: number;
  byLayer: ReadonlyMap<string, ReadonlyArray<TimelineContentFitSegment>>;
  currentMediaId?: string;
}): number {
  const {
    zoomMode,
    zoomPercent,
    setZoomPercent,
    fitPxPerSec,
    fitSpanSec,
    containerWidth,
    byLayer,
    currentMediaId,
  } = input;
  const segments = useMemo(
    () => flattenTimelineContentFitSegments(byLayer, currentMediaId),
    [byLayer, currentMediaId],
  );
  const contentFitZoomPercent = useMemo(
    () =>
      resolveContentFitZoomPercent({
        fitPxPerSec,
        fitSpanSec,
        segments,
      }),
    [fitPxPerSec, fitSpanSec, segments],
  );
  const segmentSignature = useMemo(() => contentFitSegmentSignature(segments), [segments]);
  const appliedSegmentSignatureRef = useRef<string | null>(null);
  const userHeldFitAllRef = useRef(false);

  useEffect(() => {
    if (zoomMode !== 'fit-all') {
      userHeldFitAllRef.current = false;
      return;
    }
    if (userHeldFitAllRef.current) return;
    if (!(containerWidth > 0) || !(fitPxPerSec > 0)) return;
    if (!(contentFitZoomPercent > 100)) return;

    if (zoomPercent === 100) {
      if (appliedSegmentSignatureRef.current === segmentSignature) {
        userHeldFitAllRef.current = true;
        return;
      }
      appliedSegmentSignatureRef.current = segmentSignature;
      setZoomPercent(contentFitZoomPercent);
      return;
    }

    appliedSegmentSignatureRef.current = segmentSignature;
    if (zoomPercent !== contentFitZoomPercent) {
      setZoomPercent(contentFitZoomPercent);
    }
  }, [
    containerWidth,
    contentFitZoomPercent,
    fitPxPerSec,
    segmentSignature,
    setZoomPercent,
    zoomMode,
    zoomPercent,
  ]);

  return contentFitZoomPercent;
}
