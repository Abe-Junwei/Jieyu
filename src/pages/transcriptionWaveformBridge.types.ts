import type { Dispatch, MouseEvent as ReactMouseEvent, MutableRefObject, SetStateAction, UIEvent as ReactUIEvent } from 'react';
import type { SubSelectDrag } from '../hooks/useLasso';
import type { useWaveSurfer } from '../hooks/useWaveSurfer';
import type { AcousticOverlayMode } from '../utils/acousticOverlayTypes';
import type { WaveformDisplayMode } from '../utils/waveformDisplayMode';
import type { WaveformVisualStyle } from '../utils/waveformVisualStyle';
import type { LayerDocType } from '../db';
import type { TimelineUnit } from '../hooks/transcriptionTypes';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import type { TimelineUnitViewIndexWithEpoch } from '../hooks/useTimelineUnitViewIndex';

export interface TimeRangeLike {
  startTime: number;
  endTime: number;
}

export interface WaveformNoteIndicator {
  uttId: string;
  leftPx: number;
  widthPx: number;
  count: number;
  layerId?: string;
}

export interface WaveformLowConfidenceOverlay {
  id: string;
  leftPx: number;
  widthPx: number;
  confidence: number;
}

export interface WaveformOverlapOverlay {
  id: string;
  leftPx: number;
  widthPx: number;
  concurrentCount: number;
}

export interface AcousticOverlayVisibleSummary {
  f0MeanHz: number | null;
  intensityPeakDb: number | null;
  voicedFrameCount: number;
  frameCount: number;
}

export interface SpectrogramHoverReadout {
  timeSec: number;
  frequencyHz: number;
  f0Hz: number | null;
  intensityDb: number | null;
}

export interface WaveformHoverReadout {
  timeSec: number;
  f0Hz: number | null;
  intensityDb: number | null;
}

export interface WaveformInteractionHandlerRefs {
  handleWaveformRegionAltPointerDownRef: MutableRefObject<((regionId: string, time: number, pointerId: number, clientX: number) => void) | undefined>;
  handleWaveformRegionClickRef: MutableRefObject<((regionId: string, clickTime: number, event: MouseEvent) => void) | undefined>;
  handleWaveformRegionDoubleClickRef: MutableRefObject<((regionId: string, start: number, end: number) => void) | undefined>;
  handleWaveformRegionCreateRef: MutableRefObject<((start: number, end: number) => void) | undefined>;
  handleWaveformRegionContextMenuRef: MutableRefObject<((regionId: string, x: number, y: number) => void) | undefined>;
  handleWaveformRegionUpdateRef: MutableRefObject<((regionId: string, start: number, end: number) => void) | undefined>;
  handleWaveformRegionUpdateEndRef: MutableRefObject<((regionId: string, start: number, end: number) => void) | undefined>;
  handleWaveformTimeUpdateRef: MutableRefObject<((time: number) => void) | undefined>;
}

export interface UseTranscriptionWaveformBridgeControllerInput {
  activeLayerIdForEdits: string;
  layers: LayerDocType[];
  layerById: ReadonlyMap<string, LayerDocType>;
  defaultTranscriptionLayerId?: string;
  timelineUnitViewIndex: TimelineUnitViewIndexWithEpoch;
  selectedTimelineUnit: TimelineUnit | null;
  selectedTimelineUnitForTime: TimeRangeLike | null;
  selectedUnitIds: Set<string>;
  selectedMediaUrl: string | undefined;
  waveformHeight: number;
  amplitudeScale: number;
  setAmplitudeScale: Dispatch<SetStateAction<number>>;
  waveformDisplayMode: WaveformDisplayMode;
  waveformVisualStyle: WaveformVisualStyle;
  acousticOverlayMode: AcousticOverlayMode;
  zoomPercent: number;
  setZoomPercent: Dispatch<SetStateAction<number>>;
  zoomMode: 'fit-all' | 'fit-selection' | 'custom';
  setZoomMode: Dispatch<SetStateAction<'fit-all' | 'fit-selection' | 'custom'>>;
  clearUnitSelection: () => void;
  createUnitFromSelection: (start: number, end: number) => Promise<void>;
  setUnitSelection: (primaryId: string, ids: Set<string>) => void;
  resolveNoteIndicatorTarget: (unitId: string, layerId?: string, scope?: 'timeline' | 'waveform') => { count: number; layerId?: string } | null;
  tierContainerRef: MutableRefObject<HTMLDivElement | null>;
  /** 无声学解码时用于 fit/zoom 与刻度的文献秒跨度（与 `texts.metadata.logicalDurationSec` 一致） */
  logicalTimelineDurationSec?: number;
  mediaId?: string;
  /** 已选媒体 Blob 字节数，传给 VAD 预热前置门控 | Selected media blob byte size for VAD pre-fetch gate */
  mediaBlobSize?: number;
}

