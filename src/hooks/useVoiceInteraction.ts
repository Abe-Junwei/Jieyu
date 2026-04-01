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
import type { LayerDocType } from '../db';
import type { DictationPipelineCallbacks, QuickDictationConfig } from '../services/SpeechAnnotationPipeline';

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

interface SelectedUtteranceLike {
  id: string;
  startTime: number;
  endTime: number;
}

interface VoiceSelectionLike {
  activeUtteranceUnitId: string | null;
  selectedUtterance: SelectedUtteranceLike | null;
  selectedRowMeta: SelectedRowMetaLike | null;
  selectedLayerId: string | null;
  selectedUnitKind: 'utterance' | 'segment' | null;
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
    utteranceId: string | null,
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
  commercialProviderKind,
  commercialProviderConfig,
  onCommercialConfigChange,
  setCommercialProviderKind,
  setCommercialProviderConfig,
  featureVoiceEnabled,
  toggleVoiceRef,
}: UseVoiceInteractionOptions): UseVoiceInteractionReturn {
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
        const utteranceId = selection.activeUtteranceUnitId;
        voiceAgentRef.current?.setAnalysisFillCallback?.(utteranceId, (analysisText) => {
          runVoiceTask(async () => {
            const result = await onVoiceAnalysisResult(utteranceId, analysisText);
            if (!result) {
              voiceAgentRef.current?.setExternalError(null);
              setAnalysisWritebackFeedback({ kind: 'done', message: 'AI \u5206\u6790\u7ed3\u679c\u5df2\u5199\u56de。' });
              return;
            }
            const ok = result.ok !== false;
            const normalizedMessage = result.message?.trim() || (ok ? 'AI \u5206\u6790\u7ed3\u679c\u5df2\u5199\u56de。' : 'AI \u5206\u6790\u5199\u56de\u5931\u8d25。');
            setAnalysisWritebackFeedback({ kind: ok ? 'done' : 'error', message: normalizedMessage });
            voiceAgentRef.current?.setExternalError(ok ? null : normalizedMessage);
          }, 'AI \u5206\u6790\u5199\u56de\u5931\u8d25。', (message) => {
            setAnalysisWritebackFeedback({ kind: 'error', message });
          });
        });
        await aiChatSend(text);
      }, '\u53d1\u9001\u5230 AI \u5931\u8d25。', (message) => {
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
  };

  const voiceAgent = useVoiceAgent(voiceAgentOptions);
  voiceAgentRef.current = voiceAgent;

  const voiceTargetSummary = useMemo(() => {
    const hasSelection = Boolean(selection.selectedRowMeta || selection.selectedUtterance);
    const rowLabel = selection.selectedUnitKind === 'segment'
      ? '\u5f53\u524d\u72ec\u7acb\u6bb5'
      : selection.selectedRowMeta
        ? `\u7b2c ${selection.selectedRowMeta.rowNumber} \u53e5`
        : (selection.selectedUtterance ? '\u5f53\u524d\u53e5\u6bb5' : '\u672a\u9009\u62e9\u53e5\u6bb5');

    if (voiceAgent.mode === 'command') {
      return '\u5f53\u524d\u9875\u9762\u64cd\u4f5c';
    }

    if (voiceAgent.mode === 'analysis') {
      return hasSelection ? `${rowLabel} / AI \u5206\u6790\u5907\u6ce8` : '\u672a\u9009\u62e9\u53e5\u6bb5';
    }

    // \u89e3\u6790\u9996\u9009\u5c42 ID：selectedLayerId \u53ef\u80fd\u662f\u7a7a\u4e32，\u9700 trim \u540e\u5224\u65ad | resolve preferred layer ID with empty-string guard
    const normalizedSelected = selection.selectedLayerId?.trim();
    const targetLayerId = normalizedSelected || defaultTranscriptionLayerId || translationLayers[0]?.id;
    const targetLayer = targetLayerId ? layers.find((layer) => layer.id === targetLayerId) : undefined;
    const layerLabel = targetLayer ? formatSidePaneLayerLabel(targetLayer) : '\u672a\u9009\u62e9\u5c42';
    return `${layerLabel} / ${rowLabel}`;
  }, [
    defaultTranscriptionLayerId,
    formatSidePaneLayerLabel,
    layers,
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
        return voiceAgent.mode === 'dictation' ? '\u6b63\u5728\u542c\u5199，\u8bf7\u76f4\u63a5\u8bf4\u51fa\u8981\u5199\u5165\u7684\u5185\u5bb9。' : '\u6b63\u5728\u76d1\u542c，\u8bf7\u5f00\u59cb\u8bf4\u8bdd。';
      case 'routing':
        return '\u5df2\u8bc6\u522b\u8bed\u97f3，\u6b63\u5728\u5224\u65ad\u610f\u56fe。';
      case 'executing':
        if (voiceAgent.mode === 'dictation') return '\u6b63\u5728\u5c06\u8bc6\u522b\u7ed3\u679c\u5199\u5165\u6587\u672c\u6846。';
        if (voiceAgent.mode === 'analysis') return '\u6b63\u5728\u51c6\u5907\u53d1\u9001\u5230 AI \u5206\u6790。';
        return '\u6b63\u5728\u6267\u884c\u8bed\u97f3\u64cd\u4f5c。';
      case 'ai-thinking':
        return '\u6b63\u5728\u7b49\u5f85 AI \u5904\u7406\u7ed3\u679c。';
      case 'idle':
      default:
        if (voiceAgent.mode === 'analysis' && analysisWritebackFeedback) {
          return analysisWritebackFeedback.message;
        }
        if (pushToTalkReady) {
          return '\u8bed\u97f3\u901a\u9053\u5df2\u5c31\u7eea，\u6309\u4f4f\u9ea6\u514b\u98ce\u5f00\u59cb\u5f55\u97f3。';
        }
        return voiceAgent.listening ? '\u8bed\u97f3\u901a\u9053\u5df2\u5f00\u542f，\u7b49\u5f85\u4e0b\u4e00\u53e5\u8f93\u5165。' : '\u5c31\u7eea，\u70b9\u51fb\u9ea6\u514b\u98ce\u5f00\u59cb\u8bed\u97f3\u4ea4\u4e92。';
    }
  }, [analysisWritebackFeedback, pushToTalkReady, voiceAgent.agentState, voiceAgent.error, voiceAgent.listening, voiceAgent.mode]);

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
      ? '\u81ea\u52a8\u68c0\u6d4b'
      : formatLanguageLabel(voiceCorpusLangOverride ?? effectiveVoiceCorpusLang);
    const currentEngine = voiceAgent.engine === 'web-speech'
      ? 'Web Speech'
      : voiceAgent.engine === 'whisper-local'
        ? 'Ollama Whisper'
        : '\u5546\u4e1a\u6a21\u578b';
    const detectedLanguage = voiceCorpusLangOverride === '__auto__' && voiceAgent.detectedLang
      ? ` · \u5df2\u8bc6\u522b ${formatLanguageLabel(voiceAgent.detectedLang)}`
      : '';
    return `${currentLanguage} · ${currentEngine}${detectedLanguage}`;
  }, [effectiveVoiceCorpusLang, voiceCorpusLangOverride, voiceAgent.detectedLang, voiceAgent.engine]);

  const voiceSelectionSummary = useMemo(() => {
    if (selection.selectedTimeRangeLabel) {
      return selection.selectedTimeRangeLabel;
    }
    if (selection.selectedRowMeta) {
      return `${formatTime(selection.selectedRowMeta.start)} - ${formatTime(selection.selectedRowMeta.end)}`;
    }
    if (selection.selectedUtterance) {
      return `${formatTime(selection.selectedUtterance.startTime)} - ${formatTime(selection.selectedUtterance.endTime)}`;
    }
    return '\u672a\u5b9a\u4f4d\u53e5\u6bb5';
  }, [formatTime, selection]);

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
      voiceAgent.setExternalError(result.error ?? '\u672c\u5730 Whisper \u4e0d\u53ef\u7528');
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
    }, '\u8bed\u97f3\u5207\u6362\u5931\u8d25。');
  }, [ensureWhisperLocalReady, runVoiceTask, voiceAgent]);

  const handleVoiceSwitchEngine = useCallback((engine: SttEngine) => {
    runVoiceTask(async () => {
      if (engine === 'whisper-local') {
        const ready = await ensureWhisperLocalReady();
        if (!ready) return;
      }
      voiceAgent.switchEngine(engine);
    }, '\u8bed\u97f3\u5f15\u64ce\u5207\u6362\u5931\u8d25。');
  }, [ensureWhisperLocalReady, runVoiceTask, voiceAgent]);

  const handleMicPointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    void event;
    if (voiceAgent.listening && voiceAgent.engine === 'whisper-local') {
      runVoiceTask(async () => {
        const ready = await ensureWhisperLocalReady();
        if (!ready) return;
        await voiceAgent.startRecording();
      }, '\u5f55\u97f3\u542f\u52a8\u5931\u8d25。');
    }
  }, [ensureWhisperLocalReady, runVoiceTask, voiceAgent]);

  const handleMicPointerUp = useCallback(() => {
    if (voiceAgent.listening && voiceAgent.engine === 'whisper-local') {
      runVoiceTask(async () => {
        await voiceAgent.stopRecording();
      }, '\u5f55\u97f3\u505c\u6b62\u5931\u8d25。');
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
