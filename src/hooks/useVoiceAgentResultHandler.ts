import { useCallback } from 'react';
import * as Earcon from '../services/EarconService';
import { getActionLabel } from '../services/voiceIntentUi';
import { globalContext } from '../services/GlobalContextService';
import { userBehaviorStore } from '../services/UserBehaviorStore';
import type { ActionId, ActionIntent, VoiceIntent, VoiceSession, VoiceSessionEntry } from '../services/IntentRouter';
import type { SttResult } from '../services/VoiceInputService';
import {
  loadIntentRouterRuntime,
  loadVoiceIntentRefineRuntime,
} from './useVoiceAgent.runtime';
import { t, tf, type Locale } from '../i18n';

type VoiceAgentMode = 'command' | 'dictation' | 'analysis';

interface RefLike<T> {
  current: T;
}

interface UseVoiceAgentResultHandlerOptions {
  locale: Locale;
  handlePipelineResult: (result: SttResult) => boolean;
  modeRef: RefLike<VoiceAgentMode>;
  safeModeRef: RefLike<boolean>;
  sessionRef: RefLike<VoiceSession>;
  executeActionRef: RefLike<(actionId: ActionId) => void>;
  sendToAiChatRef: RefLike<((text: string) => void) | undefined>;
  insertDictationRef: RefLike<((text: string) => void) | undefined>;
  resolveIntentWithLlmRef: RefLike<((input: {
    text: string;
    mode: VoiceAgentMode;
    session: VoiceSession;
  }) => Promise<VoiceIntent | null>) | undefined>;
  aliasMapRef: RefLike<Record<string, ActionId>>;
  queueAiThinking: () => void;
  setDetectedLang: (lang: string | null) => void;
  setError: (value: string | null) => void;
  setInterimText: (value: string) => void;
  setFinalText: (value: string) => void;
  setConfidence: (value: number) => void;
  setAgentState: (value: 'idle' | 'listening' | 'routing' | 'executing' | 'ai-thinking') => void;
  setLastIntent: (intent: VoiceIntent | null) => void;
  setDisambiguationOptions: (options: ActionIntent[]) => void;
  setSession: React.Dispatch<React.SetStateAction<VoiceSession>>;
  setPendingConfirm: React.Dispatch<React.SetStateAction<{
    actionId: ActionId;
    label: string;
    fromFuzzy?: boolean;
  } | null>>;
}

function appendVoiceSessionEntry(
  setSession: React.Dispatch<React.SetStateAction<VoiceSession>>,
  entry: VoiceSessionEntry,
) {
  setSession((prev) => ({
    ...prev,
    entries: [...prev.entries, entry],
  }));
}

function updateDisambiguationOptions(
  intent: VoiceIntent,
  sttText: string,
  confidence: number,
  intentRouter: Awaited<ReturnType<typeof loadIntentRouterRuntime>>,
  setDisambiguationOptions: (options: ActionIntent[]) => void,
) {
  if (
    intent.type === 'action'
    && intent.fromFuzzy
    && intent.confidence < intentRouter.LOW_CONFIDENCE_THRESHOLD
  ) {
    setDisambiguationOptions(intentRouter.collectAlternativeIntents(
      sttText,
      intent.actionId,
      confidence,
    ));
    return;
  }
  setDisambiguationOptions([]);
}

async function resolveVoiceIntentFromResult(options: {
  result: SttResult;
  currentMode: VoiceAgentMode;
  session: VoiceSession;
  aliasMap: Record<string, ActionId>;
  resolveIntentWithLlm: ((input: {
    text: string;
    mode: VoiceAgentMode;
    session: VoiceSession;
  }) => Promise<VoiceIntent | null>) | undefined;
  locale: Locale;
  setError: (value: string | null) => void;
}) {
  const intentRouter = await loadIntentRouterRuntime();
  let intent = intentRouter.routeIntent(options.result.text, options.currentMode, {
    sttConfidence: options.result.confidence,
    detectedLang: options.result.lang,
    aliasMap: options.aliasMap,
  });

  let llmFallbackFailed = false;
  let llmResolvedAction = false;
  if (intent.type === 'chat' && options.currentMode === 'command' && options.resolveIntentWithLlm) {
    try {
      const fallbackIntent = await options.resolveIntentWithLlm({
        text: options.result.text,
        mode: options.currentMode,
        session: options.session,
      });
      if (fallbackIntent) {
        const { refineLlmFallbackIntent } = await loadVoiceIntentRefineRuntime();
        intent = refineLlmFallbackIntent(fallbackIntent, options.result);
        llmResolvedAction = intent.type === 'action';
      } else {
        llmFallbackFailed = true;
        options.setError(t(options.locale, 'transcription.voice.error.commandUnrecognized'));
      }
    } catch (err) {
      llmFallbackFailed = true;
      options.setError(err instanceof Error ? err.message : t(options.locale, 'transcription.voice.error.intentResolveFailed'));
    }
  }

  if (llmResolvedAction && intent.type === 'action') {
    const learned = intentRouter.learnVoiceIntentAlias(options.result.text, intent.actionId);
    if (learned.applied) {
      return {
        intentRouter,
        intent,
        llmFallbackFailed,
        nextAliasMap: learned.aliasMap,
      };
    }
  }
  if (!llmResolvedAction && intent.type === 'action' && intent.fromAlias) {
    intentRouter.bumpAliasUsage(options.result.text);
  }

  return {
    intentRouter,
    intent,
    llmFallbackFailed,
    nextAliasMap: undefined,
  };
}

