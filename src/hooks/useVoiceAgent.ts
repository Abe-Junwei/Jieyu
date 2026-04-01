/** useVoiceAgent — 语音智能体核心 hook */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceInputService as VoiceInputServiceType, SttEngine, SttResult, CommercialProviderKind } from '../services/VoiceInputService';
import type { WakeWordDetector as WakeWordDetectorType } from '../services/WakeWordDetector';
import { getActionLabel } from '../services/voiceIntentUi';
import type {
  ActionId,
  ActionIntent,
  VoiceIntent,
  VoiceSession,
  VoiceSessionEntry,
} from '../services/IntentRouter';
import { toBcp47 } from '../utils/langMapping';
import type { CommercialProviderCreateConfig } from '../services/stt';
import { createLogger } from '../observability/logger';
import { detectRegion } from '../utils/regionDetection';
import * as Earcon from '../services/EarconService';
import { unlockAudio } from '../services/EarconService';
import { useLatest } from './useLatest';
import { globalContext } from '../services/GlobalContextService';
import { userBehaviorStore } from '../services/UserBehaviorStore';
import type { DictationPipelineCallbacks, QuickDictationConfig } from '../services/SpeechAnnotationPipeline';
import { useVoiceAgentDictationPipeline } from './useVoiceAgentDictationPipeline';
import { useVoiceAgentProviderControls } from './useVoiceAgentProviderControls';
import { t, tf, useLocale } from '../i18n';

const log = createLogger('useVoiceAgent');

// ── Lazy runtime loaders | 运行时懒加载器 ─────────────────────────────────────

let voiceInputRuntimePromise: Promise<typeof import('../services/VoiceInputService')> | null = null;
let wakeWordRuntimePromise: Promise<typeof import('../services/WakeWordDetector')> | null = null;
let sttRuntimePromise: Promise<typeof import('../services/stt')> | null = null;
let sttStrategyRuntimePromise: Promise<typeof import('../services/SttStrategyRouter')> | null = null;
let intentRouterRuntime: typeof import('../services/IntentRouter') | null = null;
let intentRouterRuntimePromise: Promise<typeof import('../services/IntentRouter')> | null = null;
let voiceIntentRefineRuntime: typeof import('../services/voiceIntentRefine') | null = null;
let voiceIntentRefineRuntimePromise: Promise<typeof import('../services/voiceIntentRefine')> | null = null;
let voiceSessionStoreRuntime: typeof import('../services/VoiceSessionStore') | null = null;
let voiceSessionStoreRuntimePromise: Promise<typeof import('../services/VoiceSessionStore')> | null = null;

function loadVoiceInputRuntime() {
  if (!voiceInputRuntimePromise) {
    voiceInputRuntimePromise = import('../services/VoiceInputService');
  }
  return voiceInputRuntimePromise;
}

function loadWakeWordRuntime() {
  if (!wakeWordRuntimePromise) {
    wakeWordRuntimePromise = import('../services/WakeWordDetector');
  }
  return wakeWordRuntimePromise;
}

function loadSttRuntime() {
  if (!sttRuntimePromise) {
    sttRuntimePromise = import('../services/stt');
  }
  return sttRuntimePromise;
}

function loadSttStrategyRuntime() {
  if (!sttStrategyRuntimePromise) {
    sttStrategyRuntimePromise = import('../services/SttStrategyRouter');
  }
  return sttStrategyRuntimePromise;
}

function loadIntentRouterRuntime() {
  if (intentRouterRuntime) {
    return Promise.resolve(intentRouterRuntime);
  }
  if (!intentRouterRuntimePromise) {
    intentRouterRuntimePromise = import('../services/IntentRouter').then((runtime) => {
      intentRouterRuntime = runtime;
      return runtime;
    });
  }
  return intentRouterRuntimePromise;
}

function loadVoiceIntentRefineRuntime() {
  if (voiceIntentRefineRuntime) {
    return Promise.resolve(voiceIntentRefineRuntime);
  }
  if (!voiceIntentRefineRuntimePromise) {
    voiceIntentRefineRuntimePromise = import('../services/voiceIntentRefine').then((runtime) => {
      voiceIntentRefineRuntime = runtime;
      return runtime;
    });
  }
  return voiceIntentRefineRuntimePromise;
}

function loadVoiceSessionStoreRuntime() {
  if (voiceSessionStoreRuntime) {
    return Promise.resolve(voiceSessionStoreRuntime);
  }
  if (!voiceSessionStoreRuntimePromise) {
    voiceSessionStoreRuntimePromise = import('../services/VoiceSessionStore').then((runtime) => {
      voiceSessionStoreRuntime = runtime;
      return runtime;
    });
  }
  return voiceSessionStoreRuntimePromise;
}

