/** useVoiceAgent — 语音智能体核心 hook */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceInputService as VoiceInputServiceType, SttEngine, CommercialProviderKind } from '../services/VoiceInputService';
import type { WakeWordDetector as WakeWordDetectorType } from '../services/WakeWordDetector';
import type { ActionId, ActionIntent, VoiceIntent, VoiceSession } from '../services/IntentRouter';
import { toBcp47 } from '../utils/langMapping';
import type { CommercialProviderCreateConfig, SttEnhancementConfig, SttEnhancementReachability, SttEnhancementSelectionKind } from '../services/stt';
import { useLatest } from './useLatest';
import type { DictationPipelineCallbacks, QuickDictationConfig } from '../services/SpeechAnnotationPipeline';
import { useVoiceAgentDictationPipeline } from './useVoiceAgentDictationPipeline';
import { useVoiceAgentProviderControls } from './useVoiceAgentProviderControls';
import { useVoiceAgentResultHandler } from './useVoiceAgentResultHandler';
import { useVoiceAgentStartController } from './useVoiceAgentStartController';
import { useVoiceAgentTransportControls } from './useVoiceAgentTransportControls';
import { useVoiceAgentWakeWord } from './useVoiceAgentWakeWord';
import { createVoiceSessionState, loadIntentRouterRuntime, loadSttRuntime, loadSttStrategyRuntime, loadVoiceInputRuntime, loadVoiceIntentRefineRuntime, loadVoiceSessionStoreRuntime, loadWakeWordRuntime } from './useVoiceAgent.runtime';
import { cleanupVoiceInputSubscriptions } from './useVoiceAgent.serviceBindings';
import { useVoiceAgentModeController } from './useVoiceAgentModeController';
import { useLocale } from '../i18n';
import { DEFAULT_VOICE_MODE, type VoiceMode } from '../services/voiceMode';

// ── Types ────────────────────────────────────────────────────────────────────

export type VoiceAgentMode = VoiceMode;
export { DEFAULT_VOICE_MODE };

export interface VoicePendingConfirm {
  actionId: ActionId;
  label: string;
  fromFuzzy?: boolean;
}

export interface VoiceAgentState {
  listening: boolean;
  speechActive: boolean;
  mode: VoiceAgentMode;
  interimText: string;
  finalText: string;
  confidence: number;
  lastIntent: VoiceIntent | null;
  error: string | null;
  safeMode: boolean;
  pendingConfirm: VoicePendingConfirm | null;
  session: VoiceSession;
  engine: SttEngine;
  isRecording: boolean;
  commercialProviderKind: CommercialProviderKind;
  commercialProviderConfig: CommercialProviderCreateConfig;
  energyLevel: number;
  recordingDuration: number;
  wakeWordEnabled: boolean;
  wakeWordEnergyLevel: number;
  detectedLang: string | null;
  // Multi-agent pipeline state (Stage 1 new)
  agentState: 'idle' | 'listening' | 'routing' | 'executing' | 'ai-thinking';
  /** 消歧备选列表 | Disambiguation alternatives for low-confidence fuzzy matches */
  disambiguationOptions: ActionIntent[];
}

