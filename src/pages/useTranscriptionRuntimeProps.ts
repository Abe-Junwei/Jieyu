import { useCallback, useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { LayerDocType, UtteranceDocType } from '../db';
import type { VoiceIntent, VoiceSession } from '../services/IntentRouter';
import type { VoiceAgentMode } from '../hooks/useVoiceAgent';
import type { SaveState } from '../hooks/transcriptionTypes';
import type { Locale } from '../i18n';
import type {
  PdfPreviewOpenRequest,
  TranscriptionPageAnalysisRuntimeProps,
  TranscriptionPageAssistantRuntimeProps,
  TranscriptionPageEmbeddingProviderConfig,
  TranscriptionPagePdfRuntimeProps,
} from './TranscriptionPage.runtimeContracts';
import {
  createAnalysisRuntimeProps,
  createAssistantRuntimeProps,
  createPdfRuntimeProps,
} from './TranscriptionPage.runtimeProps';
import type { TranscriptionSelectionSnapshot } from './transcriptionSelectionSnapshot';

interface OverlapCycleToastLike {
  index: number;
  total: number;
  nonce: number;
}

interface LockConflictToastLike {
  count: number;
  speakers: string[];
  nonce: number;
}

interface UseTranscriptionRuntimePropsInput {
  saveState: SaveState;
  recording: boolean;
  recordingUtteranceId: string | null;
  recordingError: string | null;
  overlapCycleToast?: OverlapCycleToastLike | null;
  lockConflictToast?: LockConflictToastLike | null;
  tfB: (key: string, opts?: Record<string, unknown>) => string;
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
  selectionSnapshot: TranscriptionSelectionSnapshot;
  defaultTranscriptionLayerId?: string;
  translationLayers: LayerDocType[];
  layers: LayerDocType[];
  formatLayerRailLabel: (layer: LayerDocType) => string;
  formatTime: (seconds: number) => string;
  toggleVoiceRef: MutableRefObject<(() => void) | undefined>;
  utterancesOnCurrentMedia: UtteranceDocType[];
  getUtteranceTextForLayer: (utterance: UtteranceDocType, layerId?: string) => string;
  handleJumpToCitation: (
    citationType: 'utterance' | 'note' | 'pdf' | 'schema',
    refId: string,
    citation?: { snippet?: string },
  ) => Promise<void>;
  handleJumpToEmbeddingMatch: (utteranceId: string) => void;
  embeddingProviderConfig: TranscriptionPageEmbeddingProviderConfig;
  setEmbeddingProviderConfig: Dispatch<SetStateAction<TranscriptionPageEmbeddingProviderConfig>>;
  aiSidebarError: string | null;
  locale: Locale;
  pdfPreviewRequest: PdfPreviewOpenRequest | null;
  setPdfPreviewRequest: Dispatch<SetStateAction<PdfPreviewOpenRequest | null>>;
}

export type { UseTranscriptionRuntimePropsInput };

type UseTranscriptionAssistantRuntimeProps = Omit<TranscriptionPageAssistantRuntimeProps, 'locale' | 'aiChatContextValue'>;
type UseTranscriptionAnalysisRuntimeProps = Omit<TranscriptionPageAnalysisRuntimeProps, 'panel'>;

interface UseTranscriptionRuntimePropsResult {
  assistantRuntimeProps: UseTranscriptionAssistantRuntimeProps;
  analysisRuntimeProps: UseTranscriptionAnalysisRuntimeProps;
  pdfRuntimeProps: TranscriptionPagePdfRuntimeProps;
}

export function useTranscriptionRuntimeProps(input: UseTranscriptionRuntimePropsInput): UseTranscriptionRuntimePropsResult {
  const {
    saveState,
    recording,
    recordingUtteranceId,
    recordingError,
    overlapCycleToast,
    lockConflictToast,
    tfB,
    activeTextPrimaryLanguageId,
    getActiveTextPrimaryLanguageId,
    executeAction,
    handleResolveVoiceIntentWithLlm,
    handleVoiceDictation,
    handleVoiceAnalysisResult,
    selectionSnapshot,
    defaultTranscriptionLayerId,
    translationLayers,
    layers,
    formatLayerRailLabel,
    formatTime,
    toggleVoiceRef,
    utterancesOnCurrentMedia,
    getUtteranceTextForLayer,
    handleJumpToCitation,
    handleJumpToEmbeddingMatch,
    embeddingProviderConfig,
    setEmbeddingProviderConfig,
    aiSidebarError,
    locale,
    pdfPreviewRequest,
    setPdfPreviewRequest,
  } = input;

  const handleClosePdfPreviewRequest = useCallback(() => {
    setPdfPreviewRequest(null);
  }, [setPdfPreviewRequest]);

  const assistantRuntimeProps = useMemo(() => createAssistantRuntimeProps({
    saveState,
    recording,
    recordingUtteranceId,
    recordingError,
    ...(overlapCycleToast !== undefined ? { overlapCycleToast } : {}),
    ...(lockConflictToast !== undefined ? { lockConflictToast } : {}),
    tf: tfB,
    ...(activeTextPrimaryLanguageId !== undefined ? { activeTextPrimaryLanguageId } : {}),
    getActiveTextPrimaryLanguageId,
    executeAction,
    handleResolveVoiceIntentWithLlm,
    handleVoiceDictation,
    handleVoiceAnalysisResult,
    selection: selectionSnapshot,
    ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
    translationLayers,
    layers,
    formatLayerRailLabel,
    formatTime,
    onRegisterToggleVoice: (handler) => {
      toggleVoiceRef.current = handler;
    },
  }), [
    activeTextPrimaryLanguageId,
    defaultTranscriptionLayerId,
    executeAction,
    formatLayerRailLabel,
    formatTime,
    getActiveTextPrimaryLanguageId,
    handleResolveVoiceIntentWithLlm,
    handleVoiceAnalysisResult,
    handleVoiceDictation,
    layers,
    lockConflictToast,
    overlapCycleToast,
    recording,
    recordingError,
    recordingUtteranceId,
    saveState,
    selectionSnapshot,
    tfB,
    toggleVoiceRef,
    translationLayers,
  ]);

  const analysisRuntimeProps = useMemo(() => createAnalysisRuntimeProps({
    selectedUtterance: selectionSnapshot.selectedUtterance,
    utterancesOnCurrentMedia,
    getUtteranceTextForLayer,
    formatTime,
    onJumpToCitation: handleJumpToCitation,
    onJumpToEmbeddingMatch: handleJumpToEmbeddingMatch,
    embeddingProviderConfig,
    onEmbeddingProviderConfigChange: setEmbeddingProviderConfig,
    externalErrorMessage: aiSidebarError,
  }), [
    aiSidebarError,
    embeddingProviderConfig,
    formatTime,
    getUtteranceTextForLayer,
    handleJumpToCitation,
    handleJumpToEmbeddingMatch,
    selectionSnapshot.selectedUtterance,
    setEmbeddingProviderConfig,
    utterancesOnCurrentMedia,
  ]);

  const pdfRuntimeProps = useMemo(() => createPdfRuntimeProps({
    locale,
    request: pdfPreviewRequest,
    onCloseRequest: handleClosePdfPreviewRequest,
  }), [handleClosePdfPreviewRequest, locale, pdfPreviewRequest]);

  return {
    assistantRuntimeProps,
    analysisRuntimeProps,
    pdfRuntimeProps,
  };
}