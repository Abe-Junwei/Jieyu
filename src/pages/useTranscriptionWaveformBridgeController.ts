import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type UIEvent as ReactUIEvent,
} from 'react';
import { useLasso, type SubSelectDrag } from '../hooks/useLasso';
import { useLatest } from '../hooks/useLatest';
import { useWaveSurfer } from '../hooks/useWaveSurfer';
import { useZoom } from '../hooks/useZoom';
import { useEnsureVadCache } from '../hooks/useEnsureVadCache';
import { useVadCachedSegments } from '../hooks/useVadCachedSegments';
import { useWaveformSelectionController } from './useWaveformSelectionController';
import { timelineUnitsToWaveformAnalysisRows } from '../hooks/timelineUnitView';
import type {
  UseTranscriptionWaveformBridgeControllerInput,
  UseTranscriptionWaveformBridgeControllerResult,
} from './transcriptionWaveformBridge.types';
import { useWaveformAcousticOverlay } from './useWaveformAcousticOverlay';
import { useWaveformSignalOverlays } from './useWaveformSignalOverlays';

export type { WaveformInteractionHandlerRefs } from './transcriptionWaveformBridge.types';

const DEFAULT_PLAYBACK_RATE_KEY = 'jieyu:default-playback-rate';

function readDefaultPlaybackRate(): number {
  try {
    const stored = localStorage.getItem(DEFAULT_PLAYBACK_RATE_KEY);
    if (!stored) return 1;
    const parsed = Number(stored);
    if (Number.isNaN(parsed)) return 1;
    return [0.5, 0.75, 1, 1.25, 1.5, 2].includes(parsed) ? parsed : 1;
  } catch {
    return 1;
  }
}