export interface UseVoiceAgentOptions {
  /** ISO 639-3 corpus language code, e.g. 'cmn', 'jpn' */
  corpusLang?: string;
  /** Language override from the UI selector. '__auto__' = auto-detect, null = use corpusLang. */
  langOverride?: string | null;
  /** Execute a UI action by ActionId */
  executeAction: (actionId: ActionId) => void;
  /** Send text to AI chat (for analysis/chat intents). The AI response is captured via setAnalysisFillCallback. */
  sendToAiChat?: (text: string) => void;
  /** Insert dictated text into the active field */
  insertDictation?: (text: string) => void;
  /** Continuous dictation pipeline callbacks for unit-by-unit fill */
  dictationPipeline?: {
    callbacks: DictationPipelineCallbacks;
    config?: QuickDictationConfig;
  };
  /** Initial safe mode state */
  initialSafeMode?: boolean;
  /** Optional LLM intent resolver for unmatched command-mode transcripts */
  resolveIntentWithLlm?: (input: {
    text: string;
    mode: VoiceAgentMode;
    session: VoiceSession;
  }) => Promise<VoiceIntent | null>;
  /** Whisper-server URL (used when engine === 'whisper-local') */
  whisperServerUrl?: string;
  /** Whisper-server model name (used when engine === 'whisper-local') */
  whisperServerModel?: string;
  /** Commercial STT provider kind (used when engine === 'commercial') */
  commercialProviderKind?: CommercialProviderKind;
  /** Commercial STT provider config (used when engine === 'commercial') */
  commercialProviderConfig?: CommercialProviderCreateConfig;
  /** Optional post-STT enhancement provider selection. */
  sttEnhancementKind?: SttEnhancementSelectionKind;
  /** Enhancement provider config for external alignment/diarization services. */
  sttEnhancementConfig?: SttEnhancementConfig;
  /** Initial wake-word detection state */
  initialWakeWordEnabled?: boolean;
}
export function useVoiceAgent(options: UseVoiceAgentOptions) {
  const locale = useLocale();
  const {
    corpusLang = 'cmn',
    langOverride,
    executeAction,
    sendToAiChat,
    insertDictation,
    dictationPipeline,
    initialSafeMode = false,
    resolveIntentWithLlm,
    whisperServerUrl = 'http://localhost:3040',
    whisperServerModel = 'ggml-small-q5_k.bin',
    commercialProviderKind = 'groq',
    commercialProviderConfig,
    sttEnhancementKind = 'none',
    sttEnhancementConfig,
    initialWakeWordEnabled = false,
  } = options;

  const [listening, setListening] = useState(false);
  const [speechActive, setSpeechActive] = useState(false);
  const [mode, setMode] = useState<VoiceAgentMode>(DEFAULT_VOICE_MODE);
  const [interimText, setInterimText] = useState('');
  const [finalText, setFinalText] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [lastIntent, setLastIntent] = useState<VoiceIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [safeMode, setSafeMode] = useState(initialSafeMode);
  const [energyLevel, setEnergyLevel] = useState(0);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [pendingConfirm, setPendingConfirm] = useState<VoicePendingConfirm | null>(null);
  const [session, setSession] = useState<VoiceSession>(createVoiceSessionState);
  const [engine, setEngine] = useState<SttEngine>('web-speech');
  const [isRecording, setIsRecording] = useState(false);
  const [commercialProviderKindState, setCommercialProviderKindState] = useState<CommercialProviderKind>(commercialProviderKind);
  const [commercialProviderConfigState, setCommercialProviderConfigState] = useState<CommercialProviderCreateConfig | undefined>(commercialProviderConfig);
  const [wakeWordEnabled, setWakeWordEnabledState] = useState(initialWakeWordEnabled);

  useEffect(() => {
    setCommercialProviderKindState(commercialProviderKind);
  }, [commercialProviderKind]);

  useEffect(() => {
    setCommercialProviderConfigState(commercialProviderConfig);
  }, [commercialProviderConfig]);
  const [wakeWordEnergyLevel, setWakeWordEnergyLevel] = useState(0);
  const [detectedLang, setDetectedLang] = useState<string | null>(null);
  /** Multi-agent pipeline state (Stage 1 new) */
  const [agentState, setAgentState] = useState<VoiceAgentState['agentState']>('idle');
  /** 消歧备选列表 | Low-confidence fuzzy alternatives for disambiguation */
  const [disambiguationOptions, setDisambiguationOptions] = useState<ActionIntent[]>([]);

  const serviceRef = useRef<VoiceInputServiceType | null>(null);
  const wakeWordDetectorRef = useRef<WakeWordDetectorType | null>(null);
  const executeActionRef = useLatest(executeAction);
  const sendToAiChatRef = useLatest(sendToAiChat);
  const insertDictationRef = useLatest(insertDictation);
  const resolveIntentWithLlmRef = useLatest(resolveIntentWithLlm);
  const modeRef = useLatest(mode);
  const safeModeRef = useLatest(safeMode);
  const sessionRef = useLatest(session);
  const engineRef = useLatest(engine);
  const commercialProviderKindRef = useLatest(commercialProviderKindState);
  const commercialProviderConfigRef = useLatest(commercialProviderConfigState);
  const sttEnhancementKindRef = useLatest(sttEnhancementKind);
  const sttEnhancementConfigRef = useLatest(sttEnhancementConfig);
  const langOverrideRef = useLatest(langOverride);
  const energyLevelRef = useRef(0);
  const recordingDurationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingAiResponseCountRef = useRef(0);
  const aliasMapRef = useRef<Record<string, ActionId>>({});
  const analysisTargetUnitIdRef = useRef<string | null>(null);
  const analysisFillCallbackRef = useRef<((text: string) => void) | null>(null);
  const svcUnsubscribesRef = useRef<Array<() => void>>([]);
  /** Invalidates in-flight `start()` after `stop()` / unmount (CRITICAL-3). */
  const voiceActivateGenerationRef = useRef(0);
  const exclusiveStartPromiseRef = useRef<Promise<void> | null>(null);

  const queueAiThinking = useCallback(() => {
    pendingAiResponseCountRef.current += 1;
    setAgentState('ai-thinking');
  }, []);

  const consumeAiThinking = useCallback(() => {
    if (pendingAiResponseCountRef.current > 0) {
      pendingAiResponseCountRef.current -= 1;
    }
    setAgentState('idle');
  }, []);

  const clearAiThinking = useCallback(() => {
    pendingAiResponseCountRef.current = 0;
    setAgentState('idle');
  }, []);

  const clearInteractionPrompts = useCallback(() => {
    setPendingConfirm(null);
    setDisambiguationOptions([]);
  }, []);

  const {
    handlePipelineResult,
    startDictationPipeline,
    stopDictationPipeline,
  } = useVoiceAgentDictationPipeline({
    ...(dictationPipeline !== undefined ? { dictationPipeline } : {}),
    setDetectedLang,
    setError,
    setInterimText,
    setFinalText,
    setConfidence,
    setAgentState: () => setAgentState('idle'),
  });

  useEffect(() => {
    void loadVoiceSessionStoreRuntime().then(({ loadRecentVoiceSessions }) => loadRecentVoiceSessions(1))
      .then(([recent]) => {
        if (recent && recent.entries.length > 0) {
          setSession(recent);
        }
      })
      .catch(() => {
        // IndexedDB unavailable — silently skip
      });
  }, []);

  const handleSttResult = useVoiceAgentResultHandler({
    locale,
    handlePipelineResult,
    modeRef,
    safeModeRef,
    sessionRef,
    executeActionRef,
    sendToAiChatRef,
    insertDictationRef,
    resolveIntentWithLlmRef,
    aliasMapRef,
    queueAiThinking,
    setDetectedLang,
    setError,
    setInterimText,
    setFinalText,
    setConfidence,
    setAgentState,
    setLastIntent,
    setDisambiguationOptions,
    setSession,
    setPendingConfirm,
  });

  const start = useVoiceAgentStartController({
    locale,
    listening,
    corpusLang,
    whisperServerUrl,
    whisperServerModel,
    dictationPipeline,
    modeRef,
    engineRef,
    langOverrideRef,
    commercialProviderKindRef,
    commercialProviderConfigRef,
    sttEnhancementKindRef,
    sttEnhancementConfigRef,
    aliasMapRef,
    energyLevelRef,
    pendingAiResponseCountRef,
    serviceRef,
    svcUnsubscribesRef,
    handleSttResult,
    clearInteractionPrompts,
    startDictationPipeline,
    stopDictationPipeline,
    loadIntentRouterRuntime,
    loadVoiceIntentRefineRuntime,
    loadVoiceInputRuntime,
    loadSttRuntime,
    loadSttStrategyRuntime,
    setMode,
    setError,
    setSession,
    setAgentState,
    setListening,
    setSpeechActive,
    setEnergyLevel,
    voiceActivateGenerationRef,
    exclusiveStartPromiseRef,
  });

  const {
    stop,
    startRecording,
    stopRecording,
    switchEngine,
    toggle,
    confirmPendingAction,
  } = useVoiceAgentTransportControls({
    locale,
    listening,
    voiceActivateGenerationRef,
    exclusiveStartPromiseRef,
    start,
    stopDictationPipeline,
    clearInteractionPrompts,
    loadVoiceSessionStoreRuntime,
    serviceRef,
    sessionRef,
    executeActionRef,
    pendingAiResponseCountRef,
    recordingDurationIntervalRef,
    setListening,
    setSpeechActive,
    setInterimText,
    setAgentState,
    setIsRecording,
    setRecordingDuration,
    setError,
    setEngine,
  });

  const confirmPending = useCallback(() => {
    confirmPendingAction(pendingConfirm);
  }, [confirmPendingAction, pendingConfirm]);

  const {
    cancelPending,
    selectDisambiguation,
    dismissDisambiguation,
    switchMode,
  } = useVoiceAgentModeController({
    locale,
    listening,
    dictationPipeline,
    safeModeRef,
    sessionRef,
    executeActionRef,
    loadIntentRouterRuntime,
    clearInteractionPrompts,
    startDictationPipeline,
    stopDictationPipeline,
    setMode,
    setInterimText,
    setAgentState,
    setDisambiguationOptions,
    setPendingConfirm,
  });

  useEffect(() => {
    const override = langOverride;
    const effective = override === '__auto__' ? '' : (override ? toBcp47(override) : toBcp47(corpusLang));
    serviceRef.current?.setLang(effective);
  }, [langOverride, corpusLang, listening]);

  useVoiceAgentWakeWord({
    wakeWordEnabled,
    listening,
    wakeWordDetectorRef,
    loadWakeWordRuntime,
    setWakeWordEnabledState,
    setWakeWordEnergyLevel,
    onWake: () => {
      void start(DEFAULT_VOICE_MODE);
    },
  });

  useEffect(() => {
    return () => {
      voiceActivateGenerationRef.current += 1;
      exclusiveStartPromiseRef.current = null;
      if (recordingDurationIntervalRef.current !== null) {
        clearInterval(recordingDurationIntervalRef.current);
        recordingDurationIntervalRef.current = null;
      }
      cleanupVoiceInputSubscriptions(svcUnsubscribesRef);
      stopDictationPipeline();
      serviceRef.current?.dispose();
      serviceRef.current = null;
      wakeWordDetectorRef.current?.stop();
      wakeWordDetectorRef.current = null;
    };
  }, [stopDictationPipeline]);

  const state: VoiceAgentState = {
    listening,
    speechActive,
    mode,
    interimText,
    finalText,
    confidence,
    lastIntent,
    error,
    safeMode,
    pendingConfirm,
    session,
    engine,
    isRecording,
    commercialProviderKind: commercialProviderKindState,
    commercialProviderConfig: commercialProviderConfigState ?? {},
    energyLevel,
    recordingDuration,
    wakeWordEnabled,
    wakeWordEnergyLevel,
    detectedLang,
    agentState,
    disambiguationOptions,
  };

  const setWakeWordEnabled = useCallback((on: boolean) => {
    setWakeWordEnabledState(on);
  }, []);

  const setCommercialProviderKind = useCallback((kind: CommercialProviderKind) => {
    setCommercialProviderKindState(kind);
  }, []);

  const setCommercialProviderConfig = useCallback((config: CommercialProviderCreateConfig) => {
    setCommercialProviderConfigState(config);
  }, []);

  const setExternalError = useCallback((message: string | null) => {
    setError(message);
  }, []);

  // 流式开始：结束「排队思考」态（queueAiThinking 在发消息前把 agentState 置为 ai-thinking）；首 token 到来前 UI 不长期卡在 thinking。
  // On stream start: consume one queued "thinking" slot so the UI does not stay stuck in ai-thinking before tokens arrive.
  const notifyAiStreamStarted = useCallback(() => {
    consumeAiThinking();
  }, [consumeAiThinking]);

  const notifyAiStreamFinished = useCallback((finalContent?: string) => {
    clearAiThinking();
    const cb = analysisFillCallbackRef.current;
    if (cb) {
      if (finalContent !== undefined && finalContent.trim().length > 0) {
        cb(finalContent);
      }
      analysisFillCallbackRef.current = null;
      analysisTargetUnitIdRef.current = null;
    }
  }, [clearAiThinking]);

  const testWhisperLocal = useCallback(async (): Promise<{ available: boolean; error?: string }> => {
    const { testSttProvider } = await loadSttRuntime();
    return testSttProvider('whisper-local', {
      baseUrl: whisperServerUrl,
      model: whisperServerModel,
    });
  }, [loadSttRuntime, whisperServerModel, whisperServerUrl]);

  const setAnalysisFillCallback = useCallback((
    unitId: string | null,
    callback: ((content: string) => void) | null,
  ) => {
    analysisTargetUnitIdRef.current = unitId;
    analysisFillCallbackRef.current = callback;
  }, []);

  const {
    providerStatusMap,
    enhancementStatus,
    refreshProviderStatus,
    selectPreset,
    testCommercialProvider,
  } = useVoiceAgentProviderControls({
    loadSttRuntime,
    commercialProviderKindState,
    engineState: engine,
    commercialProviderKindRef,
    commercialProviderConfigRef,
    sttEnhancementKindState: sttEnhancementKind,
    sttEnhancementConfigState: sttEnhancementConfig,
    whisperServerUrl,
    whisperServerModel,
    switchEngine,
    setCommercialProviderKind,
    ...(commercialProviderConfigState !== undefined ? { commercialProviderConfigState } : {}),
  });

  return {
    ...state,
    setCommercialProviderKind,
    setCommercialProviderConfig,
    setExternalError,
    notifyAiStreamStarted,
    notifyAiStreamFinished,
    testWhisperLocal,
    testCommercialProvider,
    start,
    stop,
    toggle,
    switchMode,
    setSafeMode,
    setWakeWordEnabled,
    confirmPending,
    cancelPending,
    selectDisambiguation,
    dismissDisambiguation,
    switchEngine,
    startRecording,
    stopRecording,
    providerStatusMap,
    enhancementStatus: enhancementStatus as SttEnhancementReachability | null,
    refreshProviderStatus,
    selectPreset,
    setAnalysisFillCallback,
  };
}
