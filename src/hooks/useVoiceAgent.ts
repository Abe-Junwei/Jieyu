/**
 * useVoiceAgent — 语音智能体核心 hook
 *
 * 三模式状态机 (command / dictation / analysis)，
 * 集成 VoiceInputService + IntentRouter + EarconService + 按键执行。
 *
 * 内部封装 VoiceAgentService，保留完整的 React 生命周期管理。
 * 外部可通过 `serviceInstance` 选项注入共享的 VoiceAgentService 实例，
 * 实现跨页面状态同步（Stage 1 目标）。
 *
 * @see 解语-语音智能体架构设计方案 §4.5
 * @see 解语-语音智能体架构设计方案 v2.5 §阶段1
 */

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
import type { CommercialProviderCreateConfig, ProviderReachability } from '../services/stt';
import type { VoicePreset } from '../utils/voicePresets';
import { createLogger } from '../observability/logger';

const log = createLogger('useVoiceAgent');
import { detectRegion } from '../utils/regionDetection';
import * as Earcon from '../services/EarconService';
import { unlockAudio } from '../services/EarconService';
import { useLatest } from './useLatest';
import { globalContext } from '../services/GlobalContextService';
import { userBehaviorStore } from '../services/UserBehaviorStore';

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

// ── Confidence color thresholds ──────────────────────────────────────────────

export function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.85) return 'var(--voice-confidence-high, #22c55e)';
  if (confidence >= 0.6) return 'var(--voice-confidence-mid, #eab308)';
  return 'var(--voice-confidence-low, #ef4444)';
}
// ── Hook ────────────────────────────────────────────────────────────────────

