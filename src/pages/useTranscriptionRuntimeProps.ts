import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { LayerDocType, UtteranceDocType } from '../db';
import { utteranceDocForSpeakerTargetFromUnitView } from './timelineUnitViewUtteranceHelpers';
import type { VoiceIntent, VoiceSession } from '../services/IntentRouter';
import type { VoiceAgentMode } from '../hooks/useVoiceAgent';
import type { SaveState } from '../hooks/transcriptionTypes';
import type { Locale } from '../i18n';
import type { OrthographyPreviewTextProps } from '../utils/layerDisplayStyle';
import type { DictationPipelineCallbacks, QuickDictationConfig } from '../services/SpeechAnnotationPipeline';
import type {
  PdfPreviewOpenRequest,
  TranscriptionPageAnalysisRuntimeProps,
  TranscriptionPageAssistantRuntimeProps,
  TranscriptionPageEmbeddingProviderConfig,
  TranscriptionPagePdfRuntimeProps,
} from './TranscriptionPage.runtimeContracts';
import type { TranscriptionSelectionSnapshot } from './transcriptionSelectionSnapshot';
import { useTranscriptionAssistantRuntimeProps } from './useTranscriptionAssistantRuntimeProps';
import { useTranscriptionAnalysisRuntimeProps } from './useTranscriptionAnalysisRuntimeProps';
import { useTranscriptionPdfRuntimeProps } from './useTranscriptionPdfRuntimeProps';

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
  dictationPreviewTextProps?: OrthographyPreviewTextProps;
  dictationPipeline?: {
    callbacks: DictationPipelineCallbacks;
    config?: QuickDictationConfig;
  };
  formatSidePaneLayerLabel: (layer: LayerDocType) => string;
  formatTime: (seconds: number) => string;
  toggleVoiceRef: MutableRefObject<(() => void) | undefined>;
  utterancesOnCurrentMedia: UtteranceDocType[];
  getUtteranceDocById: (id: string) => UtteranceDocType | undefined;
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
  const assistantRuntimeProps = useTranscriptionAssistantRuntimeProps({
    saveState: input.saveState,
    recording: input.recording,
    recordingUtteranceId: input.recordingUtteranceId,
    recordingError: input.recordingError,
    ...(input.overlapCycleToast !== undefined ? { overlapCycleToast: input.overlapCycleToast } : {}),
    ...(input.lockConflictToast !== undefined ? { lockConflictToast: input.lockConflictToast } : {}),
    tfB: input.tfB,
    ...(input.activeTextPrimaryLanguageId !== undefined ? { activeTextPrimaryLanguageId: input.activeTextPrimaryLanguageId } : {}),
    getActiveTextPrimaryLanguageId: input.getActiveTextPrimaryLanguageId,
    executeAction: input.executeAction,
    handleResolveVoiceIntentWithLlm: input.handleResolveVoiceIntentWithLlm,
    handleVoiceDictation: input.handleVoiceDictation,
    handleVoiceAnalysisResult: input.handleVoiceAnalysisResult,
    selectionSnapshot: input.selectionSnapshot,
    ...(input.defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId: input.defaultTranscriptionLayerId } : {}),
    translationLayers: input.translationLayers,
    layers: input.layers,
    ...(input.dictationPreviewTextProps !== undefined ? { dictationPreviewTextProps: input.dictationPreviewTextProps } : {}),
    ...(input.dictationPipeline !== undefined ? { dictationPipeline: input.dictationPipeline } : {}),
    formatSidePaneLayerLabel: input.formatSidePaneLayerLabel,
    formatTime: input.formatTime,
    toggleVoiceRef: input.toggleVoiceRef,
  });

  const analysisRuntimeProps = useTranscriptionAnalysisRuntimeProps({
    selectedUnit: utteranceDocForSpeakerTargetFromUnitView(
      input.selectionSnapshot.selectedUnit,
      input.getUtteranceDocById,
    ),
    utterancesOnCurrentMedia: input.utterancesOnCurrentMedia,
    getUtteranceTextForLayer: input.getUtteranceTextForLayer,
    formatTime: input.formatTime,
    handleJumpToCitation: input.handleJumpToCitation,
    handleJumpToEmbeddingMatch: input.handleJumpToEmbeddingMatch,
    embeddingProviderConfig: input.embeddingProviderConfig,
    setEmbeddingProviderConfig: input.setEmbeddingProviderConfig,
    aiSidebarError: input.aiSidebarError,
  });

  const pdfRuntimeProps = useTranscriptionPdfRuntimeProps({
    locale: input.locale,
    pdfPreviewRequest: input.pdfPreviewRequest,
    setPdfPreviewRequest: input.setPdfPreviewRequest,
  });

  return {
    assistantRuntimeProps,
    analysisRuntimeProps,
    pdfRuntimeProps,
  };
}
