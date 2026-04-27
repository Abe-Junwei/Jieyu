/**
 * Props shared by纵向对读 `TranscriptionTimelineVerticalView` 与编排层 `textOnlyProps` 管道。
 * 原从 `TranscriptionTimelineTextOnly` 组件推导；该组件已移除，类型在此单列来源。
 */
import type { RefObject } from 'react';
import type { MouseEvent, KeyboardEvent, PointerEvent } from 'react';
import type {
  LayerDisplaySettings,
  LayerDocType,
  LayerLinkDocType,
  LayerUnitContentDocType,
  LayerUnitDocType,
  MediaItemDocType,
  OrthographyDocType,
} from '../types/jieyuDbDocTypes';
import type { TimelineResizeDragOptions } from '../hooks/useTimelineResize';
/** 与 `TextTimeMapping` 线性段一致；本文件不 import services 以满足架构守卫 M3 */
export type WorkspacePanelTextTimeMappingLinear = { offsetSec: number; scale: number };
import type { TranscriptionTrackDisplayMode } from '../hooks/useTranscriptionUIState';
import type { SpeakerLayerLayoutResult } from '../utils/speakerLayerLayout';
import type { TimelineUnit } from '../hooks/transcriptionTypes';
import type { TranscriptionVerticalPaneFocusState } from './TranscriptionPage.UIState';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import type { UnitSelfCertainty } from '../utils/unitSelfCertainty';

