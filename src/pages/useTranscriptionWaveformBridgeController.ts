import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type UIEvent as ReactUIEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { useLasso, type SubSelectDrag } from '../hooks/useLasso';
import { useLatest } from '../hooks/useLatest';
import { useWaveSurfer } from '../hooks/useWaveSurfer';
import { useZoom } from '../hooks/useZoom';
import { useEnsureVadCache } from '../hooks/useEnsureVadCache';
import { useVadCachedSegments } from '../hooks/useVadCachedSegments';
import type { LayerDocType, LayerSegmentDocType, UtteranceDocType } from '../db';
import { useWaveformSelectionController } from './useWaveformSelectionController';
import type {
  UseTranscriptionWaveformBridgeControllerInput,
  UseTranscriptionWaveformBridgeControllerResult,
  WaveformInteractionHandlerRefs,
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
  const { setZoomPercent, setAmplitudeScale } = input;
  useEnsureVadCache(input.mediaId, input.selectedMediaUrl);
  const vadSegments = useVadCachedSegments(input.mediaId);
  const waveformAreaRef = useRef<HTMLDivElement | null>(null);
  const waveCanvasRef = useRef<HTMLDivElement | null>(null);
  const [waveformFocused, setWaveformFocused] = useState(false);
  const [segmentLoopPlayback, setSegmentLoopPlayback] = useState(false);
  const [globalLoopPlayback, setGlobalLoopPlayback] = useState(false);
  const [segmentPlaybackRate, setSegmentPlaybackRate] = useState(readDefaultPlaybackRate);
  const [hoverTime, setHoverTime] = useState<{ time: number; x: number; y: number } | null>(null);
  const [segMarkStart, setSegMarkStart] = useState<number | null>(null);
  const [dragPreview, setDragPreview] = useState<{ id: string; start: number; end: number } | null>(null);
  const [subSelectionRange, setSubSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const [waveformScrollLeft, setWaveformScrollLeft] = useState(0);
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
    selectedTimelineUnit: input.selectedTimelineUnit,
    selectedUtteranceIds: input.selectedUtteranceIds,
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
      handleWaveformRegionUpdateRef.current?.(regionId, start, end);
    },
    onRegionUpdateEnd: (regionId, start, end) => {
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

  useEffect(() => {
    if (!player.isReady) return;
    const ws = player.instanceRef.current;
    if (!ws) return;
    const onScroll = () => setWaveformScrollLeft(ws.getScroll());
    ws.on('scroll', onScroll);
    return () => { ws.un('scroll', onScroll); };
  }, [player.isReady, player.instanceRef]);

  const {
    waveformNoteIndicators,
    waveformLowConfidenceOverlays,
    waveformOverlapOverlays,
    waveformGapOverlays,
  } = useWaveformSignalOverlays({
    utterancesOnCurrentMedia: input.utterancesOnCurrentMedia,
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
    mediaId: input.mediaId,
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
    selectedUtteranceIds: input.selectedUtteranceIds,
    selectedUtteranceUnitId: selectedWaveformRegionId,
    zoomPxPerSec,
    skipSeekForIdRef,
    clearUtteranceSelection: input.clearUtteranceSelection,
    createUtteranceFromSelection: input.createUtteranceFromSelection,
    setUtteranceSelection: input.setUtteranceSelection,
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
      setHoverTime(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    if (
      event.clientX < rect.left
      || event.clientX > rect.right
      || event.clientY < rect.top
      || event.clientY > rect.bottom + 30
    ) {
      setHoverTime(null);
      return;
    }
    const ws = player.instanceRef.current;
    const scrollLeft = ws ? ws.getScroll() : 0;
    const time = (scrollLeft + (event.clientX - rect.left)) / zoomPxPerSec;
    setHoverTime({
      time: Math.max(0, Math.min(time, player.duration)),
      x: event.clientX,
      y: rect.top - 4,
    });
  }, [player.duration, player.instanceRef, player.isReady, zoomPxPerSec]);

  const handleWaveformAreaMouseLeave = useCallback(() => {
    setHoverTime(null);
  }, []);

  const handleWaveformAreaWheel = (event: ReactWheelEvent<HTMLDivElement>): void => {
    if (event.ctrlKey) {
      event.preventDefault();
      event.stopPropagation();
      const delta = event.deltaY > 0 ? -10 : 10;
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
    const ws = player.instanceRef.current;
    if (ws) {
      ws.setScroll(event.currentTarget.scrollLeft);
    }
    setWaveformScrollLeft(event.currentTarget.scrollLeft);
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
    if (!input.selectedTimelineUnitForTime || !player.isReady) return;
    if (skipSeekForIdRef.current) {
      skipSeekForIdRef.current = null;
      return;
    }
    if (isPlayingRef.current) return;
    player.seekTo(input.selectedTimelineUnitForTime.startTime);
  }, [input.selectedTimelineUnitForTime, player.isReady, player.seekTo]);

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
    waveformGapOverlays,
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