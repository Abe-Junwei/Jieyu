import { useMemo, type MutableRefObject } from 'react';
import type { LayerDocType } from '../db';
import type { VoiceIntent, VoiceSession } from '../services/IntentRouter';
import type { VoiceAgentMode } from '../hooks/useVoiceAgent';
import type { SaveState } from '../hooks/transcriptionTypes';
import type { OrthographyPreviewTextProps } from '../utils/layerDisplayStyle';
import type { DictationPipelineCallbacks, QuickDictationConfig } from '../services/SpeechAnnotationPipeline';
import type { TranscriptionPageAssistantRuntimeProps } from './TranscriptionPage.runtimeContracts';
import { createAssistantRuntimeProps } from './TranscriptionPage.runtimeProps';
import type { TranscriptionSelectionSnapshot } from './transcriptionSelectionSnapshot';

type UseTranscriptionAssistantRuntimeProps = Omit<TranscriptionPageAssistantRuntimeProps, 'locale' | 'aiChatContextValue'>;

interface UseTranscriptionAssistantRuntimePropsInput {
  saveState: SaveState;
  recording: boolean;
  recordingUtteranceId: string | null;
  recordingError: string | null;
  overlapCycleToast?: { index: number; total: number; nonce: number } | null;
  lockConflictToast?: { count: number; speakers: string[]; nonce: number } | null;
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
}

export function useTranscriptionAssistantRuntimeProps(
  input: UseTranscriptionAssistantRuntimePropsInput,
): UseTranscriptionAssistantRuntimeProps {
  return useMemo(() => createAssistantRuntimeProps({
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
    ...(input.dictationPreviewTextProps !== undefined ? { dictationPreviewTextProps: input.dictationPreviewTextProps } : {}),
    ...(input.dictationPipeline !== undefined ? { dictationPipeline: input.dictationPipeline } : {}),
    formatSidePaneLayerLabel: input.formatSidePaneLayerLabel,
    formatTime: input.formatTime,
    onRegisterToggleVoice: (handler) => {
      input.toggleVoiceRef.current = handler;
    },
  }), [
    input.activeTextPrimaryLanguageId,
    input.defaultTranscriptionLayerId,
    input.dictationPipeline,
    input.dictationPreviewTextProps,
    input.executeAction,
    input.formatSidePaneLayerLabel,
    input.formatTime,
    input.getActiveTextPrimaryLanguageId,
    input.handleResolveVoiceIntentWithLlm,
    input.handleVoiceAnalysisResult,
    input.handleVoiceDictation,
    input.layers,
    input.lockConflictToast,
    input.overlapCycleToast,
    input.recording,
    input.recordingError,
    input.recordingUtteranceId,
    input.saveState,
    input.selectionSnapshot,
    input.tfB,
    input.toggleVoiceRef,
    input.translationLayers,
  ]);
}
