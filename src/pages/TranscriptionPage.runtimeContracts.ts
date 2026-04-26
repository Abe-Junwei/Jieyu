import type { MutableRefObject } from 'react';
import type { EmbeddingProviderKind } from '../ai/embeddings/EmbeddingProvider';
import type { AnalysisBottomTab } from '../components/AiAnalysisPanel';
import type { AiChatContextValue } from '../contexts/AiChatContext';
import type { LayerDocType, LayerLinkDocType, LayerUnitDocType } from '../db';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import type { SaveState, TimelineUnitKind } from '../hooks/transcriptionTypes';
import type { VoiceAgentMode } from '../hooks/useVoiceAgent';
import type { Locale } from '../i18n';
import type { VoiceIntent, VoiceSession } from '../services/IntentRouter';
import type { OrthographyPreviewTextProps } from '../utils/layerDisplayStyle';
import type { DictationPipelineCallbacks, QuickDictationConfig } from '../services/SpeechAnnotationPipeline';

export interface TranscriptionPageAssistantRuntimeFrameProps {
  saveState: SaveState;
  recording: boolean;
  recordingUnitId: string | null;
  recordingError: string | null;
  overlapCycleToast?: { index: number; total: number; nonce: number } | null;
  lockConflictToast?: { count: number; speakers: string[]; nonce: number } | null;
  tf: (key: string, opts?: Record<string, unknown>) => string;
}

export interface TranscriptionPageAssistantRuntimeVoiceContextProps {
  activeTextPrimaryLanguageId?: string | null;
  getActiveTextPrimaryLanguageId: () => Promise<string | null>;
}

export interface TranscriptionPageAssistantRuntimeVoiceIntentProps {
  executeAction: (actionId: string, params?: { segmentIndex?: number }) => void;
  handleResolveVoiceIntentWithLlm: (input: {
    text: string;
    mode: VoiceAgentMode;
    session: VoiceSession;
  }) => Promise<VoiceIntent | null>;
}

export interface TranscriptionPageAssistantRuntimeVoiceWritebackProps {
  handleVoiceDictation: (text: string) => void;
  handleVoiceAnalysisResult: (unitId: string | null, analysisText: string) => void;
}

export interface TranscriptionPageAssistantRuntimeVoiceLifecycleProps {
  onRegisterToggleVoice: (handler?: () => void) => void;
}

export interface TranscriptionPageAssistantRuntimeVoiceActionProps {
  intent: TranscriptionPageAssistantRuntimeVoiceIntentProps;
  writeback: TranscriptionPageAssistantRuntimeVoiceWritebackProps;
  lifecycle: TranscriptionPageAssistantRuntimeVoiceLifecycleProps;
}

export interface TranscriptionPageAssistantRuntimeSelection {
  activeUnitId: string | null;
  selectedUnit: TimelineUnitView | null;
  selectedRowMeta: { rowNumber: number; start: number; end: number } | null;
  selectedLayerId: string | null;
  selectedUnitKind: TimelineUnitKind | null;
  selectedTimeRangeLabel?: string;
}

export interface TranscriptionPageAssistantRuntimeVoiceTargetProps {
  selection: TranscriptionPageAssistantRuntimeSelection;
  defaultTranscriptionLayerId?: string;
  translationLayers: LayerDocType[];
  layers: LayerDocType[];
  layerLinks?: LayerLinkDocType[];
  dictationPreviewTextProps?: OrthographyPreviewTextProps;
  dictationPipeline?: {
    callbacks: DictationPipelineCallbacks;
    config?: QuickDictationConfig;
  };
  formatSidePaneLayerLabel: (layer: LayerDocType) => string;
  formatTime: (seconds: number) => string;
}

export interface TranscriptionPageAssistantRuntimeVoiceProps {
  context: TranscriptionPageAssistantRuntimeVoiceContextProps;
  actions: TranscriptionPageAssistantRuntimeVoiceActionProps;
  target: TranscriptionPageAssistantRuntimeVoiceTargetProps;
  /**
   * 由语音运行时写入：在 `useAiChat` 完成一轮 assistant 流时调用，正文与 messageId 与持久层一致。
   * Populated by voice runtime: invoked when `useAiChat` finalizes an assistant stream (content + id match persistence).
   */
  onAiAssistantMessageBridgeRef?: MutableRefObject<((assistantMessageId: string, content: string) => void) | null>;
}

export interface TranscriptionPageAssistantRuntimeProps {
  locale: string;
  aiChatContextValue: AiChatContextValue;
  frame: TranscriptionPageAssistantRuntimeFrameProps;
  voice: TranscriptionPageAssistantRuntimeVoiceProps;
}

export interface TranscriptionPageEmbeddingProviderConfig {
  kind: EmbeddingProviderKind;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

export interface TranscriptionPageAnalysisPanelProps {
  locale: string;
  analysisTab: AnalysisBottomTab;
  onAnalysisTabChange: (tab: AnalysisBottomTab) => void;
}

export interface TranscriptionPageAnalysisEmbeddingSourceProps {
  selectedUnit: LayerUnitDocType | null;
  unitsOnCurrentMedia: LayerUnitDocType[];
  getUnitTextForLayer: (unit: LayerUnitDocType, layerId?: string) => string;
  formatTime: (seconds: number) => string;
  externalErrorMessage: string | null;
}

export interface TranscriptionPageAnalysisEmbeddingNavigationProps {
  onJumpToEmbeddingMatch: (unitId: string) => void;
  onJumpToCitation: (
    citationType: 'unit' | 'note' | 'pdf' | 'schema',
    refId: string,
    citation?: { snippet?: string },
  ) => Promise<void> | void;
}

export interface TranscriptionPageAnalysisEmbeddingProviderConfigProps {
  embeddingProviderConfig: TranscriptionPageEmbeddingProviderConfig;
}

export interface TranscriptionPageAnalysisEmbeddingProviderActionProps {
  onEmbeddingProviderConfigChange: (config: TranscriptionPageEmbeddingProviderConfig) => void;
}

export interface TranscriptionPageAnalysisEmbeddingProviderProps {
  config: TranscriptionPageAnalysisEmbeddingProviderConfigProps;
  actions: TranscriptionPageAnalysisEmbeddingProviderActionProps;
}

export interface TranscriptionPageAnalysisEmbeddingProps {
  source: TranscriptionPageAnalysisEmbeddingSourceProps;
  navigation: TranscriptionPageAnalysisEmbeddingNavigationProps;
  provider: TranscriptionPageAnalysisEmbeddingProviderProps;
}

export interface TranscriptionPageAnalysisRuntimeProps {
  panel: TranscriptionPageAnalysisPanelProps;
  embedding: TranscriptionPageAnalysisEmbeddingProps;
}

export interface PdfPreviewOpenRequest {
  nonce: number;
  title: string;
  page: number | null;
  sourceUrl?: string;
  sourceBlob?: Blob;
  hashSuffix?: string;
  searchSnippet?: string;
}

export interface TranscriptionPagePdfRuntimeRequestProps {
  request: PdfPreviewOpenRequest | null;
  onCloseRequest?: () => void;
}

export interface TranscriptionPagePdfRuntimeProps {
  locale: Locale;
  previewRequest: TranscriptionPagePdfRuntimeRequestProps;
}