export function useVoiceAgent(options: UseVoiceAgentOptions) {
  const {
    corpusLang = 'cmn',
    langOverride,
    executeAction,
    sendToAiChat,
    insertDictation,
    initialSafeMode = false,
    resolveIntentWithLlm,
    whisperServerUrl = 'http://localhost:3040',
    whisperServerModel = 'ggml-small-q5_k.bin',
    commercialProviderKind = 'groq',
    commercialProviderConfig,
    initialWakeWordEnabled = false,
  } = options;

  // State
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

  // Stable refs
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
  // whisperServerUrl and whisperServerModel are used for the 'whisper-local' engine (whisper-server on port 3040)
  const energyLevelRef = useRef(0);
  const recordingDurationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingAiResponseCountRef = useRef(0);
  const aliasMapRef = useRef<Record<string, ActionId>>({});
  /** Tracks the target utterance ID for the active analysis session (set before sendToAiChat in analysis mode). */
  const analysisTargetUtteranceIdRef = useRef<string | null>(null);
  /** Internal simplified callback: called with the AI response text when the stream completes in analysis mode. */
  const analysisFillCallbackRef = useRef<((text: string) => void) | null>(null);
  // 存储监听器取消函数，防止 start/stop 多次后叠加 | Store listener unsubscribes to prevent accumulation on toggle
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

  // Load most recent session from IndexedDB on mount
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

  // ── Handle result from VoiceInputService ─────────────────────────────────
  const handleSttResult = useCallback(async (result: SttResult) => {
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
          setError('无法识别该指令，请重试或切换到"分析"模式直接发送文本');
        }
      } catch (err) {
        llmFallbackFailed = true;
        setError(err instanceof Error ? err.message : 'LLM intent解析失败，请检查 API 配置');
      }
    }

    if (llmResolvedAction && intent.type === 'action') {
      const learned = intentRouter.learnVoiceIntentAlias(result.text, intent.actionId);
      if (learned.applied) {
        aliasMapRef.current = learned.aliasMap;
      }
    }
    // Bump usage stats for alias-matched intents | 命中别名时更新使用统计
    if (!llmResolvedAction && intent.type === 'action' && intent.fromAlias) {
      intentRouter.bumpAliasUsage(result.text);
    }
    setLastIntent(intent);

    // 低信心度模糊匹配时采集消歧备选 | Collect disambiguation alternatives on low-confidence fuzzy matches
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

    // Record to session
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

    // Dispatch by intent type
    setAgentState(llmFallbackFailed ? 'idle' : 'executing');

    switch (intent.type) {
      case 'action': {
        const needsConfirm =
          (intent.fromFuzzy && intentRouter.shouldConfirmFuzzyAction(intent.actionId))
          || (safeModeRef.current && intentRouter.isDestructiveAction(intent.actionId));
        if (needsConfirm) {
          setPendingConfirm({
            actionId: intent.actionId,
            label: getActionLabel(intent.actionId),
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
        queueAiThinking();
        sendToAiChatRef.current(`[语音指令] ${intent.raw}`);
        Earcon.playSuccess();
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
        sendToAiChatRef.current(`[槽位填充] ${intent.slotName}: ${intent.value}`);
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
  }, [modeRef, safeModeRef, executeActionRef, sendToAiChatRef, insertDictationRef, resolveIntentWithLlmRef, sessionRef, queueAiThinking]);

  // ── Start / Stop ───────────────────────────────────────────────────────────
  const start = useCallback(async (targetMode?: VoiceAgentMode) => {
    if (listening) return;

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

    // 清除旧监听器防止叠加 | Remove previous listeners to prevent accumulation
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

    // Battery Status API hookup | 接入电量状态 API
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

    // Detect region and set appropriate fallback chain
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
    // whisper-local uses whisper-server (port 3040)
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
      setError(err instanceof Error ? err.message : '语音启动失败');
      Earcon.playError();
      return;
    }
    void unlockAudio();
    Earcon.playActivate();
  }, [clearInteractionPrompts, listening, langOverrideRef, handleSttResult, engineRef, whisperServerUrl, whisperServerModel, commercialProviderKindRef, commercialProviderConfigRef]);

  const stop = useCallback(async () => {
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
  }, [clearInteractionPrompts]);

  // ── Push-to-talk (whisper-local) ─────────────────────────────────────────

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
      setError(err instanceof Error ? err.message : '录音启动失败');
    }
  }, []);

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

  // ── Engine switching ──────────────────────────────────────────────────────

  const switchEngine = useCallback((newEngine: SttEngine) => {
    setEngine(newEngine);
    // 持久化引擎偏好 | Persist engine preference
    globalContext.updatePreference('preferredEngine', newEngine);
    if (listening) {
      serviceRef.current?.switchEngine(newEngine);
    }
  }, [listening]);

  const toggle = useCallback((targetMode?: VoiceAgentMode) => {
    if (listening) {
      stop();
    } else {
      start(targetMode);
    }
  }, [listening, start, stop]);

  // ── Safe mode confirmation ────────────────────────────────────────────────
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

  // ── Disambiguation selection | 消歧选择 ──────────────────────────────────
  const selectDisambiguation = useCallback((actionId: ActionId) => {
    void (async () => {
      setDisambiguationOptions([]);
      const intentRouter = intentRouterRuntime ?? await loadIntentRouterRuntime();
      const needsConfirm = intentRouter.shouldConfirmFuzzyAction(actionId)
        || (safeModeRef.current && intentRouter.isDestructiveAction(actionId));
      if (needsConfirm) {
        setPendingConfirm({ actionId, label: getActionLabel(actionId), fromFuzzy: true });
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
  }, [executeActionRef, safeModeRef, sessionRef]);

  const dismissDisambiguation = useCallback(() => {
    setDisambiguationOptions([]);
    setPendingConfirm(null);
  }, []);

  // ── Mode switching ────────────────────────────────────────────────────────
  const switchMode = useCallback((newMode: VoiceAgentMode) => {
    setMode(newMode);
    clearInteractionPrompts();
    setInterimText('');
  }, [clearInteractionPrompts]);

  // ── Language sync: keep VoiceInputService._config.lang in sync with UI override ──
  // Use langOverrideRef to read the current value without causing re-renders
  useEffect(() => {
    const override = langOverride;
    const effective = override === '__auto__' ? '' : (override ? toBcp47(override) : toBcp47(corpusLang));
    serviceRef.current?.setLang(effective);
  }, [langOverride, corpusLang, listening]);

  // ── Wake-word detector lifecycle ──────────────────────────────────────────
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

  // ── Cleanup ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      for (const unsub of svcUnsubscribesRef.current) unsub();
      svcUnsubscribesRef.current = [];
      serviceRef.current?.dispose();
      serviceRef.current = null;
      wakeWordDetectorRef.current?.stop();
      wakeWordDetectorRef.current = null;
    };
  }, []);

  // ── Return value ──────────────────────────────────────────────────────────
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
    // V2: Invoke the analysis fill callback if present (set by setAnalysisFillCallback before sendToAiChat in analysis mode).
    const cb = analysisFillCallbackRef.current;
    if (cb && finalContent !== undefined) {
      cb(finalContent);
      analysisFillCallbackRef.current = null;
      analysisTargetUtteranceIdRef.current = null;
    }
  }, [clearAiThinking]);

  const testWhisperLocal = useCallback(async (): Promise<{ available: boolean; error?: string }> => {
    // whisper-local uses whisper-server on port 3040
    const { testWhisperServerAvailability } = await loadVoiceInputRuntime();
    return testWhisperServerAvailability(
      'http://localhost:3040',
      'ggml-small-q5_k.bin',
    );
  }, []);

  const testCommercialProvider = useCallback(async (): Promise<{ available: boolean; error?: string }> => {
    const { testCommercialProvider } = await loadSttRuntime();
    return testCommercialProvider(commercialProviderKindState, commercialProviderConfigState ?? {});
  }, [commercialProviderKindState, commercialProviderConfigState]);

  /**
   * Register a callback to receive the AI response text when the current
   * AI chat stream completes (after notifyAiStreamFinished).
   * This is used by analysis mode to capture the AI's response and write
   * it back to the utterance layer.
   *
   * @param utteranceId - Target utterance ID (from current selection). Pass null if no utterance selected.
   * @param callback - Called with the AI's final response text. Pass null to clear/deregister.
   */
  const setAnalysisFillCallback = useCallback((
    utteranceId: string | null,
    callback: ((content: string) => void) | null,
  ) => {
    analysisTargetUtteranceIdRef.current = utteranceId;
    analysisFillCallbackRef.current = callback;
  }, []);

  // ── Preset selection & provider probing | 预设选择与可用性探测 ─────────────

  const [providerStatusMap, setProviderStatusMap] = useState<ProviderReachability[]>([]);

  const refreshProviderStatus = useCallback(async () => {
    const { probeAllCommercialProviders } = await loadSttRuntime();
    const configs: Partial<Record<CommercialProviderKind, CommercialProviderCreateConfig>> = {};
    if (commercialProviderConfigRef.current) {
      configs[commercialProviderKindRef.current] = commercialProviderConfigRef.current;
    }
    const results = await probeAllCommercialProviders(configs);
    setProviderStatusMap(results);
  }, [commercialProviderKindRef, commercialProviderConfigRef]);

  const selectPreset = useCallback((preset: VoicePreset) => {
    switchEngine(preset.engine);
    if (preset.commercialKind) {
      setCommercialProviderKind(preset.commercialKind);
    }
  }, [switchEngine, setCommercialProviderKind]);

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
