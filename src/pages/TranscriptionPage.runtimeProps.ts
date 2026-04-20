import type { LayerDocType, LayerLinkDocType, LayerUnitDocType } from '../db';
import type { SaveState } from '../hooks/transcriptionTypes';
import type { VoiceIntent, VoiceSession } from '../services/IntentRouter';
import type { VoiceAgentMode } from '../hooks/useVoiceAgent';
import type { Locale } from '../i18n';
import type { OrthographyPreviewTextProps } from '../utils/layerDisplayStyle';
import type { DictationPipelineCallbacks, QuickDictationConfig } from '../services/SpeechAnnotationPipeline';
import type { TranscriptionPageAssistantRuntimeFrameProps, TranscriptionPageAssistantRuntimeProps, TranscriptionPageAssistantRuntimeVoiceActionProps, TranscriptionPageAssistantRuntimeVoiceContextProps, TranscriptionPageAssistantRuntimeVoiceIntentProps, TranscriptionPageAssistantRuntimeVoiceLifecycleProps, TranscriptionPageAssistantRuntimeVoiceProps, TranscriptionPageAssistantRuntimeVoiceTargetProps, TranscriptionPageAssistantRuntimeVoiceWritebackProps, TranscriptionPageAnalysisEmbeddingProps, TranscriptionPageAnalysisEmbeddingNavigationProps, TranscriptionPageAnalysisEmbeddingProviderActionProps, TranscriptionPageAnalysisEmbeddingProviderConfigProps, TranscriptionPageAnalysisEmbeddingProviderProps, TranscriptionPageAnalysisEmbeddingSourceProps, TranscriptionPageAnalysisRuntimeProps, TranscriptionPageEmbeddingProviderConfig, PdfPreviewOpenRequest, TranscriptionPagePdfRuntimeProps, TranscriptionPagePdfRuntimeRequestProps } from './TranscriptionPage.runtimeContracts';
import type { TranscriptionSelectionSnapshot } from './transcriptionSelectionSnapshot';

type AssistantRuntimeProps = Omit<TranscriptionPageAssistantRuntimeProps, 'locale' | 'aiChatContextValue'>;
type AnalysisRuntimeProps = Omit<TranscriptionPageAnalysisRuntimeProps, 'panel'>;
type PdfRuntimeProps = TranscriptionPagePdfRuntimeProps;

interface CreateAssistantRuntimePropsInput {
  saveState: SaveState;
  recording: boolean;
  recordingUnitId: string | null;
  recordingError: string | null;
  overlapCycleToast?: { index: number; total: number; nonce: number } | null;
  lockConflictToast?: { count: number; speakers: string[]; nonce: number } | null;
  tf: (key: string, opts?: Record<string, unknown>) => string;
  activeTextPrimaryLanguageId?: string | null;
  getActiveTextPrimaryLanguageId: () => Promise<string | null>;
  executeAction: (actionId: string, params?: { segmentIndex?: number }) => void;
  handleResolveVoiceIntentWithLlm: (input: {
    text: string;
    mode: VoiceAgentMode;
    session: VoiceSession;
  }) => Promise<VoiceIntent | null>;
  handleVoiceDictation: (text: string) => void;
  handleVoiceAnalysisResult: (unitId: string | null, analysisText: string) => void;
  selection: TranscriptionSelectionSnapshot;
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
  onRegisterToggleVoice: (handler?: () => void) => void;
}

interface CreateAnalysisRuntimePropsInput {
  selectedUnit: LayerUnitDocType | null | undefined;
  unitsOnCurrentMedia: LayerUnitDocType[];
  getUnitTextForLayer: (unit: LayerUnitDocType, layerId?: string) => string;
  formatTime: (seconds: number) => string;
  onJumpToCitation: TranscriptionPageAnalysisEmbeddingNavigationProps['onJumpToCitation'];
  onJumpToEmbeddingMatch: (unitId: string) => void;
  embeddingProviderConfig: TranscriptionPageEmbeddingProviderConfig;
  onEmbeddingProviderConfigChange: (config: TranscriptionPageEmbeddingProviderConfig) => void;
  externalErrorMessage: string | null;
}

interface CreatePdfRuntimePropsInput {
  locale: Locale;
  request: PdfPreviewOpenRequest | null;
  onCloseRequest?: () => void;
}

interface CreatePdfPreviewOpenRequestInput {
  nonce: number;
  title: string;
  page: number | null;
  sourceUrl?: string;
  sourceBlob?: Blob;
  hashSuffix?: string;
  searchSnippet?: string;
}