function createVoiceSessionState(): VoiceSession {
  return {
    id: crypto.randomUUID(),
    startedAt: Date.now(),
    entries: [],
    mode: 'command',
  };
}

// ── Types ────────────────────────────────────────────────────────────────────

export type VoiceAgentMode = 'command' | 'dictation' | 'analysis';

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
  /** Continuous dictation pipeline callbacks for utterance-by-utterance fill */
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
  /** Initial wake-word detection state */
  initialWakeWordEnabled?: boolean;
}

export function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.85) return 'var(--voice-confidence-high, var(--state-success-solid))';
  if (confidence >= 0.6) return 'var(--voice-confidence-mid, var(--state-warning-solid))';
  return 'var(--voice-confidence-low, var(--state-danger-solid))';
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
    initialWakeWordEnabled = false,
  } = options;

  const [listening, setListening] = useState(false);
  const [speechActive, setSpeechActive] = useState(false);
  const [mode, setMode] = useState<VoiceAgentMode>('command');
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
  const langOverrideRef = useLatest(langOverride);
  const energyLevelRef = useRef(0);
  const recordingDurationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingAiResponseCountRef = useRef(0);
  const aliasMapRef = useRef<Record<string, ActionId>>({});
  const analysisTargetUtteranceIdRef = useRef<string | null>(null);
  const analysisFillCallbackRef = useRef<((text: string) => void) | null>(null);
  const svcUnsubscribesRef = useRef<Array<() => void>>([]);

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

  const handleSttResult = useCallback(async (result: SttResult) => {
    if (handlePipelineResult(result)) {
      return;
    }

    if (result.lang) {
      setDetectedLang(result.lang);
    }

    if (!result.isFinal) {
      if (result.text.trim().length > 0) {
        setError(null);
      }
      setInterimText(result.text);
      setConfidence(result.confidence);
      return;
    }

    setError(null);
    setInterimText('');
    setFinalText(result.text);
    setConfidence(result.confidence);
    setAgentState('routing');

    const currentMode = modeRef.current;
    const intentRouter = intentRouterRuntime ?? await loadIntentRouterRuntime();
    let intent = intentRouter.routeIntent(result.text, currentMode, {
      sttConfidence: result.confidence,
      detectedLang: result.lang,
      aliasMap: aliasMapRef.current,
    });

    let llmFallbackFailed = false;
    let llmResolvedAction = false;
    if (intent.type === 'chat' && currentMode === 'command' && resolveIntentWithLlmRef.current) {
      try {
        const fallbackIntent = await resolveIntentWithLlmRef.current({
          text: result.text,
          mode: currentMode,
          session: sessionRef.current,
        });
        if (fallbackIntent) {
          const { refineLlmFallbackIntent } = voiceIntentRefineRuntime ?? await loadVoiceIntentRefineRuntime();
          intent = refineLlmFallbackIntent(fallbackIntent, result);
          llmResolvedAction = intent.type === 'action';
        } else {
          llmFallbackFailed = true;
          setError(t(locale, 'transcription.voice.error.commandUnrecognized'));
        }
      } catch (err) {
        llmFallbackFailed = true;
        setError(err instanceof Error ? err.message : t(locale, 'transcription.voice.error.intentResolveFailed'));
      }
    }

    if (llmResolvedAction && intent.type === 'action') {
      const learned = intentRouter.learnVoiceIntentAlias(result.text, intent.actionId);
      if (learned.applied) {
        aliasMapRef.current = learned.aliasMap;
      }
    }
    if (!llmResolvedAction && intent.type === 'action' && intent.fromAlias) {
      intentRouter.bumpAliasUsage(result.text);
    }
    setLastIntent(intent);

    if (
      intent.type === 'action'
      && intent.fromFuzzy
      && intent.confidence < intentRouter.LOW_CONFIDENCE_THRESHOLD
    ) {
      const alternatives = intentRouter.collectAlternativeIntents(
        result.text,
        intent.actionId,
        result.confidence,
      );
      setDisambiguationOptions(alternatives);
    } else {
      setDisambiguationOptions([]);
    }

    const entry: VoiceSessionEntry = {
      timestamp: Date.now(),
      intent,
      sttText: result.text,
      confidence: result.confidence,
    };
    setSession((prev) => ({
      ...prev,
      entries: [...prev.entries, entry],
    }));

    setAgentState(llmFallbackFailed ? 'idle' : 'executing');

    switch (intent.type) {
      case 'action': {
        const needsConfirm =
          (intent.fromFuzzy && intentRouter.shouldConfirmFuzzyAction(intent.actionId))
          || (safeModeRef.current && intentRouter.isDestructiveAction(intent.actionId));
        if (needsConfirm) {
          setPendingConfirm({
            actionId: intent.actionId,
            label: getActionLabel(intent.actionId, locale),
            ...(intent.fromFuzzy !== undefined ? { fromFuzzy: intent.fromFuzzy } : {}),
          });
          Earcon.playTick();
          setAgentState('idle');
        } else {
          setError(null);
          executeActionRef.current(intent.actionId);
          Earcon.playSuccess();
          globalContext.markSessionStart();
          userBehaviorStore.recordAction({
            actionId: intent.actionId,
            durationMs: 0,
            sessionId: sessionRef.current.id,
          });
          setAgentState('idle');
        }
        break;
      }
      case 'tool': {
        if (!sendToAiChatRef.current) {
          setAgentState('idle');
          break;
        }
        setError(null);
        Earcon.playSuccess();
        queueAiThinking();
        sendToAiChatRef.current(tf(locale, 'transcription.voice.chatPrefix.command', { text: intent.raw }));
        break;
      }
      case 'dictation': {
        setError(null);
        insertDictationRef.current?.(intent.text);
        setAgentState('idle');
        break;
      }
      case 'slot-fill': {
        if (!sendToAiChatRef.current) {
          setAgentState('idle');
          break;
        }
        setError(null);
        queueAiThinking();
        sendToAiChatRef.current(tf(locale, 'transcription.voice.chatPrefix.slotFill', {
          slotName: intent.slotName,
          value: intent.value,
        }));
        break;
      }
      case 'chat': {
        if (llmFallbackFailed) break;
        if (!sendToAiChatRef.current) {
          setAgentState('idle');
          break;
        }
        setError(null);
        queueAiThinking();
        sendToAiChatRef.current(intent.text);
        break;
      }
    }
  }, [modeRef, safeModeRef, executeActionRef, sendToAiChatRef, insertDictationRef, resolveIntentWithLlmRef, sessionRef, queueAiThinking, handlePipelineResult]);

  const start = useCallback(async (targetMode?: VoiceAgentMode) => {
    if (listening) return;

    const nextMode = targetMode ?? modeRef.current;

    const effectiveLang = (() => {
      const override = langOverrideRef.current;
      if (override === '__auto__') return '';
      if (override) return toBcp47(override);
      return toBcp47(corpusLang);
    })();
    if (targetMode) setMode(targetMode);
    setError(null);
    clearInteractionPrompts();
    setSession(createVoiceSessionState());
    pendingAiResponseCountRef.current = 0;
    setAgentState('listening');

    try {
      const [intentRouter] = await Promise.all([
        loadIntentRouterRuntime(),
        loadVoiceIntentRefineRuntime(),
      ]);
      aliasMapRef.current = intentRouter.loadVoiceIntentAliasMap();
    } catch {
      aliasMapRef.current = {};
    }

    let svc = serviceRef.current;
    if (!svc) {
      const { VoiceInputService } = await loadVoiceInputRuntime();
      svc = new VoiceInputService();
      serviceRef.current = svc;
    }

    for (const unsub of svcUnsubscribesRef.current) unsub();
    svcUnsubscribesRef.current = [];

    svcUnsubscribesRef.current.push(svc.onResult(handleSttResult));
    svcUnsubscribesRef.current.push(svc.onError((err) => {
      setError(err);
      Earcon.playError();
    }));
    svcUnsubscribesRef.current.push(svc.onStateChange(setListening));
    if ('onVadStateChange' in svc && typeof svc.onVadStateChange === 'function') {
      svcUnsubscribesRef.current.push(svc.onVadStateChange(setSpeechActive));
    }
    if ('onEnergyLevel' in svc && typeof svc.onEnergyLevel === 'function') {
      svcUnsubscribesRef.current.push(svc.onEnergyLevel((rms) => {
        energyLevelRef.current = rms;
        setEnergyLevel(rms);
      }));
    }

    let batteryLevel: number | undefined;
    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      try {
        type BatteryManager = { level: number };
        const battery = await (navigator as unknown as { getBattery(): Promise<BatteryManager> }).getBattery();
        batteryLevel = battery.level;
      } catch (error) {
        log.warn('Battery API probing failed, fallback to default STT strategy context', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const region = await detectRegion();

    const { chooseSttEngine } = await loadSttStrategyRuntime();
    const runtimeEngine = chooseSttEngine({
      preferred: engineRef.current,
      online: typeof navigator !== 'undefined' ? navigator.onLine : true,
      noiseLevel: energyLevelRef.current,
      ...(batteryLevel !== undefined && { batteryLevel }),
      regionHint: region,
    });

    const startConfig: Parameters<typeof svc.start>[0] = {
      lang: effectiveLang,
      continuous: true,
      interimResults: true,
      preferredEngine: runtimeEngine,
      region,
      maxAlternatives: 3,
    };
    if (runtimeEngine === 'whisper-local') {
      startConfig.whisperServerUrl = whisperServerUrl;
      startConfig.whisperServerModel = whisperServerModel;
    }
    if (runtimeEngine === 'commercial' && commercialProviderConfigRef.current) {
      const { createCommercialProvider } = await loadSttRuntime();
      startConfig.commercialFallback = createCommercialProvider(
        commercialProviderKindRef.current,
        commercialProviderConfigRef.current,
      );
    }
    try {
      await svc.start(startConfig);
    } catch (err) {
      setListening(false);
      setSpeechActive(false);
      setAgentState('idle');
      setError(err instanceof Error ? err.message : t(locale, 'transcription.voice.error.startFailed'));
      Earcon.playError();
      return;
    }

    setAgentState(runtimeEngine === 'web-speech' ? 'listening' : 'idle');

    if (nextMode === 'dictation' && dictationPipeline) {
      startDictationPipeline();
    } else {
      stopDictationPipeline();
    }
    void unlockAudio();
    Earcon.playActivate();
  }, [clearInteractionPrompts, listening, langOverrideRef, handleSttResult, engineRef, whisperServerUrl, whisperServerModel, commercialProviderKindRef, commercialProviderConfigRef, modeRef, dictationPipeline, startDictationPipeline, stopDictationPipeline]);

  const stop = useCallback(async () => {
    stopDictationPipeline();
    serviceRef.current?.stop();
    setListening(false);
    setSpeechActive(false);
    setInterimText('');
    clearInteractionPrompts();
    pendingAiResponseCountRef.current = 0;
    setAgentState('idle');

    const currentSession = sessionRef.current;
    if (currentSession.entries.length > 0) {
      try {
        const { saveVoiceSession } = await loadVoiceSessionStoreRuntime();
        await saveVoiceSession(currentSession);
      } catch (err) {
        // IndexedDB unavailable — best effort save only | IndexedDB 不可用，保存会话仅尽力而为
        console.warn('[useVoiceAgent] saveVoiceSession failed:', err);
      }
    }

    Earcon.playDeactivate();
  }, [clearInteractionPrompts, stopDictationPipeline]);

  const startRecording = useCallback(async () => {
    const svc = serviceRef.current;
    if (!svc) return;
    setAgentState('listening');
    try {
      await svc.startRecording();
      setIsRecording(true);
      setRecordingDuration(0);
      if (recordingDurationIntervalRef.current !== null) {
        clearInterval(recordingDurationIntervalRef.current);
      }
      recordingDurationIntervalRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
    } catch (err) {
      setIsRecording(false);
      setAgentState('idle');
      Earcon.playError();
      setError(err instanceof Error ? err.message : t(locale, 'transcription.voice.error.recordingStartFailed'));
    }
  }, [locale]);

  const stopRecording = useCallback(async () => {
    const svc = serviceRef.current;
    if (!svc) return;
    setIsRecording(false);
    if (recordingDurationIntervalRef.current !== null) {
      clearInterval(recordingDurationIntervalRef.current);
      recordingDurationIntervalRef.current = null;
    }
    setAgentState('idle');
    await svc.stopRecording();
  }, []);

  const switchEngine = useCallback((newEngine: SttEngine) => {
    setEngine(newEngine);
    globalContext.updatePreference('preferredEngine', newEngine);
    if (listening) {
      serviceRef.current?.switchEngine(newEngine);
      setAgentState(newEngine === 'web-speech' ? 'listening' : 'idle');
    }
  }, [listening]);

  const toggle = useCallback((targetMode?: VoiceAgentMode) => {
    if (listening) {
      stop();
    } else {
      start(targetMode);
    }
  }, [listening, start, stop]);

  const confirmPending = useCallback(() => {
    if (!pendingConfirm) return;
    executeActionRef.current(pendingConfirm.actionId);
    clearInteractionPrompts();
    Earcon.playSuccess();
    globalContext.markSessionStart();
    userBehaviorStore.recordAction({
      actionId: pendingConfirm.actionId,
      durationMs: 0,
      sessionId: sessionRef.current.id,
    });
  }, [clearInteractionPrompts, pendingConfirm, executeActionRef, sessionRef]);

  const cancelPending = useCallback(() => {
    clearInteractionPrompts();
    Earcon.playTick();
  }, [clearInteractionPrompts]);

  const selectDisambiguation = useCallback((actionId: ActionId) => {
    void (async () => {
      setDisambiguationOptions([]);
      const intentRouter = intentRouterRuntime ?? await loadIntentRouterRuntime();
      const needsConfirm = intentRouter.shouldConfirmFuzzyAction(actionId)
        || (safeModeRef.current && intentRouter.isDestructiveAction(actionId));
      if (needsConfirm) {
        setPendingConfirm({ actionId, label: getActionLabel(actionId, locale), fromFuzzy: true });
        Earcon.playTick();
        setAgentState('idle');
        return;
      }

      setPendingConfirm(null);
      executeActionRef.current(actionId);
      Earcon.playSuccess();
      globalContext.markSessionStart();
      userBehaviorStore.recordAction({
        actionId,
        durationMs: 0,
        sessionId: sessionRef.current.id,
      });
      setAgentState('idle');
    })();
  }, [executeActionRef, locale, safeModeRef, sessionRef]);

  const dismissDisambiguation = useCallback(() => {
    setDisambiguationOptions([]);
    setPendingConfirm(null);
  }, []);

  const switchMode = useCallback((newMode: VoiceAgentMode) => {
    if (newMode === 'dictation') {
      if (listening && dictationPipeline) {
        startDictationPipeline();
      }
    } else {
      stopDictationPipeline();
    }
    setMode(newMode);
    clearInteractionPrompts();
    setInterimText('');
  }, [clearInteractionPrompts, dictationPipeline, listening, startDictationPipeline, stopDictationPipeline]);

  useEffect(() => {
    const override = langOverride;
    const effective = override === '__auto__' ? '' : (override ? toBcp47(override) : toBcp47(corpusLang));
    serviceRef.current?.setLang(effective);
  }, [langOverride, corpusLang, listening]);

  useEffect(() => {
    if (!wakeWordEnabled) {
      wakeWordDetectorRef.current?.stop();
      wakeWordDetectorRef.current = null;
      return;
    }
    if (listening) return;

    let disposed = false;
    void (async () => {
      const { WakeWordDetector } = await loadWakeWordRuntime();
      if (disposed) return;
      const detector = new WakeWordDetector({
        energyThreshold: 0.05,
        speechMs: 400,
        cooldownMs: 3000,
        onWake: () => {
          start('command');
        },
        onEnergy: (rms) => {
          setWakeWordEnergyLevel(rms);
        },
      });

      wakeWordDetectorRef.current = detector;
      detector.start().catch(() => {
        setWakeWordEnabledState(false);
      });
    })();

    return () => {
      disposed = true;
      wakeWordDetectorRef.current?.stop();
      wakeWordDetectorRef.current = null;
    };
  }, [wakeWordEnabled, listening, start]);

  useEffect(() => {
    return () => {
      for (const unsub of svcUnsubscribesRef.current) unsub();
      svcUnsubscribesRef.current = [];
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

  const notifyAiStreamStarted = useCallback(() => {
    consumeAiThinking();
  }, [consumeAiThinking]);

  const notifyAiStreamFinished = useCallback((finalContent?: string) => {
    clearAiThinking();
    const cb = analysisFillCallbackRef.current;
    if (cb && finalContent !== undefined) {
      cb(finalContent);
      analysisFillCallbackRef.current = null;
      analysisTargetUtteranceIdRef.current = null;
    }
  }, [clearAiThinking]);

  const testWhisperLocal = useCallback(async (): Promise<{ available: boolean; error?: string }> => {
    const { testWhisperServerAvailability } = await loadVoiceInputRuntime();
    return testWhisperServerAvailability(
      'http://localhost:3040',
      'ggml-small-q5_k.bin',
    );
  }, []);

  const setAnalysisFillCallback = useCallback((
    utteranceId: string | null,
    callback: ((content: string) => void) | null,
  ) => {
    analysisTargetUtteranceIdRef.current = utteranceId;
    analysisFillCallbackRef.current = callback;
  }, []);

  const {
    providerStatusMap,
    refreshProviderStatus,
    selectPreset,
    testCommercialProvider,
  } = useVoiceAgentProviderControls({
    loadSttRuntime,
    commercialProviderKindState,
    commercialProviderKindRef,
    commercialProviderConfigRef,
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
    refreshProviderStatus,
    selectPreset,
    setAnalysisFillCallback,
  };
}