export interface UseTranscriptionWaveformBridgeControllerResult {
  waveformAreaRef: MutableRefObject<HTMLDivElement | null>;
  waveCanvasRef: MutableRefObject<HTMLDivElement | null>;
  player: ReturnType<typeof useWaveSurfer>;
  useSegmentWaveformRegions: boolean;
  waveformTimelineItems: TimelineUnitView[];
  waveformRegions: Array<{ id: string; start: number; end: number }>;
  selectedWaveformRegionId: string;
  waveformActiveRegionIds: Set<string>;
  selectedWaveformTimelineItem: TimelineUnitView | null;
  waveformFocused: boolean;
  segmentLoopPlayback: boolean;
  setSegmentLoopPlayback: Dispatch<SetStateAction<boolean>>;
  globalLoopPlayback: boolean;
  setGlobalLoopPlayback: Dispatch<SetStateAction<boolean>>;
  segmentPlaybackRate: number;
  segMarkStart: number | null;
  setSegMarkStart: Dispatch<SetStateAction<number | null>>;
  dragPreview: { id: string; start: number; end: number } | null;
  setDragPreview: Dispatch<SetStateAction<{ id: string; start: number; end: number } | null>>;
  skipSeekForIdRef: MutableRefObject<string | null>;
  creatingSegmentRef: MutableRefObject<boolean>;
  markingModeRef: MutableRefObject<boolean>;
  subSelectionRange: { start: number; end: number } | null;
  setSubSelectionRange: Dispatch<SetStateAction<{ start: number; end: number } | null>>;
  subSelectDragRef: MutableRefObject<SubSelectDrag | null>;
  waveLassoRect: {
    x: number;
    y: number;
    w: number;
    h: number;
    mode: 'select' | 'create';
    hitCount: number;
  } | null;
  waveLassoHintCount: number;
  lassoRect: { x: number; y: number; w: number; h: number } | null;
  handleLassoPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  handleLassoPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  handleLassoPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  fitPxPerSec: number;
  zoomPxPerSec: number;
  maxZoomPercent: number;
  rulerView: { start: number; end: number } | null;
  zoomToPercent: (percent: number, centerRatio?: number, mode?: 'fit-all' | 'fit-selection' | 'custom') => void;
  zoomToUnit: (startTime: number, endTime: number) => void;
  hoverTime: { time: number; x: number; y: number } | null;
  handleWaveformAreaFocus: () => void;
  handleWaveformAreaBlur: () => void;
  handleWaveformAreaMouseMove: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleWaveformAreaMouseLeave: () => void;
  handleWaveformAreaWheel: (event: WheelEvent) => void;
  waveformScrollLeft: number;
  handleTimelineScroll: (event: ReactUIEvent<HTMLDivElement>) => void;
  waveformNoteIndicators: WaveformNoteIndicator[];
  waveformLowConfidenceOverlays: WaveformLowConfidenceOverlay[];
  waveformOverlapOverlays: WaveformOverlapOverlay[];
  acousticOverlayViewportWidth: number;
  acousticOverlayF0Path: string | null;
  acousticOverlayIntensityPath: string | null;
  acousticOverlayVisibleSummary: AcousticOverlayVisibleSummary | null;
  acousticOverlayLoading: boolean;
  waveformHoverReadout: WaveformHoverReadout | null;
  spectrogramHoverReadout: SpectrogramHoverReadout | null;
  handleSpectrogramMouseMove: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleSpectrogramMouseLeave: () => void;
  handleSpectrogramClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleSegmentPlaybackRateChange: (rate: number) => void;
  handleToggleSelectedWaveformLoop: () => void;
  handleToggleSelectedWaveformPlay: () => void;
  waveformInteractionHandlerRefs: WaveformInteractionHandlerRefs;
}
