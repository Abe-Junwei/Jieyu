import { useCallback, useRef, useState } from 'react';
import { snapToZeroCrossing } from '../services/AudioAnalysisService';
import { fireAndForget } from '../utils/fireAndForget';
import type { SnapGuide } from './useTranscriptionData';

type TimelineResizeTooltip = {
  x: number;
  y: number;
  start: number;
  end: number;
} | null;

type ResizeDragState = {
  unitId: string;
  /** 独立边界层的 segment 真实 DB ID，仅在有 layerId 时有值 | Real segment DB ID for independent-boundary layers */
  segmentId?: string;
  mediaId: string;
  layerId?: string;
  edge: 'start' | 'end';
  startClientX: number;
  initialStart: number;
  initialEnd: number;
  latestStart: number;
  latestEnd: number;
} | null;

type TimelineResizeUnit = {
  id: string;
  mediaId?: string;
  startTime: number;
  endTime: number;
};

type UseTimelineResizeParams = {
  zoomPxPerSec: number;
  manualSelectTsRef: React.MutableRefObject<number>;
  player: {
    isPlaying: boolean;
    stop: () => void;
    instanceRef: React.MutableRefObject<{
      getDecodedData: () => AudioBuffer | null;
    } | null>;
  };
  selectUnit: (id: string) => void;
  selectSegment?: (id: string) => void;
  setSelectedLayerId: (id: string) => void;
  setFocusedLayerRowId: (id: string) => void;
  beginTimingGesture: (id: string) => void;
  endTimingGesture: (id: string) => void;
  getNeighborBounds: (unitId: string, mediaId: string | undefined, probeStart: number, layerId?: string) => { left: number; right: number | undefined };
  makeSnapGuide: (bounds: { left: number; right: number | undefined }, start: number, end: number) => SnapGuide;
  snapEnabled: boolean;
  setSnapGuide: React.Dispatch<React.SetStateAction<SnapGuide>>;
  setDragPreview: React.Dispatch<React.SetStateAction<{ id: string; start: number; end: number } | null>>;
  saveUnitTiming: (unitId: string, start: number, end: number, layerId?: string) => Promise<void>;
  /** 独立边界层的 segments，按 layerId 分组 | Segments for independent-boundary layers, grouped by layerId */
  segmentsByLayer?: Map<string, Array<{ id: string; startTime: number; endTime: number }>>;
};

