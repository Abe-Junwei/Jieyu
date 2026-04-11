import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UtteranceDocType } from '../db';
import { computeLassoOutcome } from '../utils/waveformSelectionUtils';
import { fireAndForget } from '../utils/fireAndForget';
import type WaveSurfer from 'wavesurfer.js';
import { useLatest } from './useLatest';

type TimelineHitIndex = {
  isSortedByStart: boolean;
  starts: number[];
  prefixMaxEnds: number[];
};

function buildTimelineHitIndex(items: Array<{ startTime: number; endTime: number }>): TimelineHitIndex {
  if (items.length < 2) {
    const single = items[0];
    return {
      isSortedByStart: true,
      starts: single ? [single.startTime] : [],
      prefixMaxEnds: single ? [single.endTime] : [],
    };
  }

  for (let i = 1; i < items.length; i += 1) {
    if (items[i]!.startTime < items[i - 1]!.startTime) {
      return {
        isSortedByStart: false,
        starts: [],
        prefixMaxEnds: [],
      };
    }
  }

  const starts = new Array<number>(items.length);
  const prefixMaxEnds = new Array<number>(items.length);
  let runningMaxEnd = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]!;
    starts[i] = item.startTime;
    if (item.endTime > runningMaxEnd) {
      runningMaxEnd = item.endTime;
    }
    prefixMaxEnds[i] = runningMaxEnd;
  }

  return {
    isSortedByStart: true,
    starts,
    prefixMaxEnds,
  };
}

