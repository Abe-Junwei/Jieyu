/**
 * useVoiceAgent — 语音智能体核心 hook
 *
 * 三模式状态机 (command / dictation / analysis)，
 * 集成 VoiceInputService + IntentRouter + EarconService + 按键执行。
 *
 * @see 解语-语音智能体架构设计方案 §4.5
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { VoiceInputService, type SttEngine, type SttResult } from '../services/VoiceInputService';
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
import * as Earcon from '../services/EarconService';
import { useLatest } from './useLatest';

// ── Types ──

export type VoiceAgentMode = 'command' | 'dictation' | 'analysis';

export interface VoiceAgentState {
  /** Whether voice input is currently listening */
  listening: boolean;
  /** Whether VAD detects active speech */
  speechActive: boolean;
  /** Current mode of the agent */
  mode: VoiceAgentMode;
  /** Latest interim transcript (cleared on final) */
  interimText: string;
  /** Latest final transcript */
  finalText: string;
  /** Confidence of the latest result (0-1) */
  confidence: number;
  /** Most recently routed intent */
  lastIntent: VoiceIntent | null;
  /** Error message from STT or routing */
  error: string | null;
  /** Safe mode — confirm destructive actions before execution */
  safeMode: boolean;
  /** Pending confirmation for destructive actions */
  pendingConfirm: { actionId: ActionId; label: string } | null;
  /** Current voice session for replay */
  session: VoiceSession;
  /** Current STT engine */
  engine: SttEngine;
  /** Whether push-to-talk recording is in progress (whisper-local) */
  isRecording: boolean;
}

export interface UseVoiceAgentOptions {
  /** ISO 639-3 corpus language code, e.g. 'cmn', 'jpn' */
  corpusLang?: string;
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
}

// ── Confidence color thresholds ──

export function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.85) return 'var(--voice-confidence-high, #22c55e)';
  if (confidence >= 0.6) return 'var(--voice-confidence-mid, #eab308)';
  return 'var(--voice-confidence-low, #ef4444)';
}

// ── Hook ──

