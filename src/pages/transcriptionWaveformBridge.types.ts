import type {
  Dispatch,
  MouseEvent as ReactMouseEvent,
  MutableRefObject,
  SetStateAction,
  UIEvent as ReactUIEvent,
} from 'react';
import type { SubSelectDrag } from '../hooks/useLasso';
import type { useWaveSurfer } from '../hooks/useWaveSurfer';
import type { AcousticOverlayMode } from '../utils/acousticOverlayTypes';
import type { WaveformDisplayMode } from '../utils/waveformDisplayMode';
import type { WaveformVisualStyle } from '../utils/waveformVisualStyle';
import type { LayerDocType, LayerSegmentDocType, UtteranceDocType } from '../db';
import type { TimelineUnit } from '../hooks/transcriptionTypes';

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
  segmentsByLayer: ReadonlyMap<string, LayerSegmentDocType[]>;
  utterancesOnCurrentMedia: UtteranceDocType[];
  selectedTimelineUnit: TimelineUnit | null;
  selectedTimelineUnitForTime: TimeRangeLike | null;
  selectedUtteranceIds: Set<string>;
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
  clearUtteranceSelection: () => void;
  createUtteranceFromSelection: (start: number, end: number) => Promise<void>;
  setUtteranceSelection: (primaryId: string, ids: Set<string>) => void;
  resolveNoteIndicatorTarget: (unitId: string, layerId?: string, scope?: 'timeline' | 'waveform') => { count: number; layerId?: string } | null;
  tierContainerRef: MutableRefObject<HTMLDivElement | null>;
  mediaId?: string;
}

export interface UseTranscriptionWaveformBridgeControllerResult {
  waveformAreaRef: MutableRefObject<HTMLDivElement | null>;
  waveCanvasRef: MutableRefObject<HTMLDivElement | null>;
  player: ReturnType<typeof useWaveSurfer>;
  useSegmentWaveformRegions: boolean;
  waveformTimelineItems: Array<LayerSegmentDocType | UtteranceDocType>;
  waveformRegions: Array<{ id: string; start: number; end: number }>;
  selectedWaveformRegionId: string;
  waveformActiveRegionIds: Set<string>;
  waveformPrimaryRegionId: string;
  selectedWaveformTimelineItem: LayerSegmentDocType | UtteranceDocType | null;
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
  zoomToUtterance: (startTime: number, endTime: number) => void;
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
