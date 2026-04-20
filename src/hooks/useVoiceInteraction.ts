/**
 * useVoiceInteraction | \u8bed\u97f3\u4ea4\u4e92\u7f16\u6392 Hook
 *
 * \u805a\u5408 useVoiceAgent \u7684\u9875\u9762\u7ea7\u63a5\u7ebf：\u6458\u8981\u6587\u6848、AI \u6d41\u72b6\u6001\u6865\u63a5、
 * \u8bed\u97f3\u5165\u53e3\u4ea4\u4e92（\u5207\u6362/\u6309\u4f4f\u5f55\u97f3）、\u5546\u4e1a\u5f15\u64ce\u914d\u7f6e\u540c\u6b65\u4e0e\u52a9\u624b\u9762\u677f\u5c55\u5f00\u903b\u8f91。
 *
 * Aggregates page-level wiring around useVoiceAgent: summaries,
 * AI stream bridge, voice entry handlers (toggle/press-to-talk),
 * commercial engine config sync, and assistant panel expansion behavior.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useVoiceAgent } from './useVoiceAgent';
import { applyVoiceCommercialConfigChange } from '../utils/voiceCommercialConfigSync';
import type { CommercialProviderKind, SttEngine } from '../services/VoiceInputService';
import { getActiveSttProviderMetadata } from '../services/stt/providerMetadata';
import type { SttEnhancementConfig, SttEnhancementSelectionKind } from '../services/stt';
import type { LayerDocType } from '../db';
import type { DictationPipelineCallbacks, QuickDictationConfig } from '../services/SpeechAnnotationPipeline';
import { useLocale } from '../i18n';
import { getVoiceInteractionMessages } from '../i18n/voiceInteractionMessages';
import { resolveHostAwareTranslationLayerIdFromSnapshot } from '../utils/translationLayerTargetResolver';

interface VoiceMessageLike {
  role?: string;
  status?: string;
  content?: string;
}

interface SelectedRowMetaLike {
  rowNumber: number;
  start: number;
  end: number;
}

interface SelectedUnitLike {
  id: string;
  layerId?: string;
  startTime: number;
  endTime: number;
}

interface VoiceSelectionLike {
  activeUnitId: string | null;
  selectedUnit: SelectedUnitLike | null;
  selectedRowMeta: SelectedRowMetaLike | null;
  selectedLayerId: string | null;
  selectedUnitKind: 'unit' | 'segment' | null;
  selectedTimeRangeLabel?: string;
}

interface LocalWhisperConfigLike {
  baseUrl?: string;
  model?: string;
}

interface CommercialProviderConfigLike {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  appId?: string;
  accessToken?: string;
}

interface UseVoiceInteractionOptions {
  effectiveVoiceCorpusLang: string;
  voiceCorpusLangOverride: string | null;
  executeAction: Parameters<typeof useVoiceAgent>[0]['executeAction'];
  handleResolveVoiceIntentWithLlm: NonNullable<Parameters<typeof useVoiceAgent>[0]['resolveIntentWithLlm']>;
  handleVoiceDictation: NonNullable<Parameters<typeof useVoiceAgent>[0]['insertDictation']>;
  dictationPipeline?: {
    callbacks: DictationPipelineCallbacks;
    config?: QuickDictationConfig;
  };
  onVoiceAnalysisResult: (
    unitId: string | null,
    analysisText: string,
  ) => Promise<{ ok: boolean; message?: string } | void> | { ok: boolean; message?: string } | void;
  selection: VoiceSelectionLike;
  defaultTranscriptionLayerId?: string;
  translationLayers: LayerDocType[];
  layers: LayerDocType[];
  formatSidePaneLayerLabel: (layer: LayerDocType) => string;
  formatTime: (seconds: number) => string;
  aiChatSend: (text: string) => Promise<unknown>;
  aiIsStreaming: boolean;
  aiMessages: VoiceMessageLike[];
  localWhisperConfig: LocalWhisperConfigLike;
  sttEnhancementKind?: SttEnhancementSelectionKind;
  sttEnhancementConfig?: SttEnhancementConfig;
  commercialProviderKind: CommercialProviderKind;
  commercialProviderConfig?: CommercialProviderConfigLike;
  onCommercialConfigChange: (config: CommercialProviderConfigLike) => void;
  setCommercialProviderKind: (kind: CommercialProviderKind) => void;
  setCommercialProviderConfig: (config: CommercialProviderConfigLike) => void;
  featureVoiceEnabled: boolean;
  toggleVoiceRef: RefObject<(() => void) | undefined>;
}

interface UseVoiceInteractionReturn {
  voiceAgent: ReturnType<typeof useVoiceAgent>;
  assistantVoiceExpanded: boolean;
  voiceTargetSummary: string;
  voiceStatusSummary: string;
  voiceEnvironmentSummary: string;
  voiceSelectionSummary: string;
  handleVoiceCommercialConfigChange: (config: CommercialProviderConfigLike) => void;
  handleVoiceAssistantIconClick: () => void;
  handleVoiceSwitchEngine: (engine: SttEngine) => void;
  handleMicPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  handleMicPointerUp: () => void;
  handleAssistantVoicePanelOpen: () => void;
  handleAssistantVoicePanelToggle: () => void;
}

function formatLanguageLabel(code: string): string {
  try {
    return new Intl.DisplayNames(['zh-CN', 'en'], { type: 'language' }).of(code) || code;
  } catch (err) {
    console.error('[Jieyu] useVoiceInteraction: formatLanguageLabel failed', { code, err });
    return code;
  }
}

export function useVoiceInteraction({
  effectiveVoiceCorpusLang,
  voiceCorpusLangOverride,
  executeAction,
  handleResolveVoiceIntentWithLlm,
  handleVoiceDictation,
  dictationPipeline,
  onVoiceAnalysisResult,
  selection,
  defaultTranscriptionLayerId,
  translationLayers,
  layers,
  formatSidePaneLayerLabel,
  formatTime,
  aiChatSend,
  aiIsStreaming,
  aiMessages,
  localWhisperConfig,
  sttEnhancementKind = 'none',
  sttEnhancementConfig = {},
  commercialProviderKind,
  commercialProviderConfig,
  onCommercialConfigChange,
  setCommercialProviderKind,
  setCommercialProviderConfig,
  featureVoiceEnabled,
  toggleVoiceRef,
}: UseVoiceInteractionOptions): UseVoiceInteractionReturn {
  const locale = useLocale();
  const messages = getVoiceInteractionMessages(locale);
  const [assistantVoiceExpanded, setAssistantVoiceExpanded] = useState(false);
  const [analysisWritebackFeedback, setAnalysisWritebackFeedback] = useState<{
    kind: 'done' | 'error';
    message: string;
  } | null>(null);

  const voiceAgentRef = useRef<ReturnType<typeof useVoiceAgent> | null>(null);

  const normalizeVoiceTaskError = useCallback((error: unknown, fallbackMessage: string): string => {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }
    return fallbackMessage;
  }, []);

  const runVoiceTask = useCallback((
    task: () => Promise<void>,
    fallbackMessage: string,
    onError?: (message: string) => void,
  ) => {
    void task().catch((error) => {
      const message = normalizeVoiceTaskError(error, fallbackMessage);
      voiceAgentRef.current?.setExternalError?.(message);
      onError?.(message);
    });
  }, [normalizeVoiceTaskError]);

  const voiceAgentOptions: Parameters<typeof useVoiceAgent>[0] = {
    corpusLang: effectiveVoiceCorpusLang,
    langOverride: voiceCorpusLangOverride,
    executeAction,
    sendToAiChat: (text: string) => {
      runVoiceTask(async () => {
        const unitId = selection.activeUnitId;
        voiceAgentRef.current?.setAnalysisFillCallback?.(unitId, (analysisText) => {
          runVoiceTask(async () => {
            const result = await onVoiceAnalysisResult(unitId, analysisText);
            if (!result) {
              voiceAgentRef.current?.setExternalError(null);
              setAnalysisWritebackFeedback({ kind: 'done', message: messages.analysisWritebackDone });
              return;
            }
            const ok = result.ok !== false;
            const normalizedMessage = result.message?.trim() || (ok ? messages.analysisWritebackDone : messages.analysisWritebackFailed);
            setAnalysisWritebackFeedback({ kind: ok ? 'done' : 'error', message: normalizedMessage });
            voiceAgentRef.current?.setExternalError(ok ? null : normalizedMessage);
          }, messages.analysisWritebackFailed, (message) => {
            setAnalysisWritebackFeedback({ kind: 'error', message });
          });
        });
        await aiChatSend(text);
      }, messages.sendToAiFailed, (message) => {
        voiceAgentRef.current?.setAnalysisFillCallback?.(null, null);
        setAnalysisWritebackFeedback({ kind: 'error', message });
      });
    },
    resolveIntentWithLlm: handleResolveVoiceIntentWithLlm,
    insertDictation: handleVoiceDictation,
    ...(dictationPipeline !== undefined ? { dictationPipeline } : {}),
    ...(localWhisperConfig.baseUrl ? { whisperServerUrl: localWhisperConfig.baseUrl } : {}),
    ...(localWhisperConfig.model ? { whisperServerModel: localWhisperConfig.model } : {}),
    commercialProviderKind,
    ...(commercialProviderConfig !== undefined ? { commercialProviderConfig } : {}),
    sttEnhancementKind,
    sttEnhancementConfig,
  };

  const voiceAgent = useVoiceAgent(voiceAgentOptions);
  voiceAgentRef.current = voiceAgent;

  const voiceTargetSummary = useMemo(() => {
    const hasSelection = Boolean(selection.selectedRowMeta || selection.selectedUnit);
    const rowLabel = selection.selectedUnitKind === 'segment'
      ? messages.currentIndependentSegment
      : selection.selectedRowMeta
        ? messages.currentSentenceWithIndex(selection.selectedRowMeta.rowNumber)
        : (selection.selectedUnit ? messages.currentUnit : messages.noUnitSelected);

    if (voiceAgent.mode === 'command') {
      return messages.currentPageAction;
    }

    if (voiceAgent.mode === 'analysis') {
      return hasSelection ? `${rowLabel} / ${messages.analysisNoteSuffix}` : messages.noUnitSelected;
    }

    // \u89e3\u6790\u9996\u9009\u5c42 ID：selectedLayerId \u53ef\u80fd\u662f\u7a7a\u4e32，\u9700 trim \u540e\u5224\u65ad | resolve preferred layer ID with empty-string guard
    const normalizedSelected = selection.selectedLayerId?.trim();
    const selectedLayer = normalizedSelected
      ? layers.find((layer) => layer.id === normalizedSelected)
      : undefined;
    const defaultLayer = defaultTranscriptionLayerId?.trim()
      ? layers.find((layer) => layer.id === defaultTranscriptionLayerId.trim())
      : undefined;
    const fallbackTranslationLayerId = resolveHostAwareTranslationLayerIdFromSnapshot({
      selectedLayerId: selection.selectedLayerId,
      selectedUnitLayerId: selection.selectedUnit?.layerId,
      defaultTranscriptionLayerId,
      translationLayers,
    });
    const fallbackTranslationLayer = fallbackTranslationLayerId
      ? layers.find((layer) => layer.id === fallbackTranslationLayerId)
      : undefined;
    const targetLayer = selectedLayer ?? defaultLayer ?? fallbackTranslationLayer;
    const layerLabel = targetLayer ? formatSidePaneLayerLabel(targetLayer) : messages.noLayerSelected;
    return messages.targetSummary(layerLabel, rowLabel);
  }, [
    defaultTranscriptionLayerId,
    formatSidePaneLayerLabel,
    layers,
    messages,
    selection,
    translationLayers,
    voiceAgent.mode,
  ]);

  const pushToTalkReady = useMemo(() => (
    voiceAgent.listening
    && !voiceAgent.isRecording
    && voiceAgent.agentState === 'idle'
    && (voiceAgent.engine === 'whisper-local' || voiceAgent.engine === 'commercial')
  ), [voiceAgent.agentState, voiceAgent.engine, voiceAgent.isRecording, voiceAgent.listening]);

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
        if (voiceAgent.mode === 'analysis' && analysisWritebackFeedback) {
          return analysisWritebackFeedback.message;
        }
        if (pushToTalkReady) {
          return messages.pushToTalkReady;
        }
        return voiceAgent.listening ? messages.listeningIdle : messages.readyToStart;
    }
  }, [analysisWritebackFeedback, messages, pushToTalkReady, voiceAgent.agentState, voiceAgent.error, voiceAgent.listening, voiceAgent.mode]);

  useEffect(() => {
    if (voiceAgent.mode !== 'analysis' && analysisWritebackFeedback) {
      setAnalysisWritebackFeedback(null);
    }
  }, [analysisWritebackFeedback, voiceAgent.mode]);

  useEffect(() => {
    if (!analysisWritebackFeedback) return;
    if (typeof window === 'undefined') return;
    const timerId = window.setTimeout(() => {
      setAnalysisWritebackFeedback(null);
    }, 4500);
    return () => window.clearTimeout(timerId);
  }, [analysisWritebackFeedback]);

  const voiceEnvironmentSummary = useMemo(() => {
    const currentLanguage = voiceCorpusLangOverride === '__auto__'
      ? messages.autoDetectLanguage
      : formatLanguageLabel(voiceCorpusLangOverride ?? effectiveVoiceCorpusLang);
    const currentEngine = getActiveSttProviderMetadata(
      voiceAgent.engine,
      voiceAgent.commercialProviderKind,
    ).label;
    const detectedLanguage = voiceCorpusLangOverride === '__auto__' && voiceAgent.detectedLang
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

  const voiceSelectionSummary = useMemo(() => {
    if (selection.selectedTimeRangeLabel) {
      return selection.selectedTimeRangeLabel;
    }
    if (selection.selectedRowMeta) {
      return `${formatTime(selection.selectedRowMeta.start)} - ${formatTime(selection.selectedRowMeta.end)}`;
    }
    if (selection.selectedUnit) {
      return `${formatTime(selection.selectedUnit.startTime)} - ${formatTime(selection.selectedUnit.endTime)}`;
    }
    return messages.unknownSegment;
  }, [formatTime, messages, selection]);

  const prevAiStreamingRef = useRef(false);

  useEffect(() => {
    const wasStreaming = prevAiStreamingRef.current;
    const isStreaming = aiIsStreaming;

    if (!wasStreaming && isStreaming) {
      voiceAgent.notifyAiStreamStarted?.();
    }

    if (wasStreaming && !isStreaming) {
      const latestAssistant = aiMessages.find((m) => m.role === 'assistant' && m.status === 'done');
      voiceAgent.notifyAiStreamFinished?.(latestAssistant?.content);
    }

    prevAiStreamingRef.current = isStreaming;
  }, [aiIsStreaming, aiMessages, voiceAgent]);

  const ensureWhisperLocalReady = useCallback(async (): Promise<boolean> => {
    const result = await voiceAgent.testWhisperLocal();
    if (!result.available) {
      voiceAgent.setExternalError(result.error ?? 'Local Whisper unavailable');
      return false;
    }
    voiceAgent.setExternalError(null);
    return true;
  }, [voiceAgent]);

  const handleVoiceCommercialConfigChange = useCallback((config: CommercialProviderConfigLike) => {
    applyVoiceCommercialConfigChange(config, onCommercialConfigChange, voiceAgent.setCommercialProviderConfig);
  }, [onCommercialConfigChange, voiceAgent]);

  useEffect(() => {
    setCommercialProviderKind(voiceAgent.commercialProviderKind);
  }, [setCommercialProviderKind, voiceAgent.commercialProviderKind]);

  useEffect(() => {
    setCommercialProviderConfig(voiceAgent.commercialProviderConfig ?? {});
  }, [setCommercialProviderConfig, voiceAgent.commercialProviderConfig]);

  useEffect(() => {
    toggleVoiceRef.current = featureVoiceEnabled ? voiceAgent.toggle : undefined;
  }, [featureVoiceEnabled, toggleVoiceRef, voiceAgent.toggle]);

  const handleVoiceAssistantIconClick = useCallback(() => {
    runVoiceTask(async () => {
      if (voiceAgent.listening) {
        voiceAgent.toggle();
        return;
      }
      if (voiceAgent.engine === 'whisper-local') {
        const ready = await ensureWhisperLocalReady();
        if (!ready) return;
      }
      voiceAgent.toggle();
    }, 'Failed to toggle voice mode.');
  }, [ensureWhisperLocalReady, runVoiceTask, voiceAgent]);

  const handleVoiceSwitchEngine = useCallback((engine: SttEngine) => {
    runVoiceTask(async () => {
      if (engine === 'whisper-local') {
        const ready = await ensureWhisperLocalReady();
        if (!ready) return;
      }
      voiceAgent.switchEngine(engine);
    }, 'Failed to switch voice engine.');
  }, [ensureWhisperLocalReady, runVoiceTask, voiceAgent]);

  const handleMicPointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    void event;
    if (voiceAgent.listening && voiceAgent.engine === 'whisper-local') {
      runVoiceTask(async () => {
        const ready = await ensureWhisperLocalReady();
        if (!ready) return;
        await voiceAgent.startRecording();
      }, 'Failed to start recording.');
    }
  }, [ensureWhisperLocalReady, runVoiceTask, voiceAgent]);

  const handleMicPointerUp = useCallback(() => {
    if (voiceAgent.listening && voiceAgent.engine === 'whisper-local') {
      runVoiceTask(async () => {
        await voiceAgent.stopRecording();
      }, 'Failed to stop recording.');
    }
  }, [runVoiceTask, voiceAgent]);

  const handleAssistantVoicePanelToggle = useCallback(() => {
    setAssistantVoiceExpanded((value) => !value);
  }, []);

  const handleAssistantVoicePanelOpen = useCallback(() => {
    setAssistantVoiceExpanded(true);
  }, []);

  const disambiguationOptionCount = voiceAgent.disambiguationOptions?.length ?? 0;

  useEffect(() => {
    if (
      voiceAgent.listening
      || voiceAgent.isRecording
      || Boolean(voiceAgent.pendingConfirm)
      || disambiguationOptionCount > 0
      || Boolean(voiceAgent.error)
    ) {
      setAssistantVoiceExpanded(true);
    }
  }, [disambiguationOptionCount, voiceAgent.error, voiceAgent.isRecording, voiceAgent.listening, voiceAgent.pendingConfirm]);

  return {
    voiceAgent,
    assistantVoiceExpanded,
    voiceTargetSummary,
    voiceStatusSummary,
    voiceEnvironmentSummary,
    voiceSelectionSummary,
    handleVoiceCommercialConfigChange,
    handleVoiceAssistantIconClick,
    handleVoiceSwitchEngine,
    handleMicPointerDown,
    handleMicPointerUp,
    handleAssistantVoicePanelOpen,
    handleAssistantVoicePanelToggle,
  };
}
