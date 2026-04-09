import type { AiPanelMode } from '../components/AiAnalysisPanel';
import type { AiObserverRecommendation } from '../components/transcription/toolbar/ObserverStatus';
import type {
  LayerDocType,
  LayerLinkDocType,
  LayerSegmentDocType,
  MediaItemDocType,
  UtteranceDocType,
} from '../db';
import type { SaveState } from '../hooks/transcriptionTypes';
import type { Locale } from '../i18n';
import type { AppShellOpenSearchDetail } from '../utils/appShellEvents';
import type { EmbeddingProviderKind } from '../ai/embeddings/EmbeddingProvider';
import type { TranscriptionSelectionSnapshot } from './transcriptionSelectionSnapshot';
import type { SegmentRoutingResult } from './transcriptionSegmentRouting';
import type { ActionableRecommendation } from '../hooks/useAiPanelLogic';
import type { AcousticPromptSummary } from './transcriptionAcousticSummary';
import type {
  AcousticBatchSelectionRange,
  AcousticCalibrationStatus,
  AcousticPanelBatchDetail,
  AcousticPanelDetail,
} from '../utils/acousticPanelDetail';
import type { AcousticRuntimeStatus } from '../contexts/AiPanelContext';
import type { useAiChat } from '../hooks/useAiChat';
import type { useAiPanelLogic } from '../hooks/useAiPanelLogic';
import type { ResolvedAcousticProviderState } from '../services/acoustic/acousticProviderContract';

export interface UseTranscriptionAiControllerInput {
  utterances: UtteranceDocType[];
  utterancesOnCurrentMedia: UtteranceDocType[];
  selectedUnitIds: Set<string>;
  selectedUtterance: UtteranceDocType | null;
  selectedTimelineOwnerUtterance: UtteranceDocType | null;
  selectedTimelineSegment?: LayerSegmentDocType | null;
  selectedTimelineMedia?: MediaItemDocType;
  selectedMediaUrl?: string;
  selectedLayerId: string;
  activeLayerIdForEdits?: string;
  resolveSegmentRoutingForLayer?: (layerId?: string) => SegmentRoutingResult;
  segmentsByLayer?: ReadonlyMap<string, LayerSegmentDocType[]>;
  segmentContentByLayer?: ReadonlyMap<string, ReadonlyMap<string, { text?: string }>>;
  selectionSnapshot: TranscriptionSelectionSnapshot;
  layers: LayerDocType[];
  transcriptionLayers: LayerDocType[];
  translationLayers: LayerDocType[];
  layerLinks: LayerLinkDocType[];
  getUtteranceTextForLayer: (utterance: UtteranceDocType, layerId?: string) => string;
  formatTime: (seconds: number) => string;
  utteranceCount: number;
  translationLayerCount: number;
  aiConfidenceAvg: number | null;
  undoHistory: unknown[];
  createLayerWithActiveContext: (
    layerType: 'transcription' | 'translation',
    input: { languageId: string; alias?: string },
    modality?: 'text' | 'audio' | 'mixed',
  ) => Promise<boolean>;
  createTranscriptionSegment: (targetId: string) => Promise<void>;
  splitTranscriptionSegment: (targetId: string, splitTime: number) => Promise<void>;
  mergeWithPrevious?: (id: string) => Promise<void>;
  mergeWithNext?: (id: string) => Promise<void>;
  mergeSelectedUtterances: (ids: Set<string>) => Promise<void>;
  mergeSelectedSegments?: (ids: Set<string>) => Promise<void>;
  deleteUtterance: (id: string) => Promise<void>;
  deleteSelectedUtterances: (ids: Set<string>) => Promise<void>;
  deleteLayer: (id: string, options?: { keepUtterances?: boolean }) => Promise<void>;
  toggleLayerLink: (transcriptionLayerKey: string, layerId: string) => Promise<void>;
  saveUtteranceText: (utteranceId: string, text: string, layerId?: string) => Promise<void>;
  saveTextTranslationForUtterance: (utteranceId: string, text: string, layerId: string) => Promise<void>;
  saveSegmentContentForLayer: (segmentId: string, layerId: string, value: string) => Promise<void>;
  updateTokenPos: (tokenId: string, pos: string | null) => Promise<void> | void;
  batchUpdateTokenPosByForm: (utteranceId: string, form: string, pos: string | null) => Promise<number> | number;
  updateTokenGloss: (tokenId: string, gloss: string | null, lang?: string) => Promise<void> | void;
  selectUtterance: (id: string) => void;
  setSaveState: React.Dispatch<React.SetStateAction<SaveState>>;
  translationDrafts: Record<string, string>;
  translationTextByLayer: Map<string, Map<string, { text?: string }>>;
  locale: Locale;
  playerCurrentTime: number;
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
}

export interface UseTranscriptionAiControllerResult {
  aiPanelMode: AiPanelMode;
  setAiPanelMode: React.Dispatch<React.SetStateAction<AiPanelMode>>;
  aiSidebarError: string | null;
  setAiSidebarError: React.Dispatch<React.SetStateAction<string | null>>;
  embeddingProviderConfig: { kind: EmbeddingProviderKind; baseUrl?: string; apiKey?: string; model?: string };
  setEmbeddingProviderConfig: React.Dispatch<React.SetStateAction<{ kind: EmbeddingProviderKind; baseUrl?: string; apiKey?: string; model?: string }>>;
  aiToolDecisionLogs: Array<{ id: string; toolName: string; decision: string; requestId?: string; timestamp: string }>;
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