function executeVoiceIntent(options: {
  intent: VoiceIntent;
  intentRouter: Awaited<ReturnType<typeof loadIntentRouterRuntime>>;
  locale: Locale;
  safeMode: boolean;
  sessionId: string;
  executeAction: (actionId: ActionId) => void;
  sendToAiChat: ((text: string) => void) | undefined;
  insertDictation: ((text: string) => void) | undefined;
  queueAiThinking: () => void;
  setError: (value: string | null) => void;
  setAgentState: (value: 'idle' | 'listening' | 'routing' | 'executing' | 'ai-thinking') => void;
  setPendingConfirm: React.Dispatch<React.SetStateAction<{
    actionId: ActionId;
    label: string;
    fromFuzzy?: boolean;
  } | null>>;
}) {
  switch (options.intent.type) {
    case 'action': {
      const needsConfirm =
        (options.intent.fromFuzzy && options.intentRouter.shouldConfirmFuzzyAction(options.intent.actionId))
        || (options.safeMode && options.intentRouter.isDestructiveAction(options.intent.actionId));
      if (needsConfirm) {
        options.setPendingConfirm({
          actionId: options.intent.actionId,
          label: getActionLabel(options.intent.actionId, options.locale),
          ...(options.intent.fromFuzzy !== undefined ? { fromFuzzy: options.intent.fromFuzzy } : {}),
        });
        Earcon.playTick();
        options.setAgentState('idle');
        return;
      }
      options.setError(null);
      options.executeAction(options.intent.actionId);
      Earcon.playSuccess();
      globalContext.markSessionStart();
      userBehaviorStore.recordAction({
        actionId: options.intent.actionId,
        durationMs: 0,
        sessionId: options.sessionId,
      });
      options.setAgentState('idle');
      return;
    }
    case 'tool': {
      if (!options.sendToAiChat) {
        options.setAgentState('idle');
        return;
      }
      options.setError(null);
      Earcon.playSuccess();
      options.queueAiThinking();
      options.sendToAiChat(tf(options.locale, 'transcription.voice.chatPrefix.command', { text: options.intent.raw }));
      return;
    }
    case 'dictation': {
      options.setError(null);
      options.insertDictation?.(options.intent.text);
      options.setAgentState('idle');
      return;
    }
    case 'slot-fill': {
      if (!options.sendToAiChat) {
        options.setAgentState('idle');
        return;
      }
      options.setError(null);
      options.queueAiThinking();
      options.sendToAiChat(tf(options.locale, 'transcription.voice.chatPrefix.slotFill', {
        slotName: options.intent.slotName,
        value: options.intent.value,
      }));
      return;
    }
    case 'chat': {
      if (!options.sendToAiChat) {
        options.setAgentState('idle');
        return;
      }
      options.setError(null);
      options.queueAiThinking();
      options.sendToAiChat(options.intent.text);
    }
  }
}

export function useVoiceAgentResultHandler({
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
}: UseVoiceAgentResultHandlerOptions) {
  return useCallback(async (result: SttResult) => {
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
    const { intentRouter, intent, llmFallbackFailed, nextAliasMap } = await resolveVoiceIntentFromResult({
      result,
      currentMode,
      session: sessionRef.current,
      aliasMap: aliasMapRef.current,
      resolveIntentWithLlm: resolveIntentWithLlmRef.current,
      locale,
      setError,
    });
    if (nextAliasMap) {
      aliasMapRef.current = nextAliasMap;
    }
    setLastIntent(intent);
    updateDisambiguationOptions(
      intent,
      result.text,
      result.confidence,
      intentRouter,
      setDisambiguationOptions,
    );

    appendVoiceSessionEntry(setSession, {
      timestamp: Date.now(),
      intent,
      sttText: result.text,
      confidence: result.confidence,
    });

    setAgentState(llmFallbackFailed ? 'idle' : 'executing');
    if (llmFallbackFailed && intent.type === 'chat') {
      return;
    }

    executeVoiceIntent({
      intent,
      intentRouter,
      locale,
      safeMode: safeModeRef.current,
      sessionId: sessionRef.current.id,
      executeAction: executeActionRef.current,
      sendToAiChat: sendToAiChatRef.current,
      insertDictation: insertDictationRef.current,
      queueAiThinking,
      setError,
      setAgentState,
      setPendingConfirm,
    });
  }, [
    aliasMapRef,
    executeActionRef,
    handlePipelineResult,
    insertDictationRef,
    locale,
    modeRef,
    queueAiThinking,
    resolveIntentWithLlmRef,
    safeModeRef,
    sendToAiChatRef,
    sessionRef,
    setAgentState,
    setConfidence,
    setDetectedLang,
    setDisambiguationOptions,
    setError,
    setFinalText,
    setInterimText,
    setLastIntent,
    setPendingConfirm,
    setSession,
  ]);
}