export function createAssistantRuntimeProps(input: CreateAssistantRuntimePropsInput): AssistantRuntimeProps {
  const frame: TranscriptionPageAssistantRuntimeFrameProps = {
    saveState: input.saveState,
    recording: input.recording,
    recordingUnitId: input.recordingUnitId,
    recordingError: input.recordingError,
    ...(input.overlapCycleToast !== undefined ? { overlapCycleToast: input.overlapCycleToast } : {}),
    ...(input.lockConflictToast !== undefined ? { lockConflictToast: input.lockConflictToast } : {}),
    tf: input.tf,
  };

  const voiceContext: TranscriptionPageAssistantRuntimeVoiceContextProps = {
    ...(input.activeTextPrimaryLanguageId !== undefined ? { activeTextPrimaryLanguageId: input.activeTextPrimaryLanguageId } : {}),
    getActiveTextPrimaryLanguageId: input.getActiveTextPrimaryLanguageId,
  };

  const voiceIntent: TranscriptionPageAssistantRuntimeVoiceIntentProps = {
    executeAction: input.executeAction,
    handleResolveVoiceIntentWithLlm: input.handleResolveVoiceIntentWithLlm,
  };

  const voiceWriteback: TranscriptionPageAssistantRuntimeVoiceWritebackProps = {
    handleVoiceDictation: input.handleVoiceDictation,
    handleVoiceAnalysisResult: input.handleVoiceAnalysisResult,
  };

  const voiceLifecycle: TranscriptionPageAssistantRuntimeVoiceLifecycleProps = {
    onRegisterToggleVoice: input.onRegisterToggleVoice,
  };

  const voiceActions: TranscriptionPageAssistantRuntimeVoiceActionProps = {
    intent: voiceIntent,
    writeback: voiceWriteback,
    lifecycle: voiceLifecycle,
  };

  const voiceTarget: TranscriptionPageAssistantRuntimeVoiceTargetProps = {
    selection: {
      activeUnitId: input.selection.activeUnitId,
      selectedUnit: input.selection.selectedUnit,
      selectedRowMeta: input.selection.selectedRowMeta,
      selectedLayerId: input.selection.selectedLayerId,
      selectedUnitKind: input.selection.selectedUnitKind,
      ...(input.selection.selectedTimeRangeLabel ? { selectedTimeRangeLabel: input.selection.selectedTimeRangeLabel } : {}),
    },
    ...(input.defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId: input.defaultTranscriptionLayerId } : {}),
    translationLayers: input.translationLayers,
    layers: input.layers,
    ...(input.layerLinks !== undefined ? { layerLinks: input.layerLinks } : {}),
    ...(input.dictationPreviewTextProps !== undefined ? { dictationPreviewTextProps: input.dictationPreviewTextProps } : {}),
    ...(input.dictationPipeline !== undefined ? { dictationPipeline: input.dictationPipeline } : {}),
    formatSidePaneLayerLabel: input.formatSidePaneLayerLabel,
    formatTime: input.formatTime,
  };

  const voice: TranscriptionPageAssistantRuntimeVoiceProps = {
    context: voiceContext,
    actions: voiceActions,
    target: voiceTarget,
  };

  return {
    frame,
    voice,
  };
}

export function createAnalysisRuntimeProps(input: CreateAnalysisRuntimePropsInput): AnalysisRuntimeProps {
  const source: TranscriptionPageAnalysisEmbeddingSourceProps = {
    selectedUnit: input.selectedUnit ?? null,
    unitsOnCurrentMedia: input.unitsOnCurrentMedia,
    getUnitTextForLayer: input.getUnitTextForLayer,
    formatTime: input.formatTime,
    externalErrorMessage: input.externalErrorMessage,
  };

  const navigation: TranscriptionPageAnalysisEmbeddingNavigationProps = {
    onJumpToCitation: input.onJumpToCitation,
    onJumpToEmbeddingMatch: input.onJumpToEmbeddingMatch,
  };

  const providerConfig: TranscriptionPageAnalysisEmbeddingProviderConfigProps = {
    embeddingProviderConfig: input.embeddingProviderConfig,
  };

  const providerActions: TranscriptionPageAnalysisEmbeddingProviderActionProps = {
    onEmbeddingProviderConfigChange: input.onEmbeddingProviderConfigChange,
  };

  const provider: TranscriptionPageAnalysisEmbeddingProviderProps = {
    config: providerConfig,
    actions: providerActions,
  };

  const embedding: TranscriptionPageAnalysisEmbeddingProps = {
    source,
    navigation,
    provider,
  };

  return {
    embedding,
  };
}

export function createPdfRuntimeProps(input: CreatePdfRuntimePropsInput): PdfRuntimeProps {
  const previewRequest: TranscriptionPagePdfRuntimeRequestProps = {
    request: input.request,
    ...(input.onCloseRequest ? { onCloseRequest: input.onCloseRequest } : {}),
  };

  return {
    locale: input.locale,
    previewRequest,
  };
}

export function createPdfPreviewOpenRequest(input: CreatePdfPreviewOpenRequestInput): PdfPreviewOpenRequest {
  return {
    nonce: input.nonce,
    title: input.title,
    page: input.page,
    ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
    ...(input.sourceBlob ? { sourceBlob: input.sourceBlob } : {}),
    ...(input.hashSuffix ? { hashSuffix: input.hashSuffix } : {}),
    ...(input.searchSnippet ? { searchSnippet: input.searchSnippet } : {}),
  };
}