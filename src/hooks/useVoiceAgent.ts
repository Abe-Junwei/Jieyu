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
import { VoiceInputService, type SttEngine, type SttResult, type CommercialProviderKind } from '../services/VoiceInputService';
import { WakeWordDetector } from '../services/WakeWordDetector';
import { saveVoiceSession, loadRecentVoiceSessions } from '../services/VoiceSessionStore';
import {
  routeIntent,
  isDestructiveAction,
  getActionLabel,
  createVoiceSession,
  type ActionId,
  type VoiceIntent,
  type VoiceSession,
  type VoiceSessionEntry,
} from '../services/IntentRouter';
import { toBcp47 } from '../utils/langMapping';
import { createCommercialProvider, testCommercialProvider as testCommercialProviderFactory, type CommercialProviderCreateConfig } from '../services/stt';
import * as Earcon from '../services/EarconService';
import { useLatest } from './useLatest';
import { globalContext } from '../services/GlobalContextService';
import { userBehaviorStore } from '../services/UserBehaviorStore';

// ── Types ────────────────────────────────────────────────────────────────────

export type VoiceAgentMode = 'command' | 'dictation' | 'analysis';

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
  pendingConfirm: { actionId: ActionId; label: string } | null;
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
}

export interface UseVoiceAgentOptions {
  /** ISO 639-3 corpus language code, e.g. 'cmn', 'jpn' */
  corpusLang?: string;
  /** Language override from the UI selector. '__auto__' = auto-detect, null = use corpusLang. */
  langOverride?: string | null;
  /** Execute a UI action by ActionId */
  executeAction: (actionId: ActionId) => void;
  /** Send text to AI chat (for analysis/chat intents) */
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
  /** Ollama base URL for whisper-local engine, e.g. 'http://localhost:11434' */
  ollamaBaseUrl?: string;
  /** Ollama whisper model name, e.g. 'whisper-small' */
  ollamaModel?: string;
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
    ollamaBaseUrl,
    ollamaModel = 'whisper-small',
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
  const [pendingConfirm, setPendingConfirm] = useState<{ actionId: ActionId; label: string } | null>(null);
  const [session, setSession] = useState<VoiceSession>(createVoiceSession);
  const [engine, setEngine] = useState<SttEngine>('web-speech');
  const [isRecording, setIsRecording] = useState(false);
  const [commercialProviderKindState, setCommercialProviderKindState] = useState<CommercialProviderKind>(commercialProviderKind);
  const [commercialProviderConfigState, setCommercialProviderConfigState] = useState<CommercialProviderCreateConfig | undefined>(commercialProviderConfig);
  const [wakeWordEnabled, setWakeWordEnabledState] = useState(initialWakeWordEnabled);
  const [wakeWordEnergyLevel, setWakeWordEnergyLevel] = useState(0);
  const [detectedLang, setDetectedLang] = useState<string | null>(null);
  /** Multi-agent pipeline state (Stage 1 new) */
  const [agentState, setAgentState] = useState<VoiceAgentState['agentState']>('idle');

  // Stable refs
  const serviceRef = useRef<VoiceInputService | null>(null);
  const wakeWordDetectorRef = useRef<WakeWordDetector | null>(null);
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

  // Load most recent session from IndexedDB on mount
  useEffect(() => {
    loadRecentVoiceSessions(1).then(([recent]) => {
      if (recent && recent.entries.length > 0) {
        setSession(recent);
      }
    }).catch(() => {
      // IndexedDB unavailable — silently skip
    });
  }, []);

