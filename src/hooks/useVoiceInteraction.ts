/**
 * useVoiceInteraction | 语音交互编排 Hook
 *
 * 聚合 useVoiceAgent 的页面级接线：摘要文案、AI 流状态桥接、
 * 语音入口交互（切换/按住录音）、商业引擎配置同步与助手面板展开逻辑。
 *
 * Aggregates page-level wiring around useVoiceAgent: summaries,
 * AI stream bridge, voice entry handlers (toggle/press-to-talk),
 * commercial engine config sync, and assistant panel expansion behavior.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useVoiceAgent } from './useVoiceAgent';
import { applyVoiceCommercialConfigChange } from '../utils/voiceCommercialConfigSync';
import type { CommercialProviderKind, SttEngine } from '../services/VoiceInputService';
import type { TranslationLayerDocType } from '../../db';

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
  onVoiceAnalysisResult: (utteranceId: string | null, analysisText: string) => void;
  selectedUtteranceId: string | null;
  selectedUtterance: SelectedUtteranceLike | null;
  selectedRowMeta: SelectedRowMetaLike | null;
  selectedLayerId: string | null;
  defaultTranscriptionLayerId?: string;
  translationLayers: TranslationLayerDocType[];
  layers: TranslationLayerDocType[];
  formatLayerRailLabel: (layer: TranslationLayerDocType) => string;
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
  handleAssistantVoicePanelToggle: () => void;
}

function formatLanguageLabel(code: string): string {
  try {
    return new Intl.DisplayNames(['zh-CN', 'en'], { type: 'language' }).of(code) || code;
  } catch {
    return code;
  }
}

export function useVoiceInteraction({
  effectiveVoiceCorpusLang,
  voiceCorpusLangOverride,
  executeAction,
  handleResolveVoiceIntentWithLlm,
  handleVoiceDictation,
  onVoiceAnalysisResult,
  selectedUtteranceId,
  selectedUtterance,
  selectedRowMeta,
  selectedLayerId,
  defaultTranscriptionLayerId,
  translationLayers,
  layers,
  formatLayerRailLabel,
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

  const voiceAgentRef = useRef<ReturnType<typeof useVoiceAgent> | null>(null);

  const voiceAgentOptions: Parameters<typeof useVoiceAgent>[0] = {
    corpusLang: effectiveVoiceCorpusLang,
    langOverride: voiceCorpusLangOverride,
    executeAction,
    sendToAiChat: (text: string) => {
      // 先注册分析回填，再发送 AI 消息 | Register fill-back callback before sending AI message
      void (async () => {
        const utteranceId = selectedUtteranceId;
        voiceAgentRef.current?.setAnalysisFillCallback?.(utteranceId, (analysisText) => {
          onVoiceAnalysisResult(utteranceId, analysisText);
        });
        await aiChatSend(text);
      })();
    },
    resolveIntentWithLlm: handleResolveVoiceIntentWithLlm,
    insertDictation: handleVoiceDictation,
    ...(localWhisperConfig.baseUrl ? { whisperServerUrl: localWhisperConfig.baseUrl } : {}),
    ...(localWhisperConfig.model ? { whisperServerModel: localWhisperConfig.model } : {}),
    commercialProviderKind,
    ...(commercialProviderConfig !== undefined ? { commercialProviderConfig } : {}),
  };

  const voiceAgent = useVoiceAgent(voiceAgentOptions);
  voiceAgentRef.current = voiceAgent;

  const voiceTargetSummary = useMemo(() => {
    const rowLabel = selectedRowMeta ? `第 ${selectedRowMeta.rowNumber} 句` : (selectedUtterance ? '当前句段' : '未选择句段');

    if (voiceAgent.mode === 'command') {
      return '当前页面操作';
    }

    if (voiceAgent.mode === 'analysis') {
      return selectedUtterance ? `${rowLabel} / AI 分析备注` : '未选择句段';
    }

    const targetLayerId = selectedLayerId ?? defaultTranscriptionLayerId ?? translationLayers[0]?.id;
    const targetLayer = targetLayerId ? layers.find((layer) => layer.id === targetLayerId) : undefined;
    const layerLabel = targetLayer ? formatLayerRailLabel(targetLayer) : '未选择层';
    return `${layerLabel} / ${rowLabel}`;
  }, [
    defaultTranscriptionLayerId,
    formatLayerRailLabel,
    layers,
    selectedLayerId,
    selectedRowMeta,
    selectedUtterance,
    translationLayers,
    voiceAgent.mode,
  ]);

  const voiceStatusSummary = useMemo(() => {
    switch (voiceAgent.agentState) {
      case 'listening':
        return voiceAgent.mode === 'dictation' ? '正在听写，请直接说出要写入的内容。' : '正在监听，请开始说话。';
      case 'routing':
        return '已识别语音，正在判断意图。';
      case 'executing':
        if (voiceAgent.mode === 'dictation') return '正在将识别结果写入文本框。';
        if (voiceAgent.mode === 'analysis') return '正在准备发送到 AI 分析。';
        return '正在执行语音操作。';
      case 'ai-thinking':
        return '正在等待 AI 处理结果。';
      case 'idle':
      default:
        return voiceAgent.listening ? '语音通道已开启，等待下一句输入。' : '就绪，点击麦克风开始语音交互。';
    }
  }, [voiceAgent.agentState, voiceAgent.listening, voiceAgent.mode]);

  const voiceEnvironmentSummary = useMemo(() => {
    const currentLanguage = voiceCorpusLangOverride === '__auto__'
      ? '自动检测'
      : formatLanguageLabel(voiceCorpusLangOverride ?? effectiveVoiceCorpusLang);
    const currentEngine = voiceAgent.engine === 'web-speech'
      ? 'Web Speech'
      : voiceAgent.engine === 'whisper-local'
        ? 'Ollama Whisper'
        : '商业模型';
    const detectedLanguage = voiceCorpusLangOverride === '__auto__' && voiceAgent.detectedLang
      ? ` · 已识别 ${formatLanguageLabel(voiceAgent.detectedLang)}`
      : '';
    return `${currentLanguage} · ${currentEngine}${detectedLanguage}`;
  }, [effectiveVoiceCorpusLang, voiceCorpusLangOverride, voiceAgent.detectedLang, voiceAgent.engine]);

  const voiceSelectionSummary = useMemo(() => {
    if (selectedRowMeta) {
      return `${formatTime(selectedRowMeta.start)} - ${formatTime(selectedRowMeta.end)}`;
    }
    if (selectedUtterance) {
      return `${formatTime(selectedUtterance.startTime)} - ${formatTime(selectedUtterance.endTime)}`;
    }
    return '未定位句段';
  }, [formatTime, selectedRowMeta, selectedUtterance]);

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
      voiceAgent.setExternalError(result.error ?? '本地 Whisper 不可用');
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
    void (async () => {
      if (voiceAgent.listening) {
        voiceAgent.toggle();
        return;
      }
      if (voiceAgent.engine === 'whisper-local') {
        const ready = await ensureWhisperLocalReady();
        if (!ready) return;
      }
      voiceAgent.toggle();
    })();
  }, [ensureWhisperLocalReady, voiceAgent]);

  const handleVoiceSwitchEngine = useCallback((engine: SttEngine) => {
    void (async () => {
      if (engine === 'whisper-local') {
        const ready = await ensureWhisperLocalReady();
        if (!ready) return;
      }
      voiceAgent.switchEngine(engine);
    })();
  }, [ensureWhisperLocalReady, voiceAgent]);

  const handleMicPointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    void event;
    if (voiceAgent.listening && voiceAgent.engine === 'whisper-local') {
      void (async () => {
        const ready = await ensureWhisperLocalReady();
        if (!ready) return;
        void voiceAgent.startRecording();
      })();
    }
  }, [ensureWhisperLocalReady, voiceAgent]);

  const handleMicPointerUp = useCallback(() => {
    if (voiceAgent.listening && voiceAgent.engine === 'whisper-local') {
      void voiceAgent.stopRecording();
    }
  }, [voiceAgent.engine, voiceAgent.listening, voiceAgent.stopRecording]);

  const handleAssistantVoicePanelToggle = useCallback(() => {
    setAssistantVoiceExpanded((value) => !value);
  }, []);

  useEffect(() => {
    if (voiceAgent.listening || voiceAgent.isRecording || Boolean(voiceAgent.pendingConfirm) || Boolean(voiceAgent.error)) {
      setAssistantVoiceExpanded(true);
    }
  }, [voiceAgent.error, voiceAgent.isRecording, voiceAgent.listening, voiceAgent.pendingConfirm]);

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
    handleAssistantVoicePanelToggle,
  };
}
