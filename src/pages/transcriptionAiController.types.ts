import type { AiPanelMode } from '../components/AiAnalysisPanel';
import type { AiObserverRecommendation } from '../components/transcription/toolbar/ObserverStatus';
import type { LayerDocType, LayerLinkDocType, LayerUnitDocType, MediaItemDocType } from '../db';
import type { SaveState } from '../hooks/transcriptionTypes';
import type { Locale } from '../i18n';
import type { AppShellOpenSearchDetail } from '../utils/appShellEvents';
import type { EmbeddingProviderKind } from '../ai/embeddings/EmbeddingProvider';
import type { TimelineUnitViewIndexWithEpoch } from '../hooks/useTimelineUnitViewIndex';
import type { TranscriptionSelectionSnapshot } from './transcriptionSelectionSnapshot';
import type { SegmentRoutingResult } from './transcriptionSegmentRouting';
import type { ActionableRecommendation } from '../hooks/useAiPanelLogic';
import type { AcousticPromptSummary } from './transcriptionAcousticSummary';
import type { AcousticBatchSelectionRange, AcousticCalibrationStatus, AcousticPanelBatchDetail, AcousticPanelDetail } from '../utils/acousticPanelDetail';
import type { AcousticRuntimeStatus } from '../contexts/AiPanelContext';
import type { useAiChat } from '../hooks/useAiChat';
import type { useAiPanelLogic } from '../hooks/useAiPanelLogic';
import type { EditEvent } from '../hooks/useEditEventBuffer';
import type { ResolvedAcousticProviderState } from '../services/acoustic/acousticProviderContract';

export interface UseTranscriptionAiControllerInput {
  selectedUnitIds: Set<string>;
  selectedUnit: LayerUnitDocType | null;
  getUnitDocById: (id: string) => LayerUnitDocType | undefined;
  selectedTimelineSegment?: LayerUnitDocType | null;
  selectedTimelineMedia?: MediaItemDocType;
  /**
   * 与读模型 `segmentScopeMediaId` 对齐的 AI 声学/提示/工具作用域媒体；缺省则回退 `selectedTimelineMedia`。
   * Aligns AI read scope with segment graph media when it differs from sidebar “current row” media.
   */
  scopeMediaItemForAi?: MediaItemDocType;
  selectedMediaUrl?: string;
  selectedLayerId: string;
  /** Primary transcription layer id for unit rows in `buildTimelineUnitViewIndex`. */
  defaultTranscriptionLayerId?: string;
  activeLayerIdForEdits?: string;
  resolveSegmentRoutingForLayer?: (layerId?: string) => SegmentRoutingResult;
  segmentsByLayer?: ReadonlyMap<string, LayerUnitDocType[]>;
  segmentContentByLayer?: ReadonlyMap<string, ReadonlyMap<string, { text?: string }>>;
  selectionSnapshot: TranscriptionSelectionSnapshot;
  layers: LayerDocType[];
  transcriptionLayers: LayerDocType[];
  translationLayers: LayerDocType[];
  layerLinks: LayerLinkDocType[];
  getUnitTextForLayer: (unit: LayerUnitDocType, layerId?: string) => string;
  formatTime: (seconds: number) => string;
  /** Project-wide authoritative unit count (e.g. DbState.unitCount) for read-model consistency checks. */
  authoritativeUnitCount?: number;
  /** Structured recent edits for AI grounding (mutation-sourced ring buffer from ReadyWorkspace). */
  recentTimelineEditEvents: readonly EditEvent[];
  /** Shared read-model index from ReadyWorkspace (single source of truth for AI reads). */
  timelineUnitViewIndex: TimelineUnitViewIndexWithEpoch;
  segmentsLoadComplete?: boolean;
  translationLayerCount: number;
  aiConfidenceAvg: number | null;
  createLayerWithActiveContext: (
    layerType: 'transcription' | 'translation',
    input: { languageId: string; alias?: string },
    modality?: 'text' | 'audio' | 'mixed',
  ) => Promise<boolean>;
  createTranscriptionSegment: (targetId: string) => Promise<void>;
  splitTranscriptionSegment: (targetId: string, splitTime: number) => Promise<void>;
  mergeWithPrevious?: (id: string) => Promise<void>;
  mergeWithNext?: (id: string) => Promise<void>;
  /** Batch merge by resolved timeline unit ids (typically unit targets). */
  mergeSelectedUnits: (ids: Set<string>) => Promise<void>;
  mergeSelectedSegments?: (ids: Set<string>) => Promise<void>;
  deleteUnit: (id: string) => Promise<void>;
  /** Batch delete by resolved timeline unit ids. */
  deleteSelectedUnits: (ids: Set<string>) => Promise<void>;
  deleteLayer: (id: string, options?: { keepUnits?: boolean }) => Promise<void>;
  toggleLayerLink: (transcriptionLayerKey: string, layerId: string) => Promise<void>;
  rebindTranslationLayerHost?: (input: {
    translationLayerId: string;
    removeTranscriptionLayerId: string;
    fallbackTranscriptionLayerKey: string;
  }) => Promise<void>;
  saveUnitText: (unitId: string, text: string, layerId?: string) => Promise<void>;
  saveUnitLayerText: (unitId: string, text: string, layerId: string) => Promise<void>;
  saveSegmentContentForLayer: (segmentId: string, layerId: string, value: string) => Promise<void>;
  updateTokenPos: (tokenId: string, pos: string | null) => Promise<void> | void;
  batchUpdateTokenPosByForm: (unitId: string, form: string, pos: string | null) => Promise<number> | number;
  updateTokenGloss: (tokenId: string, gloss: string | null, lang?: string) => Promise<void> | void;
  selectUnit: (id: string) => void;
  setSaveState: React.Dispatch<React.SetStateAction<SaveState>>;
  unitDrafts?: Record<string, string>;
  translationDrafts: Record<string, string>;
  focusedTranslationDraftKeyRef?: React.MutableRefObject<string | null>;
  speakers?: Array<{ id: string; name?: string; color?: string }>;
  noteSummary?: {
    count: number;
    byCategory?: Record<string, number>;
    focusedLayerId?: string;
    currentTargetUnitId?: string;
  };
  visibleTimelineState?: {
    currentMediaId?: string;
    currentMediaFilename?: string;
    focusedLayerId?: string;
    selectedLayerId?: string;
    selectedUnitCount?: number;
    verticalViewActive?: boolean;
    transcriptionTrackMode?: string;
    documentSpanSec?: number;
    zoomPercent?: number;
    maxZoomPercent?: number;
    zoomPxPerSec?: number;
    fitPxPerSec?: number;
    rulerVisibleStartSec?: number;
    rulerVisibleEndSec?: number;
    waveformScrollLeftPx?: number;
    laneLockSpeakerCount?: number;
    laneLocks?: ReadonlyArray<{ speakerId: string; laneIndex: number }>;
    trackLockSpeakerIds?: ReadonlyArray<string>;
    activeSpeakerFilterKey?: string;
  };
  /** Active text id for AI tools that read Dexie collections scoped by project/text. */
  activeTextId?: string | null;
  translationTextByLayer: Map<string, Map<string, { text?: string }>>;
  locale: Locale;
  /** 可选：单测或特殊宿主显式喂时间；生产环境由 `transcriptionPlaybackClock` 驱动 */
  playerCurrentTime?: number;
  executeActionRef: React.MutableRefObject<((actionId: string) => void) | undefined>;
  openSearchRef: React.MutableRefObject<((detail?: AppShellOpenSearchDetail) => void) | undefined>;
  seekToTimeRef: React.MutableRefObject<((timeSeconds: number) => void) | undefined>;
  splitAtTimeRef: React.MutableRefObject<((timeSeconds: number) => boolean) | undefined>;
  zoomToSegmentRef: React.MutableRefObject<((segmentId: string, zoomLevel?: number) => boolean) | undefined>;
  handleExecuteRecommendation: (item: ActionableRecommendation) => Promise<void> | void;
  aiSidebarError?: string | null;
  setAiSidebarError?: React.Dispatch<React.SetStateAction<string | null>>;
  embeddingProviderConfig?: { kind: EmbeddingProviderKind; baseUrl?: string; apiKey?: string; model?: string };
  setEmbeddingProviderConfig?: React.Dispatch<React.SetStateAction<{ kind: EmbeddingProviderKind; baseUrl?: string; apiKey?: string; model?: string }>>;
  acousticConfigOverride?: Partial<import('../utils/acousticOverlayTypes').AcousticAnalysisConfig> | null;
  acousticProviderPreference?: string | null;
  /**
   * 当一轮 AI assistant 消息流在 `useAiChat` 中结束时调用（含空正文），供语音分析写回等与 messageId 对齐。
   * Invoked when an assistant stream finalizes in `useAiChat` (content may be empty); used to bind voice analysis writeback to the correct message id.
   */
  onAiAssistantMessageComplete?: (assistantMessageId: string, content: string) => void;
}

