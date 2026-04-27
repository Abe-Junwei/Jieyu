import type { Dispatch, MouseEvent as ReactMouseEvent, MutableRefObject, SetStateAction, UIEvent as ReactUIEvent } from 'react';
import type { TimelineViewportProjection } from '../hooks/timelineViewportTypes';
import type { SubSelectDrag } from '../hooks/useLasso';
import type { useWaveSurfer } from '../hooks/useWaveSurfer';
import type { AcousticOverlayMode } from '../utils/acousticOverlayTypes';
import type { WaveformDisplayMode } from '../utils/waveformDisplayMode';
import type { WaveformVisualStyle } from '../utils/waveformVisualStyle';
import type { LayerDocType, LayerLinkDocType } from '../types/jieyuDbDocTypes';
import type { TimelineUnit } from '../hooks/transcriptionTypes';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import type { TimelineUnitViewIndexWithEpoch } from '../hooks/useTimelineUnitViewIndex';
import type { SegmentRangeGesturePreviewReadModel } from '../utils/segmentRangeGesturePreviewReadModel';

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
  layerLinks: ReadonlyArray<Pick<LayerLinkDocType, 'layerId' | 'transcriptionLayerKey' | 'hostTranscriptionLayerId' | 'isPreferred'>>;
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
  zoomMode: 'fit-all' | 'fit-selection' | 'custom';
  setZoomMode: Dispatch<SetStateAction<'fit-all' | 'fit-selection' | 'custom'>>;
  clearUnitSelection: () => void;
  createUnitFromSelection: (start: number, end: number) => Promise<void>;
  setUnitSelection: (primaryId: string, ids: Set<string>) => void;
  resolveNoteIndicatorTarget: (unitId: string, layerId?: string, scope?: 'timeline' | 'waveform') => { count: number; layerId?: string } | null;
  tierContainerRef: MutableRefObject<HTMLDivElement | null>;
  /** 与纵向对读 `verticalComparisonEnabled` 同步：为真时禁用 tier 套索 / 空击清选链。 */
  tierTimelineLassoSuppressed?: boolean;
  /**
   * 纵向对读：tier 内无 `.timeline-content`，文轴量宽与波形 canvas 易不一致；另用于套索抑制等。
   * `containerWidth` 在波形与 tier 净宽均可信时统一取 min(wave,tier)（与横向共用），避免 100% 仍多估可滚宽度。 |
   * Paired-reading: also gates lasso; fit width uses min(wave,tier) when both credible (shared with horizontal).
   */
  verticalComparisonEnabled?: boolean;
  /** `texts.metadata.logicalDurationSec` 等，供 `computeLogicalTimelineDurationForZoom` 与 `units` 合成文献轴。 */
  activeTextTimeLogicalDurationSec?: number;
  /** 与 Ready 内 `useTimelineUnitViewIndex` 同源；与 mapping 合算文献秒及铺轨。 */
  unitsOnCurrentMedia: ReadonlyArray<{ endTime?: number }>;
  mediaId?: string;
  /** 已选媒体 Blob 字节数，传给 VAD 预热前置门控 | Selected media blob byte size for VAD pre-fetch gate */
  mediaBlobSize?: number;
  /** 独立语段 tier 套索：预览/松手时间与写库钳制一致 | Tier lasso preview aligned with independent-segment insert clamp */
  tierIndependentSegmentCreateRangeClamp?: (start: number, end: number) => { start: number; end: number } | null;
}

export interface UseTranscriptionWaveformBridgeControllerResult {
  /** 与 `resolveTimelineExtentSec` 同源：文献时间轴总秒数；100% 缩放=整根文献轴。 */
  documentSpanSec: number;
  waveformAreaRef: MutableRefObject<HTMLDivElement | null>;
  /**
   * 波形 display shell（含上下分屏时的频谱区），供 `useZoom` 在 capture 阶段拦截滚轮，使下半区横滑与波形区一致。
   * Wave+spectrogram shell for wheel capture (split-mode horizontal pan parity).
   */
  waveformStripWheelShellRef: MutableRefObject<HTMLDivElement | null>;
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
  /** 阶段 F·1：wave/tier/Regions 预览互斥读模型（与底层 state 同源派生）。 */
  segmentRangeGesturePreviewReadModel: SegmentRangeGesturePreviewReadModel;
  handleLassoPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  handleLassoPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  handleLassoPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  fitPxPerSec: number;
  zoomPxPerSec: number;
  maxZoomPercent: number;
  /** Authoritative viewport snapshot for read model / orchestration (phase C). */
  timelineViewportProjection: TimelineViewportProjection;
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