export function useTimelineResize({
  zoomPxPerSec,
  manualSelectTsRef,
  player,
  selectUnit,
  selectSegment,
  setSelectedLayerId,
  setFocusedLayerRowId,
  beginTimingGesture,
  endTimingGesture,
  getNeighborBounds,
  makeSnapGuide,
  snapEnabled,
  setSnapGuide,
  setDragPreview,
  saveUnitTiming,
  segmentsByLayer,
}: UseTimelineResizeParams) {
  const [timelineResizeTooltip, setTimelineResizeTooltip] = useState<TimelineResizeTooltip>(null);
  const timelineResizeDragRef = useRef<ResizeDragState>(null);

  const startTimelineResizeDrag = useCallback((
    event: React.PointerEvent<HTMLElement>,
    unit: TimelineResizeUnit,
    edge: 'start' | 'end',
    layerId?: string,
  ) => {
    if (event.button !== 0) return;
    if (zoomPxPerSec <= 0) return;
    event.preventDefault();
    event.stopPropagation();

    manualSelectTsRef.current = Date.now();
    if (player.isPlaying) {
      player.stop();
    }
    const layerSegments = layerId && segmentsByLayer ? segmentsByLayer.get(layerId) : undefined;
    const resolvedSegmentId = layerSegments?.find((segment) => segment.id === unit.id)?.id;
    if (resolvedSegmentId && selectSegment) {
      selectSegment(unit.id);
    } else {
      selectUnit(unit.id);
    }
    if (layerId) {
      setSelectedLayerId(layerId);
      setFocusedLayerRowId(layerId);
    }

    beginTimingGesture(unit.id);

    timelineResizeDragRef.current = {
      unitId: unit.id,
      mediaId: unit.mediaId ?? '',
      ...(layerId !== undefined && { layerId }),
      ...(resolvedSegmentId !== undefined && { segmentId: resolvedSegmentId }),
      edge,
      startClientX: event.clientX,
      initialStart: unit.startTime,
      initialEnd: unit.endTime,
      latestStart: unit.startTime,
      latestEnd: unit.endTime,
    };
    setDragPreview({ id: unit.id, start: unit.startTime, end: unit.endTime });
    setTimelineResizeTooltip({
      x: event.clientX,
      y: event.clientY,
      start: unit.startTime,
      end: unit.endTime,
    });

    const onMove = (ev: PointerEvent) => {
      const drag = timelineResizeDragRef.current;
      if (!drag || zoomPxPerSec <= 0) return;

      const deltaSec = (ev.clientX - drag.startClientX) / zoomPxPerSec;
      const minSpan = 0.05;
      const bounds = getNeighborBounds(drag.segmentId ?? drag.unitId, drag.mediaId, drag.initialStart, drag.layerId);
      const rightBound = typeof bounds.right === 'number' ? bounds.right : Number.POSITIVE_INFINITY;
      let nextStart = drag.initialStart;
      let nextEnd = drag.initialEnd;

      if (drag.edge === 'start') {
        const lower = bounds.left;
        const upper = Math.min(drag.initialEnd - minSpan, rightBound - minSpan);
        if (upper <= lower) {
          nextStart = lower;
        } else {
          const rawStart = drag.initialStart + deltaSec;
          nextStart = Math.max(lower, Math.min(upper, rawStart));
        }
      } else {
        const lower = Math.max(drag.initialStart + minSpan, bounds.left + minSpan);
        const upper = rightBound;
        if (upper <= lower) {
          nextEnd = lower;
        } else {
          const rawEnd = drag.initialEnd + deltaSec;
          nextEnd = Math.max(lower, Math.min(upper, rawEnd));
        }
      }

      drag.latestStart = nextStart;
      drag.latestEnd = nextEnd;
      setDragPreview({ id: drag.unitId, start: nextStart, end: nextEnd });
      setTimelineResizeTooltip({
        x: ev.clientX,
        y: ev.clientY,
        start: nextStart,
        end: nextEnd,
      });

      const liveBounds = getNeighborBounds(drag.segmentId ?? drag.unitId, drag.mediaId, nextStart, drag.layerId);
      setSnapGuide(makeSnapGuide(liveBounds, nextStart, nextEnd));
    };

    const onUp = () => {
      const drag = timelineResizeDragRef.current;
      timelineResizeDragRef.current = null;

      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);

      if (!drag) return;

      let finalStart = drag.latestStart;
      let finalEnd = drag.latestEnd;
      if (snapEnabled) {
        const ws = player.instanceRef.current;
        const buf = ws?.getDecodedData();
        if (buf) {
          const snapped = snapToZeroCrossing(buf, finalStart, finalEnd);
          finalStart = snapped.start;
          finalEnd = snapped.end;
        }
      }

      setDragPreview(null);
      setTimelineResizeTooltip(null);
      endTimingGesture(drag.unitId);

      const bounds = getNeighborBounds(drag.segmentId ?? drag.unitId, drag.mediaId, finalStart, drag.layerId);
      setSnapGuide(makeSnapGuide(bounds, finalStart, finalEnd));
      fireAndForget(saveUnitTiming(drag.segmentId ?? drag.unitId, finalStart, finalEnd, drag.layerId));
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [
    zoomPxPerSec,
    manualSelectTsRef,
    player,
    selectUnit,
    selectSegment,
    setSelectedLayerId,
    setFocusedLayerRowId,
    beginTimingGesture,
    getNeighborBounds,
    setDragPreview,
    setSnapGuide,
    makeSnapGuide,
    snapEnabled,
    endTimingGesture,
    saveUnitTiming,
    segmentsByLayer,
  ]);

  return {
    timelineResizeTooltip,
    startTimelineResizeDrag,
  };
}