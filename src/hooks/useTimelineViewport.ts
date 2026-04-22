import { useMemo } from 'react';
import type { TimelineViewportProjection, TimelineViewportZoomControls } from './timelineViewportTypes';
import { useZoom, type UseZoomInput } from './useZoom';

export type UseTimelineViewportInput = UseZoomInput & {
  /** Optional scroll position (px); when present, included on `projection` for read-model alignment. */
  waveformScrollLeft?: number;
};

export interface UseTimelineViewportResult {
  /** Read-only snapshot: zoom scalars + ruler window (+ optional scroll). */
  projection: TimelineViewportProjection;
  zoomToPercent: TimelineViewportZoomControls['zoomToPercent'];
  zoomToUnit: TimelineViewportZoomControls['zoomToUnit'];
}

function resolveLogicalDurationSec(input: UseZoomInput): number {
  const v = input.logicalTimelineDurationSec;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, v);
  return 0;
}

/**
 * Single hook boundary for timeline zoom / ruler / literature-axis pan (wraps `useZoom`).
 * Phase C: orchestration reads `projection` as the authoritative viewport snapshot for read model inputs.
 */
export function useTimelineViewport(input: UseTimelineViewportInput): UseTimelineViewportResult {
  const { waveformScrollLeft, ...zoomInput } = input;
  const { rulerView, zoomToPercent, zoomToUnit } = useZoom(zoomInput);

  const logicalTimelineDurationSec = resolveLogicalDurationSec(zoomInput);

  const projection = useMemo((): TimelineViewportProjection => ({
    viewportFrame: {
      scrollLeftPx: typeof waveformScrollLeft === 'number' && Number.isFinite(waveformScrollLeft)
        ? waveformScrollLeft
        : 0,
      pxPerDocSec: zoomInput.zoomPxPerSec,
      visibleStartSec: rulerView?.start ?? 0,
      visibleEndSec: rulerView?.end ?? 0,
    },
    rulerView,
    zoomPxPerSec: zoomInput.zoomPxPerSec,
    logicalTimelineDurationSec,
    zoomPercent: zoomInput.zoomPercent,
    maxZoomPercent: zoomInput.maxZoomPercent,
    fitPxPerSec: zoomInput.fitPxPerSec,
    ...(typeof waveformScrollLeft === 'number' && Number.isFinite(waveformScrollLeft)
      ? { waveformScrollLeft }
      : {}),
  }), [
    rulerView,
    zoomInput.zoomPxPerSec,
    logicalTimelineDurationSec,
    zoomInput.zoomPercent,
    zoomInput.maxZoomPercent,
    zoomInput.fitPxPerSec,
    waveformScrollLeft,
  ]);

  return {
    projection,
    zoomToPercent,
    zoomToUnit,
  };
}