export function useVoiceAgent(options: UseVoiceAgentOptions) {
  const {
    corpusLang = 'cmn',
    executeAction,
    sendToAiChat,
    insertDictation,
    initialSafeMode = false,
    resolveIntentWithLlm,
    ollamaBaseUrl,
    ollamaModel = 'whisper-small',
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
  const [pendingConfirm, setPendingConfirm] = useState<{ actionId: ActionId; label: string } | null>(null);
  const [session, setSession] = useState<VoiceSession>(createVoiceSession);
  const [engine, setEngine] = useState<SttEngine>('web-speech');
  const [isRecording, setIsRecording] = useState(false);

  // Stable refs
  const serviceRef = useRef<VoiceInputService | null>(null);
  const executeActionRef = useLatest(executeAction);
  const sendToAiChatRef = useLatest(sendToAiChat);
  const insertDictationRef = useLatest(insertDictation);
  const resolveIntentWithLlmRef = useLatest(resolveIntentWithLlm);
  const modeRef = useLatest(mode);
  const safeModeRef = useLatest(safeMode);
  const sessionRef = useLatest(session);
  const engineRef = useLatest(engine);

  // ── Handle result from VoiceInputService ──
  const handleSttResult = useCallback(async (result: SttResult) => {
    if (!result.isFinal) {
      setInterimText(result.text);
      setConfidence(result.confidence);
      return;
    }

    // Final result
    setInterimText('');
    setFinalText(result.text);
    setConfidence(result.confidence);

    const currentMode = modeRef.current;
    let intent = routeIntent(result.text, currentMode);

    if (intent.type === 'chat' && currentMode === 'command' && resolveIntentWithLlmRef.current) {
      try {
        const fallbackIntent = await resolveIntentWithLlmRef.current({
          text: result.text,
          mode: currentMode,
          session: sessionRef.current,
        });
        if (fallbackIntent) {
          intent = fallbackIntent;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'LLM intent fallback failed');
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
    switch (intent.type) {
      case 'action': {
        if (safeModeRef.current && isDestructiveAction(intent.actionId)) {
          setPendingConfirm({ actionId: intent.actionId, label: getActionLabel(intent.actionId) });
          Earcon.playTick();
        } else {
          executeActionRef.current(intent.actionId);
          Earcon.playSuccess();
        }
        break;
      }
      case 'tool': {
        // For Phase 1, tool intents go to AI chat with the tool hint
        sendToAiChatRef.current?.(`[语音指令] ${intent.raw}`);
        Earcon.playSuccess();
        break;
      }
      case 'dictation': {
        insertDictationRef.current?.(intent.text);
        break;
      }
      case 'slot-fill': {
        // Slot-fill is forwarded to AI chat as structured input
        sendToAiChatRef.current?.(`[槽位填充] ${intent.slotName}: ${intent.value}`);
        break;
      }
      case 'chat': {
        sendToAiChatRef.current?.(intent.text);
        break;
      }
    }
  }, [modeRef, safeModeRef, executeActionRef, sendToAiChatRef, insertDictationRef, resolveIntentWithLlmRef, sessionRef]);

  // ── Start / Stop ──
  const start = useCallback((targetMode?: VoiceAgentMode) => {
    if (listening) return;

    const bcp47 = toBcp47(corpusLang);
    if (targetMode) setMode(targetMode);
    setError(null);
    setPendingConfirm(null);
    setSession(createVoiceSession());

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

    const startConfig: Parameters<typeof svc.start>[0] = {
      lang: bcp47,
      continuous: true,
      interimResults: true,
      preferredEngine: engineRef.current,
      maxAlternatives: 3,
    };
    if (ollamaBaseUrl) startConfig.ollamaBaseUrl = ollamaBaseUrl;
    if (ollamaModel) startConfig.ollamaModel = ollamaModel;
    svc.start(startConfig);

    Earcon.playActivate();
  }, [listening, corpusLang, handleSttResult, engineRef, ollamaBaseUrl, ollamaModel]);

  const stop = useCallback(() => {
    serviceRef.current?.stop();
    setListening(false);
    setSpeechActive(false);
    setInterimText('');
    setPendingConfirm(null);
    Earcon.playDeactivate();
  }, []);

  // ── Push-to-talk (whisper-local) ──

  /** Start push-to-talk recording (whisper-local engine only). */
  const startRecording = useCallback(async () => {
    const svc = serviceRef.current;
    if (!svc) return;
    setIsRecording(true);
    await svc.startRecording();
  }, []);

  /** Stop push-to-talk recording and trigger transcription. */
  const stopRecording = useCallback(async () => {
    const svc = serviceRef.current;
    if (!svc) return;
    setIsRecording(false);
    await svc.stopRecording();
  }, []);

  // ── Engine switching ──

  const switchEngine = useCallback((newEngine: SttEngine) => {
    setEngine(newEngine);
    // If already listening, switch the active engine without interrupting listening state
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

  // ── Safe mode confirmation ──
  const confirmPending = useCallback(() => {
    if (!pendingConfirm) return;
    executeActionRef.current(pendingConfirm.actionId);
    setPendingConfirm(null);
    Earcon.playSuccess();
  }, [pendingConfirm, executeActionRef]);

  const cancelPending = useCallback(() => {
    setPendingConfirm(null);
    Earcon.playTick();
  }, []);

  // ── Mode switching ──
  const switchMode = useCallback((newMode: VoiceAgentMode) => {
    setMode(newMode);
    setPendingConfirm(null);
    setInterimText('');
  }, []);

  // ── Cleanup ──
  useEffect(() => {
    return () => {
      serviceRef.current?.dispose();
      serviceRef.current = null;
    };
  }, []);

  // ── Return value ──
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
  };

  return {
    ...state,
    start,
    stop,
    toggle,
    switchMode,
    setSafeMode,
    confirmPending,
    cancelPending,
    switchEngine,
    startRecording,
    stopRecording,
  };
}
