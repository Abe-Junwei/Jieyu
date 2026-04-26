import { useCallback } from 'react';
import * as Earcon from '../services/EarconService';
import { globalContext } from '../services/GlobalContextService';
import { userBehaviorStore } from '../services/UserBehaviorStore';
import type { ActionId, VoiceSession } from '../services/IntentRouter';
import type { SttEngine, VoiceInputService as VoiceInputServiceType } from '../services/VoiceInputService';
import type { VoiceMode } from '../services/voiceMode';
import type { Locale } from '../i18n';
import { t } from '../i18n';

interface RefLike<T> {
  current: T;
}

interface UseVoiceAgentTransportControlsOptions {
  locale: Locale;
  listening: boolean;
  voiceActivateGenerationRef: RefLike<number>;
  exclusiveStartPromiseRef: RefLike<Promise<void> | null>;
  start: (targetMode?: VoiceMode) => Promise<void>;
  stopDictationPipeline: () => void;
  clearInteractionPrompts: () => void;
  loadVoiceSessionStoreRuntime: () => Promise<typeof import('../services/VoiceSessionStore')>;
  serviceRef: RefLike<VoiceInputServiceType | null>;
  sessionRef: RefLike<VoiceSession>;
  executeActionRef: RefLike<(actionId: ActionId) => void>;
  pendingAiResponseCountRef: RefLike<number>;
  recordingDurationIntervalRef: RefLike<ReturnType<typeof setInterval> | null>;
  setListening: (value: boolean) => void;
  setSpeechActive: (value: boolean) => void;
  setInterimText: (value: string) => void;
  setAgentState: (value: 'idle' | 'listening' | 'routing' | 'executing' | 'ai-thinking') => void;
  setIsRecording: (value: boolean) => void;
  setRecordingDuration: React.Dispatch<React.SetStateAction<number>>;
  setError: (value: string | null) => void;
  setEngine: (value: SttEngine) => void;
}

function clearRecordingDurationTimer(
  recordingDurationIntervalRef: RefLike<ReturnType<typeof setInterval> | null>,
) {
  if (recordingDurationIntervalRef.current !== null) {
    clearInterval(recordingDurationIntervalRef.current);
    recordingDurationIntervalRef.current = null;
  }
}

export function useVoiceAgentTransportControls({
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
}: UseVoiceAgentTransportControlsOptions) {
  const stop = useCallback(async () => {
    voiceActivateGenerationRef.current += 1;
    const pendingExclusiveStart = exclusiveStartPromiseRef.current;
    exclusiveStartPromiseRef.current = null;
    if (pendingExclusiveStart) {
      try {
        await pendingExclusiveStart;
      } catch {
        /* start() may reject; still proceed to hard-stop the mic */
      }
    }
    stopDictationPipeline();
    serviceRef.current?.stop();
    clearRecordingDurationTimer(recordingDurationIntervalRef);
    setListening(false);
    setSpeechActive(false);
    setIsRecording(false);
    setRecordingDuration(0);
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
        console.warn('[useVoiceAgent] saveVoiceSession failed:', err);
      }
    }

    Earcon.playDeactivate();
  }, [
    clearInteractionPrompts,
    exclusiveStartPromiseRef,
    loadVoiceSessionStoreRuntime,
    pendingAiResponseCountRef,
    serviceRef,
    sessionRef,
    setAgentState,
    setInterimText,
    setIsRecording,
    setListening,
    setRecordingDuration,
    setSpeechActive,
    stopDictationPipeline,
    voiceActivateGenerationRef,
  ]);

  const startRecording = useCallback(async () => {
    const svc = serviceRef.current;
    if (!svc) return;
    setAgentState('listening');
    try {
      await svc.startRecording();
      setIsRecording(true);
      setRecordingDuration(0);
      clearRecordingDurationTimer(recordingDurationIntervalRef);
      recordingDurationIntervalRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
    } catch (err) {
      setIsRecording(false);
      setAgentState('idle');
      Earcon.playError();
      setError(err instanceof Error ? err.message : t(locale, 'transcription.voice.error.recordingStartFailed'));
    }
  }, [
    locale,
    recordingDurationIntervalRef,
    serviceRef,
    setAgentState,
    setError,
    setIsRecording,
    setRecordingDuration,
  ]);

  const stopRecording = useCallback(async () => {
    const svc = serviceRef.current;
    if (!svc) return;
    setIsRecording(false);
    clearRecordingDurationTimer(recordingDurationIntervalRef);
    setAgentState('idle');
    await svc.stopRecording();
  }, [recordingDurationIntervalRef, serviceRef, setAgentState, setIsRecording]);

  const switchEngine = useCallback((newEngine: SttEngine) => {
    setEngine(newEngine);
    globalContext.updatePreference('preferredEngine', newEngine);
    if (listening) {
      serviceRef.current?.switchEngine(newEngine);
      setAgentState(newEngine === 'web-speech' ? 'listening' : 'idle');
    }
  }, [listening, serviceRef, setAgentState, setEngine]);

  const toggle = useCallback((targetMode?: VoiceMode) => {
    if (listening) {
      void stop();
    } else {
      void start(targetMode);
    }
  }, [listening, start, stop]);

  const confirmPendingAction = useCallback((pendingConfirm: {
    actionId: ActionId;
    label: string;
    fromFuzzy?: boolean;
  } | null) => {
    if (!pendingConfirm) return;
    executeActionRef.current(pendingConfirm.actionId);
    clearInteractionPrompts();
    Earcon.playSuccess();
    globalContext.markSessionStart();
    userBehaviorStore.recordAction({
      actionId: pendingConfirm.actionId,
      durationMs: 0,
      sessionId: sessionRef.current.id,
      inputModality: 'voice',
    });
  }, [clearInteractionPrompts, executeActionRef, sessionRef]);

  return {
    stop,
    startRecording,
    stopRecording,
    switchEngine,
    toggle,
    confirmPendingAction,
  };
}