export function useTranscriptionWaveformBridgeController(
  input: UseTranscriptionWaveformBridgeControllerInput,
): UseTranscriptionWaveformBridgeControllerResult {
  const { setZoomPercent, setZoomMode, setAmplitudeScale } = input;
  useEnsureVadCache(input.mediaId, input.selectedMediaUrl, input.mediaBlobSize);
  const vadSegments = useVadCachedSegments(input.mediaId);
  const waveformAreaRef = useRef<HTMLDivElement | null>(null);
  const waveCanvasRef = useRef<HTMLDivElement | null>(null);
  const [waveformFocused, setWaveformFocused] = useState(false);
  const [segmentLoopPlayback, setSegmentLoopPlayback] = useState(false);
  const [globalLoopPlayback, setGlobalLoopPlayback] = useState(false);
  const [segmentPlaybackRate, setSegmentPlaybackRate] = useState(readDefaultPlaybackRate);
  const [hoverTime, setHoverTime] = useState<{ time: number; x: number; y: number } | null>(null);
  // RAF 聚合悬停时间，避免 mousemove 无上限触发 setState | RAF-coalesce hover time to cap mousemove setState at 60fps
  const pendingHoverTimeRef = useRef<{ time: number; x: number; y: number } | null | undefined>(undefined);
  const hoverTimeRafRef = useRef<number | null>(null);
  const [segMarkStart, setSegMarkStart] = useState<number | null>(null);
  const [dragPreview, setDragPreview] = useState<{ id: string; start: number; end: number } | null>(null);
  const [subSelectionRange, setSubSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const [waveformScrollLeft, setWaveformScrollLeft] = useState(0);
  const pendingWaveformScrollLeftRef = useRef<number | null>(null);
  const waveformScrollRafRef = useRef<number | null>(null);
  const subSelectDragRef = useRef<SubSelectDrag | null>(null);
  const skipSeekForIdRef = useRef<string | null>(null);
  const creatingSegmentRef = useRef(false);
  const markingModeRef = useRef(false);
  const previousSelectedTimelineUnitIdRef = useRef(input.selectedTimelineUnit?.unitId ?? '');
  const lastDurationRef = useRef(0);
  const handleWaveformRegionAltPointerDownRef = useRef<((regionId: string, time: number, pointerId: number, clientX: number) => void) | undefined>(undefined);
  const handleWaveformRegionClickRef = useRef<((regionId: string, clickTime: number, event: MouseEvent) => void) | undefined>(undefined);
  const handleWaveformRegionDoubleClickRef = useRef<((regionId: string, start: number, end: number) => void) | undefined>(undefined);
  const handleWaveformRegionCreateRef = useRef<((start: number, end: number) => void) | undefined>(undefined);
  const handleWaveformRegionContextMenuRef = useRef<((regionId: string, x: number, y: number) => void) | undefined>(undefined);
  const handleWaveformRegionUpdateRef = useRef<((regionId: string, start: number, end: number) => void) | undefined>(undefined);
  const handleWaveformRegionUpdateEndRef = useRef<((regionId: string, start: number, end: number) => void) | undefined>(undefined);
  const handleWaveformTimeUpdateRef = useRef<((time: number) => void) | undefined>(undefined);
  // RAF 聚合拖拽中的 region update，避免每像素的 dragPreview+snapGuide 双 setState | RAF-coalesce region drag updates
  const pendingDragUpdateRef = useRef<{ regionId: string; start: number; end: number } | null>(null);
  const dragUpdateRafRef = useRef<number | null>(null);

  const {
    useSegmentWaveformRegions,
    waveformTimelineItems,
    waveformRegions,
    selectedWaveformRegionId,
    waveformActiveRegionIds,
    waveformPrimaryRegionId,
    selectedWaveformTimelineItem,
  } = useWaveformSelectionController({
    activeLayerIdForEdits: input.activeLayerIdForEdits,
    layers: input.layers,
    layerById: input.layerById,
    ...(input.defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId: input.defaultTranscriptionLayerId } : {}),
    segmentsByLayer: input.segmentsByLayer,
    utterancesOnCurrentMedia: input.utterancesOnCurrentMedia,
    ...(input.timelineUnitViewIndex ? { timelineUnitViewIndex: input.timelineUnitViewIndex } : {}),
    selectedTimelineUnit: input.selectedTimelineUnit,
    selectedUnitIds: input.selectedUnitIds,
  });

  const containerWidth = waveCanvasRef.current?.clientWidth || 800;
  const safeDur = lastDurationRef.current;
  const fitPxPerSec = safeDur > 0 ? containerWidth / safeDur : 40;
  const zoomPxPerSec = fitPxPerSec * (input.zoomPercent / 100);
  const maxZoomPercent = Math.max(200, Math.ceil((2000 / fitPxPerSec) * 100));
  const isFitZoomMode = input.zoomMode === 'fit-all' || input.zoomMode === 'fit-selection';
  const shouldDisableAutoScroll = segmentLoopPlayback && isFitZoomMode;

  const player = useWaveSurfer({
    mediaUrl: input.selectedMediaUrl,
    regions: waveformRegions,
    activeRegionIds: waveformActiveRegionIds,
    primaryRegionId: waveformPrimaryRegionId,
    waveformFocused,
    segmentLoop: segmentLoopPlayback,
    globalLoop: globalLoopPlayback,
    segmentPlaybackRate,
    autoScrollDuringPlayback: !shouldDisableAutoScroll,
    enableEmptyDragCreate: useSegmentWaveformRegions,
    zoomLevel: zoomPxPerSec,
    startMarker: segMarkStart ?? undefined,
    subSelection: subSelectionRange,
    waveformHeight: input.waveformHeight,
    amplitudeScale: input.amplitudeScale,
    waveformDisplayMode: input.waveformDisplayMode,
    waveformVisualStyle: input.waveformVisualStyle,
    onRegionAltPointerDown: (regionId, time, pointerId, clientX) => {
      handleWaveformRegionAltPointerDownRef.current?.(regionId, time, pointerId, clientX);
    },
    onRegionClick: (regionId, clickTime, event) => {
      handleWaveformRegionClickRef.current?.(regionId, clickTime, event);
    },
    onRegionDblClick: (regionId, start, end) => {
      handleWaveformRegionDoubleClickRef.current?.(regionId, start, end);
    },
    onRegionUpdate: (regionId, start, end) => {
      // RAF 聚合：拖拽中每像素触发，合并到单帧 | Coalesce per-pixel drag to one frame
      pendingDragUpdateRef.current = { regionId, start, end };
      if (dragUpdateRafRef.current !== null) return;
      dragUpdateRafRef.current = requestAnimationFrame(() => {
        dragUpdateRafRef.current = null;
        const pending = pendingDragUpdateRef.current;
        pendingDragUpdateRef.current = null;
        if (!pending) return;
        handleWaveformRegionUpdateRef.current?.(pending.regionId, pending.start, pending.end);
      });
    },
    onRegionUpdateEnd: (regionId, start, end) => {
      // 拖拽结束时刷新最终位置并立即提交 | Flush final position on drag end immediately
      if (dragUpdateRafRef.current !== null) {
        cancelAnimationFrame(dragUpdateRafRef.current);
        dragUpdateRafRef.current = null;
      }
      pendingDragUpdateRef.current = null;
      handleWaveformRegionUpdateEndRef.current?.(regionId, start, end);
    },
    onRegionCreate: (start, end) => {
      handleWaveformRegionCreateRef.current?.(start, end);
    },
    onRegionContextMenu: (regionId, x, y) => {
      handleWaveformRegionContextMenuRef.current?.(regionId, x, y);
    },
    onTimeUpdate: (time) => {
      handleWaveformTimeUpdateRef.current?.(time);
    },
  });

  useEffect(() => {
    if (player.duration > 0 && player.duration !== lastDurationRef.current) {
      lastDurationRef.current = player.duration;
    }
  }, [player.duration]);

  // RAF 聚合悬停时间 | RAF-coalesce hover time
  const scheduleHoverTime = useCallback((next: { time: number; x: number; y: number } | null) => {
    pendingHoverTimeRef.current = next;
    if (hoverTimeRafRef.current !== null) return;
    hoverTimeRafRef.current = requestAnimationFrame(() => {
      hoverTimeRafRef.current = null;
      const pending = pendingHoverTimeRef.current;
      pendingHoverTimeRef.current = undefined;
      if (pending === undefined) return;
      setHoverTime(pending);
    });
  }, []);

  const commitWaveformScrollLeft = useCallback((nextScrollLeft: number) => {
    setWaveformScrollLeft((prev) => (Math.abs(prev - nextScrollLeft) > 0.5 ? nextScrollLeft : prev));
  }, []);

  const scheduleWaveformScrollLeft = useCallback((nextScrollLeft: number) => {
    pendingWaveformScrollLeftRef.current = nextScrollLeft;
    if (waveformScrollRafRef.current !== null) return;
    waveformScrollRafRef.current = requestAnimationFrame(() => {
      waveformScrollRafRef.current = null;
      const pending = pendingWaveformScrollLeftRef.current;
      pendingWaveformScrollLeftRef.current = null;
      if (pending == null) return;
      commitWaveformScrollLeft(pending);
    });
  }, [commitWaveformScrollLeft]);

  useEffect(() => {
    if (!player.isReady) return;
    const ws = player.instanceRef.current;
    if (!ws) return;
    const onScroll = () => {
      scheduleWaveformScrollLeft(ws.getScroll());
    };
    ws.on('scroll', onScroll);
    return () => { ws.un('scroll', onScroll); };
  }, [player.isReady, player.instanceRef, scheduleWaveformScrollLeft]);

  useEffect(() => () => {
    if (hoverTimeRafRef.current !== null) {
      cancelAnimationFrame(hoverTimeRafRef.current);
      hoverTimeRafRef.current = null;
    }
    pendingHoverTimeRef.current = undefined;
    if (dragUpdateRafRef.current !== null) {
      cancelAnimationFrame(dragUpdateRafRef.current);
      dragUpdateRafRef.current = null;
    }
    pendingDragUpdateRef.current = null;
    if (waveformScrollRafRef.current !== null) {
      cancelAnimationFrame(waveformScrollRafRef.current);
      waveformScrollRafRef.current = null;
    }
    pendingWaveformScrollLeftRef.current = null;
  }, []);

  // 首帧前同步时间轴滚动，避免浏览器恢复滚动导致"先偏移后对齐" | Sync timeline scroll before first paint to avoid browser-restored flicker
  useLayoutEffect(() => {
    const tier = input.tierContainerRef.current;
    if (!tier) return;
    const ws = player.instanceRef.current;
    const nextScrollLeft = ws ? ws.getScroll() : 0;
    if (Math.abs(tier.scrollLeft - nextScrollLeft) > 0.5) {
      tier.scrollLeft = nextScrollLeft;
    }
    commitWaveformScrollLeft(nextScrollLeft);
  }, [commitWaveformScrollLeft, input.selectedMediaUrl, input.tierContainerRef, player.instanceRef, player.isReady]);

  const {
    waveformNoteIndicators,
    waveformLowConfidenceOverlays,
    waveformOverlapOverlays,
  } = useWaveformSignalOverlays({
    utterancesOnCurrentMedia: input.timelineUnitViewIndex
      ? timelineUnitsToWaveformAnalysisRows(input.timelineUnitViewIndex.currentMediaUnits)
      : input.utterancesOnCurrentMedia,
    ...(vadSegments ? { vadSegments } : {}),
    waveformTimelineItems,
    activeLayerIdForEdits: input.activeLayerIdForEdits,
    resolveNoteIndicatorTarget: input.resolveNoteIndicatorTarget,
    waveformScrollLeft,
    zoomPxPerSec,
  });

  const {
    acousticOverlayViewportWidth,
    acousticOverlayF0Path,
    acousticOverlayIntensityPath,
    acousticOverlayVisibleSummary,
    acousticOverlayLoading,
    waveformHoverReadout,
    spectrogramHoverReadout,
    handleSpectrogramMouseMove,
    handleSpectrogramMouseLeave,
    handleSpectrogramClick,
  } = useWaveformAcousticOverlay({
    selectedMediaUrl: input.selectedMediaUrl,
    ...(input.mediaId !== undefined ? { mediaId: input.mediaId } : {}),
    acousticOverlayMode: input.acousticOverlayMode,
    waveformDisplayMode: input.waveformDisplayMode,
    containerWidth,
    waveformScrollLeft,
    zoomPxPerSec,
    hoverTime,
    playerDuration: player.duration,
    seekTo: player.seekTo,
  });

  const {
    waveLassoRect,
    waveLassoHintCount,
    lassoRect,
    handleLassoPointerDown,
    handleLassoPointerMove,
    handleLassoPointerUp,
  } = useLasso({
    waveCanvasRef,
    tierContainerRef: input.tierContainerRef,
    playerInstanceRef: player.instanceRef,
    playerIsReady: player.isReady,
    selectedMediaUrl: input.selectedMediaUrl,
    utterancesOnCurrentMedia: input.utterancesOnCurrentMedia,
    timelineItems: waveformTimelineItems,
    selectedUnitIds: input.selectedUnitIds,
    selectedUnitId: selectedWaveformRegionId,
    zoomPxPerSec,
    skipSeekForIdRef,
    clearUnitSelection: input.clearUnitSelection,
    createUtteranceFromSelection: input.createUtteranceFromSelection,
    setUnitSelection: input.setUnitSelection,
    playerSeekTo: player.seekTo,
    subSelectionRange,
    setSubSelectionRange,
    subSelectDragRef,
  });

  const { rulerView, zoomToPercent, zoomToUtterance } = useZoom({
    waveCanvasRef,
    tierContainerRef: input.tierContainerRef,
    playerInstanceRef: player.instanceRef,
    playerIsReady: player.isReady,
    playerDuration: player.duration,
    playerCurrentTime: player.currentTime,
    playerIsPlaying: player.isPlaying,
    selectedMediaUrl: input.selectedMediaUrl,
    zoomPercent: input.zoomPercent,
    setZoomPercent: input.setZoomPercent,
    setZoomMode: input.setZoomMode,
    fitPxPerSec,
    maxZoomPercent,
    zoomPxPerSec,
  });

  const handleWaveformAreaFocus = useCallback(() => {
    setWaveformFocused(true);
  }, []);

  const handleWaveformAreaBlur = useCallback(() => {
    setWaveformFocused(false);
  }, []);

  const handleWaveformAreaMouseMove = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const el = waveCanvasRef.current;
    if (!el || !player.isReady) {
      scheduleHoverTime(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    if (
      event.clientX < rect.left
      || event.clientX > rect.right
      || event.clientY < rect.top
      || event.clientY > rect.bottom + 30
    ) {
      scheduleHoverTime(null);
      return;
    }
    const ws = player.instanceRef.current;
    const scrollLeft = ws ? ws.getScroll() : 0;
    const time = (scrollLeft + (event.clientX - rect.left)) / zoomPxPerSec;
    scheduleHoverTime({
      time: Math.max(0, Math.min(time, player.duration)),
      x: event.clientX,
      y: rect.top - 4,
    });
  }, [player.duration, player.instanceRef, player.isReady, scheduleHoverTime, zoomPxPerSec]);

  const handleWaveformAreaMouseLeave = useCallback(() => {
    // 离开时立即清除，不走 RAF，避免残留 tooltip | Clear immediately on leave, skip RAF to avoid stale tooltip
    if (hoverTimeRafRef.current !== null) {
      cancelAnimationFrame(hoverTimeRafRef.current);
      hoverTimeRafRef.current = null;
    }
    pendingHoverTimeRef.current = undefined;
    setHoverTime(null);
  }, []);

  const handleWaveformAreaWheel = (event: WheelEvent): void => {
    if (event.ctrlKey) {
      event.preventDefault();
      event.stopPropagation();
      const delta = event.deltaY > 0 ? -10 : 10;
      setZoomMode('custom');
      setZoomPercent((prev) => Math.min(800, Math.max(10, prev + delta)));
      return;
    }
    if (event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      const delta = event.deltaY > 0 ? -0.1 : 0.1;
      setAmplitudeScale((prev) => Math.min(4, Math.max(0.25, prev + delta)));
    }
  };

  const handleTimelineScroll = (event: ReactUIEvent<HTMLDivElement>): void => {
    const nextScrollLeft = event.currentTarget.scrollLeft;
    const ws = player.instanceRef.current;
    if (ws) {
      ws.setScroll(nextScrollLeft);
    }
    scheduleWaveformScrollLeft(nextScrollLeft);
  };

  useEffect(() => {
    const currentSelectedTimelineUnitId = input.selectedTimelineUnit?.unitId ?? '';
    const prev = previousSelectedTimelineUnitIdRef.current;
    if (prev !== currentSelectedTimelineUnitId && segmentLoopPlayback) {
      setSegmentLoopPlayback(false);
    }
    if (prev !== currentSelectedTimelineUnitId) {
      setSegmentPlaybackRate(readDefaultPlaybackRate());
    }
    previousSelectedTimelineUnitIdRef.current = currentSelectedTimelineUnitId;
  }, [input.selectedTimelineUnit?.unitId, segmentLoopPlayback]);

  const isPlayingRef = useLatest(player.isPlaying);
  useEffect(() => {
    const selectedRange = input.selectedTimelineUnitForTime;
    if (!selectedRange || !player.isReady) return;
    if (skipSeekForIdRef.current) {
      skipSeekForIdRef.current = null;
      return;
    }
    if (isPlayingRef.current) return;
    if (input.zoomMode === 'fit-selection') {
      zoomToUtterance(selectedRange.startTime, selectedRange.endTime);
      return;
    }
    player.seekTo(selectedRange.startTime);
  }, [input.selectedTimelineUnitForTime, input.zoomMode, player.isReady, player.seekTo, zoomToUtterance]);

  const resolveSelectedPlaybackRange = () => {
    if (!selectedWaveformTimelineItem) return null;
    return subSelectionRange ?? {
      start: selectedWaveformTimelineItem.startTime,
      end: selectedWaveformTimelineItem.endTime,
    };
  };

  const handleSegmentPlaybackRateChange = (rate: number): void => {
    setSegmentPlaybackRate(rate);
    try {
      localStorage.setItem(DEFAULT_PLAYBACK_RATE_KEY, String(rate));
    } catch {
      // no-op
    }
    const ws = player.instanceRef.current;
    if (ws && player.isPlaying) {
      ws.setPlaybackRate(rate);
    }
  };

  const handleToggleSelectedWaveformLoop = useCallback(() => {
    if (segmentLoopPlayback) {
      setSegmentLoopPlayback(false);
      player.stop();
      return;
    }
    const range = resolveSelectedPlaybackRange();
    if (!range) return;
    setSegmentLoopPlayback(true);
    player.playRegion(range.start, range.end, true);
  }, [player, resolveSelectedPlaybackRange, segmentLoopPlayback]);

  const handleToggleSelectedWaveformPlay = useCallback(() => {
    if (player.isPlaying) {
      player.stop();
      return;
    }
    const range = resolveSelectedPlaybackRange();
    if (!range) return;
    player.playRegion(range.start, range.end, true);
  }, [player, resolveSelectedPlaybackRange]);

  return {
    waveformAreaRef,
    waveCanvasRef,
    player,
    useSegmentWaveformRegions,
    waveformTimelineItems,
    waveformRegions,
    selectedWaveformRegionId,
    waveformActiveRegionIds,
    waveformPrimaryRegionId,
    selectedWaveformTimelineItem,
    waveformFocused,
    segmentLoopPlayback,
    setSegmentLoopPlayback,
    globalLoopPlayback,
    setGlobalLoopPlayback,
    segmentPlaybackRate,
    segMarkStart,
    setSegMarkStart,
    dragPreview,
    setDragPreview,
    skipSeekForIdRef,
    creatingSegmentRef,
    markingModeRef,
    subSelectionRange,
    setSubSelectionRange,
    subSelectDragRef,
    waveLassoRect,
    waveLassoHintCount,
    lassoRect,
    handleLassoPointerDown,
    handleLassoPointerMove,
    handleLassoPointerUp,
    fitPxPerSec,
    zoomPxPerSec,
    maxZoomPercent,
    rulerView,
    zoomToPercent,
    zoomToUtterance,
    hoverTime,
    handleWaveformAreaFocus,
    handleWaveformAreaBlur,
    handleWaveformAreaMouseMove,
    handleWaveformAreaMouseLeave,
    handleWaveformAreaWheel,
    waveformScrollLeft,
    handleTimelineScroll,
    waveformNoteIndicators,
    waveformLowConfidenceOverlays,
    waveformOverlapOverlays,
    acousticOverlayViewportWidth,
    acousticOverlayF0Path,
    acousticOverlayIntensityPath,
    acousticOverlayVisibleSummary,
    acousticOverlayLoading,
    waveformHoverReadout,
    spectrogramHoverReadout,
    handleSpectrogramMouseMove,
    handleSpectrogramMouseLeave,
    handleSpectrogramClick,
    handleSegmentPlaybackRateChange,
    handleToggleSelectedWaveformLoop,
    handleToggleSelectedWaveformPlay,
    waveformInteractionHandlerRefs: {
      handleWaveformRegionAltPointerDownRef,
      handleWaveformRegionClickRef,
      handleWaveformRegionDoubleClickRef,
      handleWaveformRegionCreateRef,
      handleWaveformRegionContextMenuRef,
      handleWaveformRegionUpdateRef,
      handleWaveformRegionUpdateEndRef,
      handleWaveformTimeUpdateRef,
    },
  };
}