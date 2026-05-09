import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type UIEvent as ReactUIEvent,
} from 'react';
import { computeLogicalTimelineDurationForZoom } from './readyWorkspaceLogicalTimelineDuration';
import { useLasso, type SubSelectDrag } from '../hooks/useLasso';
import { useSegmentRangeGesturePreviewWriter } from '../hooks/useSegmentRangeGesturePreviewWriter';
import { useWaveSurfer } from '../hooks/useWaveSurfer';
import { useTimelineViewport } from '../hooks/useTimelineViewport';
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
import {
  readDefaultPlaybackRate,
  useWaveformViewportSizing,
  type UseWaveformViewportSizingInput,
} from './useWaveformViewportSizing';
import { useWaveformBridgeRegionDragRaf } from './waveformBridgeRegionDragRaf';
import { useWaveformBridgeHoverScrollRaf } from './waveformBridgeHoverScrollRaf';
import { useWaveformBridgeTierScrollSync } from './waveformBridgeTierScrollSync';
import { useWaveformBridgeSegmentPlaybackControls } from './waveformBridgeSegmentPlaybackControls';
export type { WaveformInteractionHandlerRefs } from './transcriptionWaveformBridge.types';

export function useTranscriptionWaveformBridgeController(
  input: UseTranscriptionWaveformBridgeControllerInput,
): UseTranscriptionWaveformBridgeControllerResult {
  const { setAmplitudeScale } = input;
  const [zoomPercent, setZoomPercent] = useState(100);
  useEnsureVadCache(input.mediaId, input.selectedMediaUrl, input.mediaBlobSize);
  const vadSegments = useVadCachedSegments(input.mediaId);
  const waveformAreaRef = useRef<HTMLDivElement | null>(null);
  const waveformStripWheelShellRef = useRef<HTMLDivElement | null>(null);
  const waveCanvasRef = useRef<HTMLDivElement | null>(null);
  const [waveformFocused, setWaveformFocused] = useState(false);
  const [segmentLoopPlayback, setSegmentLoopPlayback] = useState(false);
  const [globalLoopPlayback, setGlobalLoopPlayback] = useState(false);
  const [segmentPlaybackRate, setSegmentPlaybackRate] = useState(readDefaultPlaybackRate);
  const [segMarkStart, setSegMarkStart] = useState<number | null>(null);
  const [subSelectionRange, setSubSelectionRange] = useState<{ start: number; end: number } | null>(
    null,
  );
  const skipSeekForIdRef = useRef<string | null>(null);
  const creatingSegmentRef = useRef(false);
  const markingModeRef = useRef(false);
  const subSelectDragRef = useRef<SubSelectDrag | null>(null);
  const handleWaveformRegionAltPointerDownRef = useRef<
    ((regionId: string, time: number, pointerId: number, clientX: number) => void) | undefined
  >(undefined);
  const handleWaveformRegionClickRef = useRef<
    ((regionId: string, clickTime: number, event: MouseEvent) => void) | undefined
  >(undefined);
  const handleWaveformRegionDoubleClickRef = useRef<
    ((regionId: string, start: number, end: number) => void) | undefined
  >(undefined);
  const handleWaveformRegionCreateRef = useRef<((start: number, end: number) => void) | undefined>(
    undefined,
  );
  const handleWaveformRegionContextMenuRef = useRef<
    ((regionId: string, x: number, y: number) => void) | undefined
  >(undefined);
  const handleWaveformRegionUpdateRef = useRef<
    ((regionId: string, start: number, end: number) => void) | undefined
  >(undefined);
  const handleWaveformRegionUpdateEndRef = useRef<
    ((regionId: string, start: number, end: number) => void) | undefined
  >(undefined);
  const handleWaveformTimeUpdateRef = useRef<((time: number) => void) | undefined>(undefined);

  const {
    gestureWriter,
    setLiftedLassoPreview,
    setDragPreview,
    dragPreview,
    segmentRangeGesturePreviewReadModel,
  } = useSegmentRangeGesturePreviewWriter();
  const {
    useSegmentWaveformRegions,
    waveformTimelineItems,
    waveformRegions,
    selectedWaveformRegionId,
    waveformActiveRegionIds,
    selectedWaveformTimelineItem,
  } = useWaveformSelectionController({
    activeLayerIdForEdits: input.activeLayerIdForEdits,
    layers: input.layers,
    layerById: input.layerById,
    layerLinks: input.layerLinks,
    ...(input.defaultTranscriptionLayerId !== undefined
      ? { defaultTranscriptionLayerId: input.defaultTranscriptionLayerId }
      : {}),
    timelineUnitViewIndex: input.timelineUnitViewIndex,
    selectedTimelineUnit: input.selectedTimelineUnit,
    selectedUnitIds: input.selectedUnitIds,
  });

  const [waveformZoomPxPerSec, setWaveformZoomPxPerSec] = useState(40);
  const isFitZoomMode = input.zoomMode === 'fit-all' || input.zoomMode === 'fit-selection';
  const shouldDisableAutoScroll = segmentLoopPlayback && isFitZoomMode;

  const { onRegionUpdate, onRegionUpdateEnd } = useWaveformBridgeRegionDragRaf(
    handleWaveformRegionUpdateRef,
    handleWaveformRegionUpdateEndRef,
  );

  const player = useWaveSurfer({
    mediaUrl: input.selectedMediaUrl,
    regions: waveformRegions,
    activeRegionIds: waveformActiveRegionIds,
    primaryRegionId: selectedWaveformRegionId,
    waveformFocused,
    segmentLoop: segmentLoopPlayback,
    globalLoop: globalLoopPlayback,
    segmentPlaybackRate,
    autoScrollDuringPlayback: !shouldDisableAutoScroll,
    enableEmptyDragCreate: useSegmentWaveformRegions,
    zoomLevel: waveformZoomPxPerSec,
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
    onRegionUpdate,
    onRegionUpdateEnd,
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

  const documentSpanSec = useMemo(() => {
    const anchor = player.isReady && player.duration > 0 ? player.duration : 0;
    return computeLogicalTimelineDurationForZoom(
      input.activeTextTimeLogicalDurationSec,
      input.unitsOnCurrentMedia,
      anchor > 0 ? { acousticTimelineAnchorSec: anchor } : undefined,
    );
  }, [
    input.activeTextTimeLogicalDurationSec,
    input.unitsOnCurrentMedia,
    player.isReady,
    player.duration,
  ]);

  const waveformViewportSizingInput: UseWaveformViewportSizingInput = {
    tierContainerRef: input.tierContainerRef,
    waveCanvasRef,
    waveformAreaRef,
    documentSpanSec,
    timelineUnitViewEpoch: input.timelineUnitViewIndex.epoch,
    playerIsReady: player.isReady,
    playerDuration: player.duration,
  };
  if (input.selectedMediaUrl !== undefined) {
    waveformViewportSizingInput.selectedMediaUrl = input.selectedMediaUrl;
  }
  if (input.verticalComparisonEnabled !== undefined) {
    waveformViewportSizingInput.verticalComparisonEnabled = input.verticalComparisonEnabled;
  }

  const { containerWidth, waveCanvasClientWidth, rawTierAxisForFitPx, tierTimeAxisForFitPx } =
    useWaveformViewportSizing(waveformViewportSizingInput);

  const fitPxPerSec =
    documentSpanSec > 0 && Number.isFinite(documentSpanSec) ? containerWidth / documentSpanSec : 40;
  const maxZoomPercent = Math.max(200, Math.ceil((2000 / fitPxPerSec) * 100));
  const zoomPxPerSec = Math.max(1e-9, fitPxPerSec * (zoomPercent / 100));
  useLayoutEffect(() => {
    setWaveformZoomPxPerSec(zoomPxPerSec);
  }, [zoomPxPerSec]);

  useLayoutEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __jieyuDebugTimelineLayout?: object }).__jieyuDebugTimelineLayout = {
      zoomPxPerSec,
      fitPxPerSec,
      documentSpanSec,
      containerWidth,
      waveCanvasClientWidth,
      tierAxisMergedPx: rawTierAxisForFitPx,
      tierAxisAfterFloorPx: tierTimeAxisForFitPx,
    };
  }, [
    containerWidth,
    documentSpanSec,
    fitPxPerSec,
    rawTierAxisForFitPx,
    tierTimeAxisForFitPx,
    waveCanvasClientWidth,
    zoomPxPerSec,
  ]);

  const {
    hoverTime,
    waveformScrollLeft,
    commitWaveformScrollLeft,
    scheduleWaveformScrollLeft,
    handleWaveformAreaMouseMove,
    handleWaveformAreaMouseLeave,
  } = useWaveformBridgeHoverScrollRaf({
    waveCanvasRef,
    player,
    zoomPxPerSec,
  });

  useWaveformBridgeTierScrollSync({
    tierContainerRef: input.tierContainerRef,
    player,
    selectedMediaUrl: input.selectedMediaUrl,
    commitWaveformScrollLeft,
  });

  const { waveformNoteIndicators, waveformLowConfidenceOverlays, waveformOverlapOverlays } =
    useWaveformSignalOverlays({
      unitsOnCurrentMedia: timelineUnitsToWaveformAnalysisRows(
        input.timelineUnitViewIndex.currentMediaUnits,
      ),
      ...(vadSegments ? { vadSegments } : {}),
      waveformTimelineItems,
      activeLayerIdForEdits: input.activeLayerIdForEdits,
      resolveNoteIndicatorTarget: input.resolveNoteIndicatorTarget,
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
    timelineItems: waveformTimelineItems,
    selectedUnitIds: input.selectedUnitIds,
    selectedUnitId: selectedWaveformRegionId,
    zoomPxPerSec,
    skipSeekForIdRef,
    clearUnitSelection: input.clearUnitSelection,
    createUnitFromSelection: input.createUnitFromSelection,
    setUnitSelection: input.setUnitSelection,
    playerSeekTo: player.seekTo,
    subSelectionRange,
    setSubSelectionRange,
    subSelectDragRef,
    ...(input.tierTimelineLassoSuppressed ? { tierTimelineLassoSuppressed: true } : {}),
    liftedLassoPreview: gestureWriter.lasso,
    setLiftedLassoPreview,
    waveformMappingDurationSec: documentSpanSec,
    ...(input.tierIndependentSegmentCreateRangeClamp
      ? { tierIndependentSegmentCreateRangeClamp: input.tierIndependentSegmentCreateRangeClamp }
      : {}),
    tierLassoMode: input.selectedMediaUrl ? 'default' : 'noMediaTextCreate',
  });

  const {
    projection: timelineViewportProjection,
    zoomToPercent,
    zoomToUnit,
  } = useTimelineViewport({
    waveCanvasRef,
    waveformWheelCaptureRootRef: waveformStripWheelShellRef,
    tierContainerRef: input.tierContainerRef,
    playerInstanceRef: player.instanceRef,
    playerIsReady: player.isReady,
    playerDuration: player.duration,
    playerIsPlaying: player.isPlaying,
    selectedMediaUrl: input.selectedMediaUrl,
    zoomPercent,
    setZoomPercent,
    setZoomMode: input.setZoomMode,
    fitPxPerSec,
    maxZoomPercent,
    zoomPxPerSec,
    documentSpanSec,
    onLogicalTimelineScrollSync: scheduleWaveformScrollLeft,
    onBatchedRulerFrameScrollLeft: commitWaveformScrollLeft,
    waveformScrollLeft,
  });
  const { rulerView } = timelineViewportProjection;

  const {
    handleSegmentPlaybackRateChange,
    handleToggleSelectedWaveformLoop,
    handleToggleSelectedWaveformPlay,
  } = useWaveformBridgeSegmentPlaybackControls({
    player,
    segmentLoopPlayback,
    setSegmentLoopPlayback,
    setSegmentPlaybackRate,
    selectedWaveformTimelineItem,
    subSelectionRange,
    selectedTimelineUnitId: input.selectedTimelineUnit?.unitId,
    zoomMode: input.zoomMode,
    selectedTimelineUnitForTime: input.selectedTimelineUnitForTime,
    zoomToUnit,
    skipSeekForIdRef,
  });

  const handleWaveformAreaFocus = useCallback(() => {
    setWaveformFocused(true);
  }, []);

  const handleWaveformAreaBlur = useCallback(() => {
    setWaveformFocused(false);
  }, []);

  const handleWaveformAreaWheel = useCallback(
    (event: WheelEvent): void => {
      if (event.ctrlKey || event.metaKey) return;
      if (event.altKey) {
        event.preventDefault();
        event.stopPropagation();
        const delta = event.deltaY > 0 ? -0.1 : 0.1;
        setAmplitudeScale((prev) => Math.min(4, Math.max(0.25, prev + delta)));
      }
    },
    [setAmplitudeScale],
  );

  const handleTimelineScroll = (event: ReactUIEvent<HTMLDivElement>): void => {
    const nextScrollLeft = event.currentTarget.scrollLeft;
    const ws = player.instanceRef.current;
    if (ws) {
      ws.setScroll(nextScrollLeft);
    }
    scheduleWaveformScrollLeft(nextScrollLeft);
  };

  return {
    documentSpanSec,
    waveformAreaRef,
    waveformStripWheelShellRef,
    waveCanvasRef,
    player,
    useSegmentWaveformRegions,
    waveformTimelineItems,
    waveformRegions,
    selectedWaveformRegionId,
    waveformActiveRegionIds,
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
    segmentRangeGesturePreviewReadModel,
    handleLassoPointerDown,
    handleLassoPointerMove,
    handleLassoPointerUp,
    fitPxPerSec,
    zoomPxPerSec,
    maxZoomPercent,
    timelineViewportProjection,
    rulerView,
    zoomToPercent,
    zoomToUnit,
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