function upperBound(values: number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((values[middle] ?? Number.NEGATIVE_INFINITY) <= target) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function hasTimelineHitAtTime(
  index: TimelineHitIndex,
  items: Array<{ startTime: number; endTime: number }>,
  time: number,
  eps: number,
): boolean {
  if (items.length === 0) {
    return false;
  }

  if (!index.isSortedByStart) {
    return items.some((item) => item.startTime - eps <= time && item.endTime + eps >= time);
  }

  const lastStartAtOrBeforeTime = upperBound(index.starts, time + eps) - 1;
  if (lastStartAtOrBeforeTime < 0) {
    return false;
  }

  return (index.prefixMaxEnds[lastStartAtOrBeforeTime] ?? Number.NEGATIVE_INFINITY) >= time - eps;
}

export type SubSelectDrag = {
  active: boolean;
  regionId: string;
  anchorTime: number;
  pointerId: number;
};

interface UseLassoInput {
  waveCanvasRef: React.RefObject<HTMLDivElement | null>;
  tierContainerRef: React.RefObject<HTMLDivElement | null>;
  playerInstanceRef: React.RefObject<WaveSurfer | null>;
  playerIsReady: boolean;
  selectedMediaUrl: string | undefined;
  utterancesOnCurrentMedia: UtteranceDocType[];
  /** Items to select against — utterances for default layer, segments for independent layers */
  timelineItems: Array<{ id: string; startTime: number; endTime: number }>;
  selectedUtteranceIds: Set<string>;
  selectedUtteranceUnitId: string;
  zoomPxPerSec: number;
  skipSeekForIdRef: React.MutableRefObject<string | null>;
  clearUtteranceSelection: () => void;
  createUtteranceFromSelection: (start: number, end: number) => Promise<void>;
  setUtteranceSelection: (primaryId: string, ids: Set<string>) => void;
  playerSeekTo: (time: number) => void;
  // Lifted state (shared with useWaveSurfer)
  subSelectionRange: { start: number; end: number } | null;
  setSubSelectionRange: React.Dispatch<React.SetStateAction<{ start: number; end: number } | null>>;
  subSelectDragRef: React.MutableRefObject<SubSelectDrag | null>;
}

export function useLasso(input: UseLassoInput) {
  const {
    waveCanvasRef, tierContainerRef,
    playerInstanceRef, playerIsReady,
    selectedMediaUrl,
    timelineItems,
    selectedUtteranceIds, selectedUtteranceUnitId,
    zoomPxPerSec,
    skipSeekForIdRef,
    clearUtteranceSelection, createUtteranceFromSelection, setUtteranceSelection,
    playerSeekTo,
    subSelectionRange: _subSelectionRange, setSubSelectionRange, subSelectDragRef,
  } = input;

  // ---- Lasso state ----
  const [lassoRect, setLassoRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [waveLassoRect, setWaveLassoRect] = useState<{
    x: number; y: number; w: number; h: number;
    mode: 'select' | 'create'; hitCount: number;
  } | null>(null);
  const [waveLassoHintCount, setWaveLassoHintCount] = useState(0);

  // ---- Sub-selection internal refs ----
  const subSelectPreviewRef = useRef<HTMLDivElement | null>(null);

  // ---- Internal refs ----
  const lassoRef = useRef<{
    active: boolean;
    anchorX: number; anchorY: number;
    scrollLeft0: number;
    baseIds: Set<string>;
    hitCount: number;
    rangeStart: number;
    rangeEnd: number;
  } | null>(null);
  const waveLassoRef = useRef<{
    active: boolean;
    anchorX: number; anchorY: number;
    anchorTime: number;
    baseIds: Set<string>;
    pointerId: number;
    hitCount: number;
    rangeStart: number;
    rangeEnd: number;
  } | null>(null);
  const waveLassoHintCountRef = useRef(0);
  const waveLassoHintTimerRef = useRef<number | undefined>(undefined);
  const pendingLassoSelectionRef = useRef<{ ids: Set<string>; primaryId: string } | null>(null);
  const lassoSelectionRafRef = useRef<number | null>(null);
  const pendingTimelineLassoMoveRef = useRef<{
    left: number;
    top: number;
    width: number;
    height: number;
    tStart: number;
    tEnd: number;
  } | null>(null);
  const timelineLassoMoveRafRef = useRef<number | null>(null);

  // Sync refs for values used inside effects
  const timelineItemsRef = useLatest(timelineItems);
  const selectedUtteranceIdsRef = useLatest(selectedUtteranceIds);
  const timelineHitIndex = useMemo(() => buildTimelineHitIndex(timelineItems), [timelineItems]);
  const timelineHitIndexRef = useLatest(timelineHitIndex);

  const scheduleLassoSelectionUpdate = useCallback((ids: Set<string>, primaryId: string) => {
    pendingLassoSelectionRef.current = { ids, primaryId };
    if (lassoSelectionRafRef.current !== null) return;
    lassoSelectionRafRef.current = requestAnimationFrame(() => {
      lassoSelectionRafRef.current = null;
      const pending = pendingLassoSelectionRef.current;
      pendingLassoSelectionRef.current = null;
      if (!pending) return;
      setUtteranceSelection(pending.primaryId, pending.ids);
    });
  }, [setUtteranceSelection]);

  // Clear sub-selection when the selected utterance changes
  useEffect(() => {
    setSubSelectionRange(null);
  }, [selectedUtteranceUnitId]);

  // ---- Waveform pointer interactions ----
  // Default drag on region = sub-range selection; Alt+drag = move/resize region.
  // Drag on empty area: if hits regions => select; if hits none => create a new segment.
  useEffect(() => {
    const el = waveCanvasRef.current;
    if (!el) return;

    // Convert a clientX position to audio time using WaveSurfer's actual layout.
    const clientXToTime = (clientX: number): number | null => {
      const ws = playerInstanceRef.current;
      const wrapper = ws?.getWrapper();
      const sc = wrapper?.parentElement;
      if (!wrapper || !sc) return null;
      const totalWidth = wrapper.scrollWidth;
      if (totalWidth <= 0) return null;
      const dur = ws?.getDuration() ?? 0;
      if (dur <= 0) return null;
      const rect = sc.getBoundingClientRect();
      const pxOffset = clientX - rect.left + sc.scrollLeft;
      return Math.max(0, Math.min(dur, (pxOffset / totalWidth) * dur));
    };

    const hitTestExistingAtClientX = (clientX: number) => {
      const time = clientXToTime(clientX);
      if (time === null) return false;
      const ws = playerInstanceRef.current;
      const wrapper = ws?.getWrapper();
      const dur = ws?.getDuration() ?? 0;
      const totalWidth = wrapper?.scrollWidth ?? 0;
      const eps = totalWidth > 0 && dur > 0
        ? Math.min(0.03, Math.max(0.005, 3 / totalWidth * dur))
        : 0.01;
      // 用当前活跃层条目判断（独立层用 segment，默认层用 utterance）| Use active-layer items (segments for independent layers, utterances for default)
      return hasTimelineHitAtTime(
        timelineHitIndexRef.current,
        timelineItemsRef.current,
        time,
        eps,
      );
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;

      // Sub-selection drag is starting via onRegionAltPointerDown callback
      if (subSelectDragRef.current) return;

      // Ignore interactive controls in waveform overlay.
      const onControl = e.composedPath().some((node) => {
        if (!(node instanceof HTMLElement)) return false;
        if (node.closest('button, input, textarea, select, a, [role="button"]')) return true;
        return node.classList.contains('region-action-overlay') || node.classList.contains('region-action-btn');
      });
      if (onControl) return;

      // Robust hit-test: if pointer time is inside any existing utterance, don't
      // start empty-area lasso; let region click/selection logic handle it.
      const hitExisting = hitTestExistingAtClientX(e.clientX);
      if (hitExisting) return;

      // Any click on empty area clears the sub-selection
      setSubSelectionRange(null);

      // Unified drag on empty area
      e.stopPropagation();
      e.preventDefault();

      const anchorTime = clientXToTime(e.clientX);
      if (anchorTime === null) return;

      const baseIds = e.shiftKey
        ? new Set(selectedUtteranceIdsRef.current)
        : new Set<string>();
      waveLassoRef.current = {
        active: false,
        anchorX: e.clientX,
        anchorY: e.clientY,
        anchorTime,
        baseIds,
        pointerId: e.pointerId,
        hitCount: 0,
        rangeStart: 0,
        rangeEnd: 0,
      };
      el.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      // --- Sub-selection drag ---
      const sub = subSelectDragRef.current;
      if (sub) {
        const ws = playerInstanceRef.current;
        const wrapper = ws?.getWrapper();
        const sc = wrapper?.parentElement;
        if (!sc || !wrapper) return;
        const rect = sc.getBoundingClientRect();
        const pxOffset = e.clientX - rect.left + sc.scrollLeft;
        const totalWidth = wrapper.scrollWidth;
        const dur = ws?.getDuration() || 1;
        const currentTime = Math.max(0, Math.min(dur, (pxOffset / totalWidth) * dur));
        const dragStart = Math.min(sub.anchorTime, currentTime);
        const dragEnd = Math.max(sub.anchorTime, currentTime);
        if (!sub.active && Math.abs(currentTime - sub.anchorTime) < 0.01) return;
        sub.active = true;

        // Direct DOM preview for responsiveness
        if (!subSelectPreviewRef.current) {
          const div = document.createElement('div');
          div.style.position = 'absolute';
          div.style.top = '0';
          div.style.height = '100%';
          div.style.backgroundColor = 'color-mix(in srgb, var(--state-success-solid) 30%, transparent)';
          div.style.pointerEvents = 'none';
          div.style.zIndex = '5';
          sc.style.position = 'relative';
          sc.appendChild(div);
          subSelectPreviewRef.current = div;
        }
        const leftPx = dragStart * (totalWidth / dur);
        const widthPx = (dragEnd - dragStart) * (totalWidth / dur);
        subSelectPreviewRef.current.style.left = `${leftPx}px`;
        subSelectPreviewRef.current.style.width = `${widthPx}px`;
        return;
      }

      // --- Lasso multi-select drag ---
      const info = waveLassoRef.current;
      if (!info) return;
      const dx = e.clientX - info.anchorX;
      const dy = e.clientY - info.anchorY;
      if (!info.active && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      info.active = true;

      const rect = el.getBoundingClientRect();

      const toY = (cy: number) => cy - rect.top;

      const axRaw = info.anchorX - rect.left;
      const ay = toY(info.anchorY);
      const cxRaw = e.clientX - rect.left;
      const cy = toY(e.clientY);

      let ax = axRaw;
      let cx = cxRaw;

      // Use WaveSurfer coordinate system for time calculation (same as sub-selection).
      const currentTime = clientXToTime(e.clientX);
      if (currentTime !== null) {
        const ws = playerInstanceRef.current;
        const wrapper = ws?.getWrapper();
        const sc = wrapper?.parentElement;
        const totalWidth = wrapper?.scrollWidth ?? 0;
        const dur = ws?.getDuration() ?? 0;
        if (sc && totalWidth > 0 && dur > 0) {
          const scrollLeft = sc.scrollLeft;
          const anchorContentX = (info.anchorTime / dur) * totalWidth;
          const currentContentX = (currentTime / dur) * totalWidth;
          ax = anchorContentX - scrollLeft;
          cx = currentContentX - scrollLeft;
        }

        const left = Math.max(0, Math.min(ax, cx));
        const top = Math.max(0, Math.min(ay, cy));
        const width = Math.abs(cx - ax);
        const height = Math.abs(cy - ay);

        const tStart = Math.min(info.anchorTime, currentTime);
        const tEnd = Math.max(info.anchorTime, currentTime);
        const outcome = computeLassoOutcome(
          timelineItemsRef.current,
          tStart,
          tEnd,
          info.baseIds,
        );
        if (outcome.mode === 'select' && outcome.hitCount !== waveLassoHintCountRef.current) {
          if (waveLassoHintTimerRef.current !== undefined) {
            window.clearTimeout(waveLassoHintTimerRef.current);
          }
          waveLassoHintTimerRef.current = window.setTimeout(() => {
            waveLassoHintTimerRef.current = undefined;
            waveLassoHintCountRef.current = outcome.hitCount;
            setWaveLassoHintCount(outcome.hitCount);
          }, 90);
        }
        if (outcome.mode === 'create' && waveLassoHintCountRef.current !== 0) {
          waveLassoHintCountRef.current = 0;
          setWaveLassoHintCount(0);
        }
        setWaveLassoRect({
          x: left,
          y: outcome.mode === 'create' ? 0 : top,
          w: width,
          h: outcome.mode === 'create' ? el.clientHeight : height,
          mode: outcome.mode,
          hitCount: outcome.hitCount,
        });
        info.hitCount = outcome.hitCount;
        info.rangeStart = tStart;
        info.rangeEnd = tEnd;
        if (outcome.primaryId) skipSeekForIdRef.current = outcome.primaryId;
        scheduleLassoSelectionUpdate(outcome.ids, outcome.primaryId);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      // --- Sub-selection finish ---
      const sub = subSelectDragRef.current;
      if (sub) {
        subSelectDragRef.current = null;
        // Remove direct DOM preview
        if (subSelectPreviewRef.current) {
          subSelectPreviewRef.current.remove();
          subSelectPreviewRef.current = null;
        }
        if (sub.active) {
          // Compute final range
          const ws = playerInstanceRef.current;
          const wrapper = ws?.getWrapper();
          const sc = wrapper?.parentElement;
          if (sc && wrapper) {
            const rectSc = sc.getBoundingClientRect();
            const pxOffset = e.clientX - rectSc.left + sc.scrollLeft;
            const totalWidth = wrapper.scrollWidth;
            const dur = ws?.getDuration() || 1;
            const currentTime = Math.max(0, Math.min(dur, (pxOffset / totalWidth) * dur));
            const s = Math.min(sub.anchorTime, currentTime);
            const end = Math.max(sub.anchorTime, currentTime);
            if (end - s >= 0.02) {
              setSubSelectionRange({ start: s, end });
            }
          }
        }
        return;
      }

      // --- Lasso finish ---
      const info = waveLassoRef.current;
      waveLassoRef.current = null;
      setWaveLassoRect(null);
      if (waveLassoHintTimerRef.current !== undefined) {
        window.clearTimeout(waveLassoHintTimerRef.current);
        waveLassoHintTimerRef.current = undefined;
      }
      waveLassoHintCountRef.current = 0;
      setWaveLassoHintCount(0);
      if (info && !info.active) {
        // Only clear when pointerup is still on empty area; don't clear if the
        // click actually landed on an existing segment.
        if (!hitTestExistingAtClientX(e.clientX)) {
          clearUtteranceSelection();
          // Click-to-seek: move playback position to the clicked time
          const clickTime = clientXToTime(e.clientX);
          if (clickTime !== null) {
            playerSeekTo(clickTime);
          }
        }
      } else if (info && info.active) {
        const s = Math.min(info.rangeStart, info.rangeEnd);
        const end = Math.max(info.rangeStart, info.rangeEnd);
        if (info.hitCount === 0 && end - s >= 0.05) {
          fireAndForget(createUtteranceFromSelection(s, end));
        }
      }
    };

    el.addEventListener('pointerdown', onPointerDown, { capture: true });
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown, { capture: true });
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      if (subSelectPreviewRef.current) {
        subSelectPreviewRef.current.remove();
        subSelectPreviewRef.current = null;
      }
    };
  }, [selectedMediaUrl, playerIsReady, clearUtteranceSelection, createUtteranceFromSelection, scheduleLassoSelectionUpdate, playerSeekTo, playerInstanceRef, waveCanvasRef, skipSeekForIdRef]);

  // RAF & timer cleanup
  useEffect(() => () => {
    if (lassoSelectionRafRef.current !== null) {
      cancelAnimationFrame(lassoSelectionRafRef.current);
      lassoSelectionRafRef.current = null;
    }
    if (waveLassoHintTimerRef.current !== undefined) {
      window.clearTimeout(waveLassoHintTimerRef.current);
      waveLassoHintTimerRef.current = undefined;
    }
  }, []);

  // ---- Timeline lasso handlers ----
  const flushTimelineLassoMove = useCallback(() => {
    const info = lassoRef.current;
    const pending = pendingTimelineLassoMoveRef.current;
    pendingTimelineLassoMoveRef.current = null;
    if (!info || !pending) return;

    setLassoRect({ x: pending.left, y: pending.top, w: pending.width, h: pending.height });

    if (zoomPxPerSec > 0) {
      const outcome = computeLassoOutcome(
        timelineItems,
        pending.tStart,
        pending.tEnd,
        info.baseIds,
        true,
      );
      info.hitCount = outcome.hitCount;
      info.rangeStart = pending.tStart;
      info.rangeEnd = pending.tEnd;
      if (outcome.primaryId) {
        skipSeekForIdRef.current = outcome.primaryId;
      }
      scheduleLassoSelectionUpdate(outcome.ids, outcome.primaryId);
    }
  }, [scheduleLassoSelectionUpdate, skipSeekForIdRef, timelineItems, zoomPxPerSec]);

  const handleLassoPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Only start lasso from empty area (not from annotations, labels, inputs)
    const target = e.target as Element;
    if (
      target.closest('.timeline-annotation') ||
      target.closest('.timeline-annotation-input') ||
      target.closest('.timeline-lane-label') ||
      target.closest('input, textarea, select, button, a, [role="button"]')
    ) return;
    if (e.button !== 0) return;

    const container = tierContainerRef.current;
    if (!container) return;

    const baseIds = e.shiftKey ? new Set(selectedUtteranceIds) : new Set<string>();

    lassoRef.current = {
      active: false,
      anchorX: e.clientX,
      anchorY: e.clientY,
      scrollLeft0: container.scrollLeft,
      baseIds,
      hitCount: 0,
      rangeStart: 0,
      rangeEnd: 0,
    };

    e.currentTarget.setPointerCapture(e.pointerId);
  }, [selectedUtteranceIds, tierContainerRef]);

  const handleLassoPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const info = lassoRef.current;
    if (!info) return;

    const dx = e.clientX - info.anchorX;
    const dy = e.clientY - info.anchorY;
    if (!info.active && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
    info.active = true;

    const container = tierContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const toContentX = (clientX: number) => clientX - rect.left + container.scrollLeft;
    const toContentY = (clientY: number) => clientY - rect.top + container.scrollTop;

    const ax = toContentX(info.anchorX) - (container.scrollLeft - info.scrollLeft0);
    const ay = toContentY(info.anchorY);
    const cx = toContentX(e.clientX);
    const cy = toContentY(e.clientY);

    const left = Math.min(ax, cx);
    const top = Math.min(ay, cy);
    const width = Math.abs(cx - ax);
    const height = Math.abs(cy - ay);

    const tStart = zoomPxPerSec > 0 ? left / zoomPxPerSec : 0;
    const tEnd = zoomPxPerSec > 0 ? (left + width) / zoomPxPerSec : 0;
    pendingTimelineLassoMoveRef.current = {
      left,
      top,
      width,
      height,
      tStart,
      tEnd,
    };
    if (timelineLassoMoveRafRef.current === null) {
      timelineLassoMoveRafRef.current = requestAnimationFrame(() => {
        timelineLassoMoveRafRef.current = null;
        flushTimelineLassoMove();
      });
    }
  }, [flushTimelineLassoMove, tierContainerRef, zoomPxPerSec]);

  const handleLassoPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (timelineLassoMoveRafRef.current !== null) {
      cancelAnimationFrame(timelineLassoMoveRafRef.current);
      timelineLassoMoveRafRef.current = null;
      flushTimelineLassoMove();
    }
    const info = lassoRef.current;
    lassoRef.current = null;
    setLassoRect(null);

    if (info && !info.active) {
      const target = e.target as Element;
      if (
        !target.closest('.timeline-annotation') &&
        !target.closest('.timeline-lane-label') &&
        !target.closest('input, textarea, select, button')
      ) {
        if (!(e.shiftKey || e.metaKey || e.ctrlKey)) {
          clearUtteranceSelection();
        }
      }
    } else if (info && info.active) {
      const s = Math.min(info.rangeStart, info.rangeEnd);
      const end = Math.max(info.rangeStart, info.rangeEnd);
      if (info.hitCount === 0 && end - s >= 0.05) {
        fireAndForget(createUtteranceFromSelection(s, end));
      }
    }
  }, [clearUtteranceSelection, createUtteranceFromSelection, flushTimelineLassoMove]);

  useEffect(() => () => {
    if (timelineLassoMoveRafRef.current !== null) {
      cancelAnimationFrame(timelineLassoMoveRafRef.current);
      timelineLassoMoveRafRef.current = null;
    }
    pendingTimelineLassoMoveRef.current = null;
  }, []);

  return {
    waveLassoRect,
    waveLassoHintCount,
    lassoRect,
    handleLassoPointerDown,
    handleLassoPointerMove,
    handleLassoPointerUp,
  };
}