  // ── Handle result from VoiceInputService ─────────────────────────────────
  const handleSttResult = useCallback(async (result: SttResult) => {
    if (result.lang) {
      setDetectedLang(result.lang);
    }

    if (!result.isFinal) {
      setInterimText(result.text);
      setConfidence(result.confidence);
      return;
    }

    setInterimText('');
    setFinalText(result.text);
    setConfidence(result.confidence);
    setAgentState('routing');

    const currentMode = modeRef.current;
    let intent = routeIntent(result.text, currentMode);

    let llmFallbackFailed = false;
    if (intent.type === 'chat' && currentMode === 'command' && resolveIntentWithLlmRef.current) {
      try {
        const fallbackIntent = await resolveIntentWithLlmRef.current({
          text: result.text,
          mode: currentMode,
          session: sessionRef.current,
        });
        if (fallbackIntent) {
          intent = fallbackIntent;
        } else {
          llmFallbackFailed = true;
          setError('无法识别该指令，请重试或切换到"分析"模式直接发送文本');
        }
      } catch (err) {
        llmFallbackFailed = true;
        setError(err instanceof Error ? err.message : 'LLM intent解析失败，请检查 API 配置');
      }
    }
    setLastIntent(intent);

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
          intent.fromFuzzy || (safeModeRef.current && isDestructiveAction(intent.actionId));
        if (needsConfirm) {
          const label = intent.fromFuzzy
            ? `[模糊] ${getActionLabel(intent.actionId)}`
            : getActionLabel(intent.actionId);
          setPendingConfirm({ actionId: intent.actionId, label });
          Earcon.playTick();
          setAgentState('idle');
        } else {
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
        sendToAiChatRef.current?.(`[语音指令] ${intent.raw}`);
        Earcon.playSuccess();
        setAgentState('idle');
        break;
      }
      case 'dictation': {
        insertDictationRef.current?.(intent.text);
        setAgentState('idle');
        break;
      }
      case 'slot-fill': {
        sendToAiChatRef.current?.(`[槽位填充] ${intent.slotName}: ${intent.value}`);
        setAgentState('idle');
        break;
      }
      case 'chat': {
        if (llmFallbackFailed) break;
        sendToAiChatRef.current?.(intent.text);
        setAgentState('idle');
        break;
      }
    }
  }, [modeRef, safeModeRef, executeActionRef, sendToAiChatRef, insertDictationRef, resolveIntentWithLlmRef, sessionRef]);

  // ── Start / Stop ───────────────────────────────────────────────────────────
  const start = useCallback((targetMode?: VoiceAgentMode) => {
    if (listening) return;

    const effectiveLang = (() => {
      const override = langOverrideRef.current;
      if (override === '__auto__') return '';
      if (override) return toBcp47(override);
      return toBcp47(corpusLang);
    })();
    if (targetMode) setMode(targetMode);
    setError(null);
    setPendingConfirm(null);
    setSession(createVoiceSession());
    setAgentState('listening');

    let svc = serviceRef.current;
    if (!svc) {
      svc = new VoiceInputService();
      serviceRef.current = svc;
    }

    svc.onResult(handleSttResult);
    svc.onError((err) => {
      setError(err);
      Earcon.playError();
    });
    svc.onStateChange(setListening);
    if ('onVadStateChange' in svc && typeof svc.onVadStateChange === 'function') {
      svc.onVadStateChange(setSpeechActive);
    }
    if ('onEnergyLevel' in svc && typeof svc.onEnergyLevel === 'function') {
      svc.onEnergyLevel((rms) => {
        energyLevelRef.current = rms;
        setEnergyLevel(rms);
      });
    }

    const startConfig: Parameters<typeof svc.start>[0] = {
      lang: effectiveLang,
      continuous: true,
      interimResults: true,
      preferredEngine: engineRef.current,
      maxAlternatives: 3,
    };
    if (ollamaBaseUrl) startConfig.ollamaBaseUrl = ollamaBaseUrl;
    if (ollamaModel) startConfig.ollamaModel = ollamaModel;
    if (engineRef.current === 'commercial' && commercialProviderConfigRef.current) {
      startConfig.commercialFallback = createCommercialProvider(
        commercialProviderKindRef.current,
        commercialProviderConfigRef.current,
      );
    }
    svc.start(startConfig);
    console.log('[DEBUG] start() called, service started, about to play activate sound');
    Earcon.playActivate();
  }, [listening, langOverrideRef, handleSttResult, engineRef, ollamaBaseUrl, ollamaModel, commercialProviderKindRef, commercialProviderConfigRef]);

  const stop = useCallback(() => {
    serviceRef.current?.stop();
    setListening(false);
    setSpeechActive(false);
    setInterimText('');
    setPendingConfirm(null);
    setAgentState('idle');

    const currentSession = sessionRef.current;
    if (currentSession.entries.length > 0) {
      saveVoiceSession(currentSession).catch(() => {
        // IndexedDB unavailable — silently skip
      });
    }

    Earcon.playDeactivate();
  }, []);

  // ── Push-to-talk (whisper-local) ─────────────────────────────────────────

  const startRecording = useCallback(async () => {
    const svc = serviceRef.current;
    if (!svc) return;
    setIsRecording(true);
    setRecordingDuration(0);
    setAgentState('listening');
    recordingDurationIntervalRef.current = setInterval(() => {
      setRecordingDuration((d) => d + 1);
    }, 1000);
    await svc.startRecording();
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
    if (listening) {
      serviceRef.current?.switchEngine(newEngine);
    }
  }, [listening]);

  const toggle = useCallback((targetMode?: VoiceAgentMode) => {
    console.log('[DEBUG] toggle called, listening=', listening, 'engine=', engineRef.current);
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
    setPendingConfirm(null);
    Earcon.playSuccess();
    globalContext.markSessionStart();
    userBehaviorStore.recordAction({
      actionId: pendingConfirm.actionId,
      durationMs: 0,
      sessionId: sessionRef.current.id,
    });
  }, [pendingConfirm, executeActionRef, sessionRef]);

  const cancelPending = useCallback(() => {
    setPendingConfirm(null);
    Earcon.playTick();
  }, []);

  // ── Mode switching ────────────────────────────────────────────────────────
  const switchMode = useCallback((newMode: VoiceAgentMode) => {
    setMode(newMode);
    setPendingConfirm(null);
    setInterimText('');
  }, []);

  // ── Wake-word detector lifecycle ──────────────────────────────────────────
  useEffect(() => {
    if (!wakeWordEnabled) {
      wakeWordDetectorRef.current?.stop();
      wakeWordDetectorRef.current = null;
      return;
    }
    if (listening) return;

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

    return () => {
      detector.stop();
      wakeWordDetectorRef.current = null;
    };
  }, [wakeWordEnabled, listening]);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
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

  const testCommercialProvider = useCallback(async (): Promise<{ available: boolean; error?: string }> => {
    return testCommercialProviderFactory(commercialProviderKindState, commercialProviderConfigState ?? {});
  }, [commercialProviderKindState, commercialProviderConfigState]);

  return {
    ...state,
    setCommercialProviderKind,
    setCommercialProviderConfig,
    testCommercialProvider,
    start,
    stop,
    toggle,
    switchMode,
    setSafeMode,
    setWakeWordEnabled,
    confirmPending,
    cancelPending,
    switchEngine,
    startRecording,
    stopRecording,
  };
}
