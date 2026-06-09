import { useEffect, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { LayerDocType, LayerLinkDocType } from '../../db';
import { getActiveSttProviderMetadata } from '../../services/stt/providerMetadata';
import {
  computeTranscriptionVoiceSelectionSummary,
  computeTranscriptionVoiceTargetSummary,
  type TranscriptionVoiceSelectionSnapshot,
} from '../../services/transcriptionVoiceInteractionWiring';
import { getVoiceInteractionMessages } from '../../i18n/messages';
import { createLogger } from '../../observability/logger';
import type { useVoiceAgent } from './useVoiceAgent';

const log = createLogger('useVoiceInteractionSummaries');

function formatLanguageLabel(code: string): string {
  try {
    return new Intl.DisplayNames(['zh-CN', 'en'], { type: 'language' }).of(code) || code;
  } catch (err) {
    log.error('formatLanguageLabel failed', { code, err });
    return code;
  }
}

export interface UseVoiceInteractionSummariesInput {
  effectiveVoiceCorpusLang: string;
  voiceCorpusLangOverride: string | null;
  selection: TranscriptionVoiceSelectionSnapshot;
  defaultTranscriptionLayerId?: string | undefined;
  translationLayers: LayerDocType[];
  layers: LayerDocType[];
  layerLinks?: LayerLinkDocType[] | undefined;
  formatSidePaneLayerLabel: (layer: LayerDocType) => string;
  formatTime: (seconds: number) => string;
  messages: ReturnType<typeof getVoiceInteractionMessages>;
  voiceAgent: ReturnType<typeof useVoiceAgent>;
  analysisWritebackFeedback: { kind: 'done' | 'error'; message: string } | null;
  setAnalysisWritebackFeedback: Dispatch<
    SetStateAction<{ kind: 'done' | 'error'; message: string } | null>
  >;
}

export function useVoiceInteractionSummaries({
  effectiveVoiceCorpusLang,
  voiceCorpusLangOverride,
  selection,
  defaultTranscriptionLayerId,
  translationLayers,
  layers,
  layerLinks,
  formatSidePaneLayerLabel,
  formatTime,
  messages,
  voiceAgent,
  analysisWritebackFeedback,
  setAnalysisWritebackFeedback,
}: UseVoiceInteractionSummariesInput) {
  const isNonDictationMode = voiceAgent.mode !== 'dictation';

  const voiceTargetSummary = useMemo(
    () =>
      computeTranscriptionVoiceTargetSummary({
        isNonDictationMode,
        selection,
        layers,
        translationLayers,
        ...(layerLinks !== undefined ? { layerLinks } : {}),
        ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
        formatSidePaneLayerLabel,
        messages,
      }),
    [
      defaultTranscriptionLayerId,
      formatSidePaneLayerLabel,
      isNonDictationMode,
      layers,
      layerLinks,
      messages,
      selection,
      translationLayers,
    ],
  );

  const pushToTalkReady = useMemo(
    () =>
      voiceAgent.listening &&
      !voiceAgent.isRecording &&
      voiceAgent.agentState === 'idle' &&
      (voiceAgent.engine === 'whisper-local' || voiceAgent.engine === 'commercial'),
    [voiceAgent.agentState, voiceAgent.engine, voiceAgent.isRecording, voiceAgent.listening],
  );

  const voiceStatusSummary = useMemo(() => {
    if (voiceAgent.error) {
      return voiceAgent.error;
    }
    switch (voiceAgent.agentState) {
      case 'listening':
        return voiceAgent.mode === 'dictation' ? messages.listeningDictation : messages.listening;
      case 'routing':
        return messages.routing;
      case 'executing':
        if (voiceAgent.mode === 'dictation') return messages.executingDictation;
        if (voiceAgent.mode === 'analysis') return messages.executingAnalysis;
        return messages.executingAction;
      case 'ai-thinking':
        return messages.aiThinking;
      case 'idle':
      default:
        if (isNonDictationMode && analysisWritebackFeedback) {
          return analysisWritebackFeedback.message;
        }
        if (pushToTalkReady) {
          return messages.pushToTalkReady;
        }
        return voiceAgent.listening ? messages.listeningIdle : messages.readyToStart;
    }
  }, [
    analysisWritebackFeedback,
    isNonDictationMode,
    messages,
    pushToTalkReady,
    voiceAgent.agentState,
    voiceAgent.error,
    voiceAgent.listening,
    voiceAgent.mode,
  ]);

  useEffect(() => {
    if (voiceAgent.mode === 'dictation' && analysisWritebackFeedback) {
      setAnalysisWritebackFeedback(null);
    }
  }, [analysisWritebackFeedback, setAnalysisWritebackFeedback, voiceAgent.mode]);

  useEffect(() => {
    if (!analysisWritebackFeedback) return;
    if (typeof window === 'undefined') return;
    const timerId = window.setTimeout(() => {
      setAnalysisWritebackFeedback(null);
    }, 4500);
    return () => window.clearTimeout(timerId);
  }, [analysisWritebackFeedback, setAnalysisWritebackFeedback]);

  const voiceEnvironmentSummary = useMemo(() => {
    const currentLanguage =
      voiceCorpusLangOverride === '__auto__'
        ? messages.autoDetectLanguage
        : formatLanguageLabel(voiceCorpusLangOverride ?? effectiveVoiceCorpusLang);
    const currentEngine = getActiveSttProviderMetadata(
      voiceAgent.engine,
      voiceAgent.commercialProviderKind,
    ).label;
    const detectedLanguage =
      voiceCorpusLangOverride === '__auto__' && voiceAgent.detectedLang
        ? messages.detectedLanguageSuffix(formatLanguageLabel(voiceAgent.detectedLang))
        : '';
    return `${currentLanguage} · ${currentEngine}${detectedLanguage}`;
  }, [
    effectiveVoiceCorpusLang,
    messages,
    voiceCorpusLangOverride,
    voiceAgent.commercialProviderKind,
    voiceAgent.detectedLang,
    voiceAgent.engine,
  ]);

  const voiceSelectionSummary = useMemo(
    () =>
      computeTranscriptionVoiceSelectionSummary({
        selection,
        formatTime,
        unknownSegmentLabel: messages.unknownSegment,
      }),
    [formatTime, messages.unknownSegment, selection],
  );

  return {
    voiceEnvironmentSummary,
    voiceSelectionSummary,
    voiceStatusSummary,
    voiceTargetSummary,
  };
}
