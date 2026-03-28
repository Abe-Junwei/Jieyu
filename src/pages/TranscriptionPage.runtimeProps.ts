import type { LayerDocType, UtteranceDocType } from '../db';
import type { SaveState } from '../hooks/transcriptionTypes';
import type { VoiceIntent, VoiceSession } from '../services/IntentRouter';
import type { VoiceAgentMode } from '../hooks/useVoiceAgent';
import type { Locale } from '../i18n';
import type { TranscriptionPageAssistantRuntimeProps } from './TranscriptionPage.AssistantRuntime';
import type {
  TranscriptionPageAnalysisRuntimeProps,
  TranscriptionPageEmbeddingProviderConfig,
} from './TranscriptionPage.AnalysisRuntime';
import type { PdfPreviewOpenRequest } from './TranscriptionPage.PdfRuntime';

type AssistantRuntimeProps = Omit<TranscriptionPageAssistantRuntimeProps, 'locale' | 'aiChatContextValue'>;
type AnalysisRuntimeProps = Omit<TranscriptionPageAnalysisRuntimeProps, 'locale' | 'analysisTab' | 'onAnalysisTabChange'>;

interface CreateAssistantRuntimePropsInput {
  saveState: SaveState;
  recording: boolean;
  recordingUtteranceId: string | null;
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
  handleVoiceAnalysisResult: (utteranceId: string | null, analysisText: string) => void;
  selectedTimelineUtteranceId: string | null;
  selectedUtterance: UtteranceDocType | null | undefined;
  selectedRowMeta: { rowNumber: number; start: number; end: number } | null;
  selectedLayerId: string | null;
  defaultTranscriptionLayerId?: string;
  translationLayers: LayerDocType[];
  layers: LayerDocType[];
  formatLayerRailLabel: (layer: LayerDocType) => string;
  formatTime: (seconds: number) => string;
  onRegisterToggleVoice: (handler?: () => void) => void;
}

interface CreateAnalysisRuntimePropsInput {
  selectedUtterance: UtteranceDocType | null | undefined;
  utterancesOnCurrentMedia: UtteranceDocType[];
  getUtteranceTextForLayer: (utterance: UtteranceDocType, layerId?: string) => string;
  formatTime: (seconds: number) => string;
  onJumpToCitation: TranscriptionPageAnalysisRuntimeProps['onJumpToCitation'];
  onJumpToEmbeddingMatch: (utteranceId: string) => void;
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
  return {
    saveState: input.saveState,
    recording: input.recording,
    recordingUtteranceId: input.recordingUtteranceId,
    recordingError: input.recordingError,
    ...(input.overlapCycleToast !== undefined ? { overlapCycleToast: input.overlapCycleToast } : {}),
    ...(input.lockConflictToast !== undefined ? { lockConflictToast: input.lockConflictToast } : {}),
    tf: input.tf,
    ...(input.activeTextPrimaryLanguageId !== undefined ? { activeTextPrimaryLanguageId: input.activeTextPrimaryLanguageId } : {}),
    getActiveTextPrimaryLanguageId: input.getActiveTextPrimaryLanguageId,
    executeAction: input.executeAction,
    handleResolveVoiceIntentWithLlm: input.handleResolveVoiceIntentWithLlm,
    handleVoiceDictation: input.handleVoiceDictation,
    handleVoiceAnalysisResult: input.handleVoiceAnalysisResult,
    activeUtteranceUnitId: input.selectedTimelineUtteranceId || null,
    selectedUtterance: input.selectedUtterance ?? null,
    selectedRowMeta: input.selectedRowMeta,
    selectedLayerId: input.selectedLayerId,
    ...(input.defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId: input.defaultTranscriptionLayerId } : {}),
    translationLayers: input.translationLayers,
    layers: input.layers,
    formatLayerRailLabel: input.formatLayerRailLabel,
    formatTime: input.formatTime,
    onRegisterToggleVoice: input.onRegisterToggleVoice,
  };
}

export function createAnalysisRuntimeProps(input: CreateAnalysisRuntimePropsInput): AnalysisRuntimeProps {
  return {
    selectedUtterance: input.selectedUtterance ?? null,
    utterancesOnCurrentMedia: input.utterancesOnCurrentMedia,
    getUtteranceTextForLayer: input.getUtteranceTextForLayer,
    formatTime: input.formatTime,
    onJumpToCitation: input.onJumpToCitation,
    onJumpToEmbeddingMatch: input.onJumpToEmbeddingMatch,
    embeddingProviderConfig: input.embeddingProviderConfig,
    onEmbeddingProviderConfigChange: input.onEmbeddingProviderConfigChange,
    externalErrorMessage: input.externalErrorMessage,
  };
}

export function createPdfRuntimeProps(input: CreatePdfRuntimePropsInput): CreatePdfRuntimePropsInput {
  return {
    locale: input.locale,
    request: input.request,
    ...(input.onCloseRequest ? { onCloseRequest: input.onCloseRequest } : {}),
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