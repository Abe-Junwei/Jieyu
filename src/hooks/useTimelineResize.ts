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
  utteranceId: string;
  mediaId: string;
  edge: 'start' | 'end';
  startClientX: number;
  initialStart: number;
  initialEnd: number;
  latestStart: number;
  latestEnd: number;
} | null;

type TimelineResizeUtterance = {
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
  selectUtterance: (id: string) => void;
  setSelectedLayerId: (id: string) => void;
  setFocusedLayerRowId: (id: string) => void;
  beginTimingGesture: (id: string) => void;
  endTimingGesture: (id: string) => void;
  getNeighborBounds: (utteranceId: string, mediaId: string | undefined, probeStart: number) => { left: number; right: number | undefined };
  makeSnapGuide: (bounds: { left: number; right: number | undefined }, start: number, end: number) => SnapGuide;
  snapEnabled: boolean;
  setSnapGuide: React.Dispatch<React.SetStateAction<SnapGuide>>;
  setDragPreview: React.Dispatch<React.SetStateAction<{ id: string; start: number; end: number } | null>>;
  saveUtteranceTiming: (utteranceId: string, start: number, end: number) => Promise<void>;
};

export function useTimelineResize({
  zoomPxPerSec,
  manualSelectTsRef,
  player,
  selectUtterance,
  setSelectedLayerId,
  setFocusedLayerRowId,
  beginTimingGesture,
  endTimingGesture,
  getNeighborBounds,
  makeSnapGuide,
  snapEnabled,
  setSnapGuide,
  setDragPreview,
  saveUtteranceTiming,
}: UseTimelineResizeParams) {
  const [timelineResizeTooltip, setTimelineResizeTooltip] = useState<TimelineResizeTooltip>(null);
  const timelineResizeDragRef = useRef<ResizeDragState>(null);

  const startTimelineResizeDrag = useCallback((
    event: React.PointerEvent<HTMLElement>,
    utterance: TimelineResizeUtterance,
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
    selectUtterance(utterance.id);
    if (layerId) {
      setSelectedLayerId(layerId);
      setFocusedLayerRowId(layerId);
    }

    beginTimingGesture(utterance.id);

    timelineResizeDragRef.current = {
      utteranceId: utterance.id,
      mediaId: utterance.mediaId ?? '',
      edge,
      startClientX: event.clientX,
      initialStart: utterance.startTime,
      initialEnd: utterance.endTime,
      latestStart: utterance.startTime,
      latestEnd: utterance.endTime,
    };
    setDragPreview({ id: utterance.id, start: utterance.startTime, end: utterance.endTime });
    setTimelineResizeTooltip({
      x: event.clientX,
      y: event.clientY,
      start: utterance.startTime,
      end: utterance.endTime,
    });

    const onMove = (ev: PointerEvent) => {
      const drag = timelineResizeDragRef.current;
      if (!drag || zoomPxPerSec <= 0) return;

      const deltaSec = (ev.clientX - drag.startClientX) / zoomPxPerSec;
      const minSpan = 0.05;
      const bounds = getNeighborBounds(drag.utteranceId, drag.mediaId, drag.initialStart);
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
      setDragPreview({ id: drag.utteranceId, start: nextStart, end: nextEnd });
      setTimelineResizeTooltip({
        x: ev.clientX,
        y: ev.clientY,
        start: nextStart,
        end: nextEnd,
      });

      const liveBounds = getNeighborBounds(drag.utteranceId, drag.mediaId, nextStart);
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
      endTimingGesture(drag.utteranceId);

      const bounds = getNeighborBounds(drag.utteranceId, drag.mediaId, finalStart);
      setSnapGuide(makeSnapGuide(bounds, finalStart, finalEnd));
      fireAndForget(saveUtteranceTiming(drag.utteranceId, finalStart, finalEnd));
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [
    zoomPxPerSec,
    manualSelectTsRef,
    player,
    selectUtterance,
    setSelectedLayerId,
    setFocusedLayerRowId,
    beginTimingGesture,
    getNeighborBounds,
    setDragPreview,
    setSnapGuide,
    makeSnapGuide,
    snapEnabled,
    endTimingGesture,
    saveUtteranceTiming,
  ]);

  return {
    timelineResizeTooltip,
    startTimelineResizeDrag,
  };
}