export interface UseTranscriptionAiControllerResult {
  aiPanelMode: AiPanelMode;
  setAiPanelMode: React.Dispatch<React.SetStateAction<AiPanelMode>>;
  aiSidebarError: string | null;
  setAiSidebarError: React.Dispatch<React.SetStateAction<string | null>>;
  embeddingProviderConfig: { kind: EmbeddingProviderKind; baseUrl?: string; apiKey?: string; model?: string };
  setEmbeddingProviderConfig: React.Dispatch<React.SetStateAction<{ kind: EmbeddingProviderKind; baseUrl?: string; apiKey?: string; model?: string }>>;
  aiToolDecisionLogs: Array<{ id: string; toolName: string; decision: string; reason?: string; reasonLabelEn?: string; reasonLabelZh?: string; requestId?: string; timestamp: string; source?: 'human' | 'ai' | 'system'; executed?: boolean; durationMs?: number; message?: string }>;
  aiChat: ReturnType<typeof useAiChat>;
  lexemeMatches: ReturnType<typeof useAiPanelLogic>['lexemeMatches'];
  observerResult: ReturnType<typeof useAiPanelLogic>['observerResult'];
  actionableObserverRecommendations: ReturnType<typeof useAiPanelLogic>['actionableObserverRecommendations'];
  selectedAiWarning: boolean;
  selectedTranslationGapCount: number;
  aiCurrentTask: ReturnType<typeof useAiPanelLogic>['aiCurrentTask'];
  aiVisibleCards: ReturnType<typeof useAiPanelLogic>['aiVisibleCards'];
  acousticRuntimeStatus: AcousticRuntimeStatus;
  acousticSummary: AcousticPromptSummary | null;
  acousticDetail: AcousticPanelDetail | null;
  acousticDetailFullMedia: AcousticPanelDetail | null;
  acousticBatchDetails: AcousticPanelBatchDetail[];
  acousticBatchSelectionCount: number;
  acousticBatchDroppedSelectionRanges: AcousticBatchSelectionRange[];
  acousticCalibrationStatus: AcousticCalibrationStatus;
  acousticProviderState: ResolvedAcousticProviderState;
  handleJumpToTranslationGap: () => void;
  handleJumpToAcousticHotspot: (timeSec: number) => void;
  handleExecuteObserverRecommendation: (item: AiObserverRecommendation) => void;
}

/** Re-export for page modules that must not import `../db` directly (M3 guard). */
export type { LayerDocType } from '../db';
