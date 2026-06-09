/**
 * useVoiceInteraction | 语音交互编排 Hook
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from 'react';
import { useVoiceAgent } from './useVoiceAgent';
import type { CommercialProviderKind, SttEngine } from '../../services/VoiceInputService';
import type { SttEnhancementConfig, SttEnhancementSelectionKind } from '../../services/stt';
import type { LayerDocType, LayerLinkDocType } from '../../db';
import type {
  DictationPipelineCallbacks,
  QuickDictationConfig,
} from '../../services/SpeechAnnotationPipeline';
import {
  createTranscriptionVoiceSendToAiChat,
  type TranscriptionVoiceSelectionSnapshot,
} from '../../services/transcriptionVoiceInteractionWiring';
import { useLocale } from '../../i18n';
import { getVoiceInteractionMessages } from '../../i18n/messages';
import { useVoiceInteractionAssistantRuntime } from './useVoiceInteractionAssistantRuntime';
import { useVoiceInteractionCommercialSync } from './useVoiceInteractionCommercialSync';
import { useVoiceInteractionSummaries } from './useVoiceInteractionSummaries';

interface VoiceMessageLike {
  role?: string;
  status?: string;
  content?: string;
}

interface VoiceSelectionLike extends TranscriptionVoiceSelectionSnapshot {}

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
  handleResolveVoiceIntentWithLlm: NonNullable<
    Parameters<typeof useVoiceAgent>[0]['resolveIntentWithLlm']
  >;
  executeVoiceToolCall?: Parameters<typeof useVoiceAgent>[0]['executeVoiceToolCall'];
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
  layerLinks?: LayerLinkDocType[];
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
  voiceAiAssistantMessageBridgeRef?: MutableRefObject<
    ((assistantMessageId: string, content: string) => void) | null
  >;
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
  assistantTtsEnabled: boolean;
  assistantTtsSupported: boolean;
  onSetAssistantTtsEnabled: (on: boolean) => void;
}

export function useVoiceInteraction({
  effectiveVoiceCorpusLang,
  voiceCorpusLangOverride,
  executeAction,
  handleResolveVoiceIntentWithLlm,
  executeVoiceToolCall,
  handleVoiceDictation,
  dictationPipeline,
  onVoiceAnalysisResult,
  selection,
  defaultTranscriptionLayerId,
  translationLayers,
  layers,
  layerLinks,
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
  voiceAiAssistantMessageBridgeRef,
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

  const runVoiceTask = useCallback(
    (task: () => Promise<void>, fallbackMessage: string, onError?: (message: string) => void) => {
      void task().catch((error) => {
        const message = normalizeVoiceTaskError(error, fallbackMessage);
        voiceAgentRef.current?.setExternalError?.(message);
        onError?.(message);
      });
    },
    [normalizeVoiceTaskError],
  );

  const sendToAiChat = useMemo(
    () =>
      createTranscriptionVoiceSendToAiChat({
        getActiveUnitId: () => selection.activeUnitId,
        onVoiceAnalysisResult,
        aiChatSend,
        messages,
        runVoiceTask,
        getVoiceAgentApi: () => voiceAgentRef.current,
        setAnalysisWritebackFeedback,
      }),
    [aiChatSend, messages, onVoiceAnalysisResult, runVoiceTask, selection.activeUnitId],
  );

  const voiceAgentOptions: Parameters<typeof useVoiceAgent>[0] = {
    corpusLang: effectiveVoiceCorpusLang,
    langOverride: voiceCorpusLangOverride,
    executeAction,
    sendToAiChat,
    resolveIntentWithLlm: handleResolveVoiceIntentWithLlm,
    insertDictation: handleVoiceDictation,
    ...(executeVoiceToolCall !== undefined ? { executeVoiceToolCall } : {}),
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

  const summaries = useVoiceInteractionSummaries({
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
  });

  const assistantRuntime = useVoiceInteractionAssistantRuntime({
    featureVoiceEnabled,
    aiIsStreaming,
    aiMessages,
    voiceAgent,
    voiceAgentRef,
    voiceAiAssistantMessageBridgeRef,
  });

  const { handleVoiceCommercialConfigChange } = useVoiceInteractionCommercialSync({
    voiceAgent,
    onCommercialConfigChange,
    setCommercialProviderKind,
    setCommercialProviderConfig,
  });

  useEffect(() => {
    toggleVoiceRef.current = featureVoiceEnabled ? voiceAgent.toggle : undefined;
  }, [featureVoiceEnabled, toggleVoiceRef, voiceAgent.toggle]);

  const ensureWhisperLocalReady = useCallback(async (): Promise<boolean> => {
    const result = await voiceAgent.testWhisperLocal();
    if (!result.available) {
      voiceAgent.setExternalError(result.error ?? 'Local Whisper unavailable');
      return false;
    }
    voiceAgent.setExternalError(null);
    return true;
  }, [voiceAgent]);

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

  const handleVoiceSwitchEngine = useCallback(
    (engine: SttEngine) => {
      runVoiceTask(async () => {
        if (engine === 'whisper-local') {
          const ready = await ensureWhisperLocalReady();
          if (!ready) return;
        }
        voiceAgent.switchEngine(engine);
      }, 'Failed to switch voice engine.');
    },
    [ensureWhisperLocalReady, runVoiceTask, voiceAgent],
  );

  const handleMicPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      void event;
      if (voiceAgent.listening && voiceAgent.engine === 'whisper-local') {
        runVoiceTask(async () => {
          const ready = await ensureWhisperLocalReady();
          if (!ready) return;
          await voiceAgent.startRecording();
        }, 'Failed to start recording.');
      }
    },
    [ensureWhisperLocalReady, runVoiceTask, voiceAgent],
  );

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
      voiceAgent.listening ||
      voiceAgent.isRecording ||
      Boolean(voiceAgent.pendingConfirm) ||
      disambiguationOptionCount > 0 ||
      Boolean(voiceAgent.error)
    ) {
      setAssistantVoiceExpanded(true);
    }
  }, [disambiguationOptionCount, voiceAgent]);

  return {
    voiceAgent,
    assistantVoiceExpanded,
    voiceTargetSummary: summaries.voiceTargetSummary,
    voiceStatusSummary: summaries.voiceStatusSummary,
    voiceEnvironmentSummary: summaries.voiceEnvironmentSummary,
    voiceSelectionSummary: summaries.voiceSelectionSummary,
    handleVoiceCommercialConfigChange,
    handleVoiceAssistantIconClick,
    handleVoiceSwitchEngine,
    handleMicPointerDown,
    handleMicPointerUp,
    handleAssistantVoicePanelOpen,
    handleAssistantVoicePanelToggle,
    assistantTtsEnabled: assistantRuntime.assistantTtsEnabled,
    assistantTtsSupported: assistantRuntime.assistantTtsSupported,
    onSetAssistantTtsEnabled: assistantRuntime.onSetAssistantTtsEnabled,
  };
}