export type TranscriptionTimelineWorkspacePanelProps = {
  activeTextTimelineMode?: 'document' | 'media' | null;
  verticalViewEnabled?: boolean;
  verticalPaneFocus?: TranscriptionVerticalPaneFocusState;
  updateVerticalPaneFocus?: (patch: Partial<TranscriptionVerticalPaneFocusState>) => void;
  transcriptionLayers: LayerDocType[];
  translationLayers: LayerDocType[];
  unitsOnCurrentMedia: LayerUnitDocType[];
  /** 当前媒体单元全集，用于语段 parentUnitId→宿主 解析（可宽于说话人过滤后的 unitsOnCurrentMedia） */
  segmentParentUnitLookup?: LayerUnitDocType[];
  segmentsByLayer?: Map<string, LayerUnitDocType[]>;
  segmentContentByLayer?: Map<string, Map<string, LayerUnitContentDocType>>;
  saveSegmentContentForLayer?: (segmentId: string, layerId: string, value: string) => Promise<void>;
  selectedTimelineUnit?: TimelineUnit | null;
  flashLayerRowId: string;
  focusedLayerRowId: string;
  defaultTranscriptionLayerId?: string;
  logicalDurationSec?: number;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  createUnitFromSelection?: (start: number, end: number) => Promise<void>;
  handleAnnotationClick: (
    uttId: string,
    uttStartTime: number,
    layerId: string,
    e: MouseEvent,
    overlapCycleItems?: Array<{ id: string; startTime: number }>,
  ) => void;
  handleAnnotationContextMenu?: (
    uttId: string,
    utt: TimelineUnitView,
    layerId: string,
    e: MouseEvent,
  ) => void;
  handleNoteClick?: (unitId: string, layerId: string | undefined, event: MouseEvent) => void;
  resolveNoteIndicatorTarget?: (
    unitId: string,
    layerId?: string,
    scope?: 'timeline' | 'waveform',
  ) => { count: number; layerId?: string } | null;
  allLayersOrdered: LayerDocType[];
  onReorderLayers: (draggedLayerId: string, targetIndex: number) => Promise<void>;
  deletableLayers: LayerDocType[];
  defaultLanguageId?: string;
  defaultOrthographyId?: string;
  onFocusLayer: (layerId: string) => void;
  navigateUnitFromInput: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, direction: -1 | 1) => void;
  layerLinks?: LayerLinkDocType[];
  showConnectors?: boolean;
  onToggleConnectors?: () => void;
  laneHeights: Record<string, number>;
  onLaneHeightChange: (layerId: string, nextHeight: number) => void;
  trackDisplayMode?: TranscriptionTrackDisplayMode;
  onToggleTrackDisplayMode?: () => void;
  onSetTrackDisplayMode?: (mode: TranscriptionTrackDisplayMode) => void;
  laneLockMap?: Record<string, number>;
  onLockSelectedSpeakersToLane?: (laneIndex: number) => void;
  onUnlockSelectedSpeakers?: () => void;
  onResetTrackAutoLayout?: () => void;
  selectedSpeakerNamesForLock?: string[];
  speakerLayerLayout?: SpeakerLayerLayoutResult;
  activeUnitId?: string;
  activeSpeakerFilterKey?: string;
  speakerVisualByUnitId?: Record<string, { name: string; color: string }>;
  speakerQuickActions?: {
    selectedCount: number;
    speakerOptions: Array<{ id: string; name: string }>;
    onAssignToSelection: (speakerId: string) => void;
    onClearSelection: () => void;
    onOpenCreateAndAssignPanel: () => void;
  };
  onLaneLabelWidthResize?: (e: PointerEvent<HTMLDivElement>) => void;
  translationAudioByLayer?: Map<string, Map<string, LayerUnitContentDocType>>;
  mediaItems?: MediaItemDocType[];
  recording?: boolean;
  recordingUnitId?: string | null;
  recordingLayerId?: string | null;
  startRecordingForUnit?: (unit: LayerUnitDocType, layer: LayerDocType) => Promise<void>;
  stopRecording?: () => void;
  deleteVoiceTranslation?: (unit: LayerUnitDocType, layer: LayerDocType) => Promise<void>;
  transcribeVoiceTranslation?: (
    unit: LayerUnitDocType,
    layer: LayerDocType,
    options?: { signal?: AbortSignal; audioBlob?: Blob },
  ) => Promise<void>;
  displayStyleControl?: {
    orthographies: OrthographyDocType[];
    onUpdate: (layerId: string, patch: Partial<LayerDisplaySettings>) => void;
    onReset: (layerId: string) => void;
    localFonts?: Parameters<typeof import('../components/LayerStyleSubmenu').buildLayerStyleMenuItems>[7];
  };
  resolveSelfCertaintyForUnit?: (unitId: string, layerId?: string) => UnitSelfCertainty | undefined;
  resolveSelfCertaintyAmbiguityForUnit?: (unitId: string, layerId?: string) => boolean;
  acousticPending?: boolean;
  startTimelineResizeDrag?: (
    event: PointerEvent<HTMLElement>,
    unit: { id: string; mediaId?: string; startTime: number; endTime: number },
    edge: 'start' | 'end' | 'body',
    layerId?: string,
    options?: TimelineResizeDragOptions,
  ) => void;
  textOnlyTimeMapping?: WorkspacePanelTextTimeMappingLinear | null;
  timingDragPreview?: { id: string; start: number; end: number } | null;
};

const TRANSCRIPTION_TIMELINE_VERTICAL_VIEW_REQUIRED_KEYS = [
  'transcriptionLayers',
  'translationLayers',
  'unitsOnCurrentMedia',
  'focusedLayerRowId',
  'onFocusLayer',
  'handleAnnotationClick',
] as const satisfies readonly (keyof TranscriptionTimelineWorkspacePanelProps)[];

type TranscriptionTimelineVerticalViewOptionalKeys = Exclude<
  keyof TranscriptionTimelineWorkspacePanelProps,
  (typeof TRANSCRIPTION_TIMELINE_VERTICAL_VIEW_REQUIRED_KEYS)[number]
>;

/**
 * 纵向对读壳入参：核心字段必填，其余与 panel 对齐但可选（单测可最小装配；编排仍传完整 `textOnlyProps`）。
 */
export type TranscriptionTimelineVerticalViewInput =
  Pick<TranscriptionTimelineWorkspacePanelProps, (typeof TRANSCRIPTION_TIMELINE_VERTICAL_VIEW_REQUIRED_KEYS)[number]> &
  Partial<Pick<TranscriptionTimelineWorkspacePanelProps, TranscriptionTimelineVerticalViewOptionalKeys>>;
