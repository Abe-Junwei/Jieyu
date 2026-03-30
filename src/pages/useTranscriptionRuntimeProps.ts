import { useCallback, useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { LayerDocType, UtteranceDocType } from '../db';
import type { VoiceIntent, VoiceSession } from '../services/IntentRouter';
import type { VoiceAgentMode } from '../hooks/useVoiceAgent';
import type { SaveState } from '../hooks/transcriptionTypes';
import type { Locale } from '../i18n';
import type { TranscriptionPageAssistantRuntimeProps } from './TranscriptionPage.AssistantRuntime';
import type { TranscriptionPageAnalysisRuntimeProps } from './TranscriptionPage.AnalysisRuntime';
import type { TranscriptionPageEmbeddingProviderConfig } from './TranscriptionPage.AnalysisRuntime';
import type { PdfPreviewOpenRequest } from './TranscriptionPage.PdfRuntime';
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
type UseTranscriptionAnalysisRuntimeProps = Omit<TranscriptionPageAnalysisRuntimeProps, 'locale' | 'analysisTab' | 'onAnalysisTabChange'>;

interface UseTranscriptionRuntimePropsResult {
  assistantRuntimeProps: UseTranscriptionAssistantRuntimeProps;
  analysisRuntimeProps: UseTranscriptionAnalysisRuntimeProps;
  pdfRuntimeProps: {
    locale: Locale;
    request: PdfPreviewOpenRequest | null;
    onCloseRequest?: () => void;
  };
}

export function useTranscriptionRuntimeProps(input: UseTranscriptionRuntimePropsInput): UseTranscriptionRuntimePropsResult {
  const handleClosePdfPreviewRequest = useCallback(() => {
    input.setPdfPreviewRequest(null);
  }, [input]);

  const assistantRuntimeProps = useMemo(() => createAssistantRuntimeProps({
    saveState: input.saveState,
    recording: input.recording,
    recordingUtteranceId: input.recordingUtteranceId,
    recordingError: input.recordingError,
    ...(input.overlapCycleToast !== undefined ? { overlapCycleToast: input.overlapCycleToast } : {}),
    ...(input.lockConflictToast !== undefined ? { lockConflictToast: input.lockConflictToast } : {}),
    tf: input.tfB,
    ...(input.activeTextPrimaryLanguageId !== undefined ? { activeTextPrimaryLanguageId: input.activeTextPrimaryLanguageId } : {}),
    getActiveTextPrimaryLanguageId: input.getActiveTextPrimaryLanguageId,
    executeAction: input.executeAction,
    handleResolveVoiceIntentWithLlm: input.handleResolveVoiceIntentWithLlm,
    handleVoiceDictation: input.handleVoiceDictation,
    handleVoiceAnalysisResult: input.handleVoiceAnalysisResult,
    selection: input.selectionSnapshot,
    ...(input.defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId: input.defaultTranscriptionLayerId } : {}),
    translationLayers: input.translationLayers,
    layers: input.layers,
    formatLayerRailLabel: input.formatLayerRailLabel,
    formatTime: input.formatTime,
    onRegisterToggleVoice: (handler) => {
      input.toggleVoiceRef.current = handler;
    },
  }), [input]);

  const analysisRuntimeProps = useMemo(() => createAnalysisRuntimeProps({
    selectedUtterance: input.selectionSnapshot.selectedUtterance,
    utterancesOnCurrentMedia: input.utterancesOnCurrentMedia,
    getUtteranceTextForLayer: input.getUtteranceTextForLayer,
    formatTime: input.formatTime,
    onJumpToCitation: input.handleJumpToCitation,
    onJumpToEmbeddingMatch: input.handleJumpToEmbeddingMatch,
    embeddingProviderConfig: input.embeddingProviderConfig,
    onEmbeddingProviderConfigChange: input.setEmbeddingProviderConfig,
    externalErrorMessage: input.aiSidebarError,
  }), [input]);

  const pdfRuntimeProps = useMemo(() => createPdfRuntimeProps({
    locale: input.locale,
    request: input.pdfPreviewRequest,
    onCloseRequest: handleClosePdfPreviewRequest,
  }), [handleClosePdfPreviewRequest, input.locale, input.pdfPreviewRequest]);

  return {
    assistantRuntimeProps,
    analysisRuntimeProps,
    pdfRuntimeProps,
  };
}