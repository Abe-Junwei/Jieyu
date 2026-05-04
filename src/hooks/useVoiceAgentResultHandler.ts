import { useCallback } from 'react';
import type { ActionId, ActionIntent, VoiceIntent, VoiceSession } from '../services/IntentRouter';
import type { SttResult } from '../services/VoiceInputService';
import type { VoiceMode } from '../services/voiceMode';
import { resolveVoiceIntent } from '../services/voiceIntentResolution';
import { runVoiceFinalSttAfterIntentResolution } from '../services/assistantVoiceSttOrchestrate';
import { applyVoiceSttInterimIfNotFinal } from '../services/voiceAgentSttSurface';
import type { VoiceAssistantToolCallHandler } from '../types/voiceAssistantToolCall';
import { loadIntentRouterRuntime, loadVoiceIntentRefineRuntime } from './useVoiceAgent.runtime';
import { type Locale } from '../i18n';

type VoiceAgentMode = VoiceMode;

interface RefLike<T> {
  current: T;
}

interface UseVoiceAgentResultHandlerOptions {
  locale: Locale;
  /** ISO 639-3 corpus language for memory-pattern detection */
  corpusLang: string;
  handlePipelineResult: (result: SttResult) => boolean;
  modeRef: RefLike<VoiceAgentMode>;
  safeModeRef: RefLike<boolean>;
  sessionRef: RefLike<VoiceSession>;
  executeActionRef: RefLike<(actionId: ActionId, params?: { segmentIndex?: number }) => void>;
  sendToAiChatRef: RefLike<((text: string) => void) | undefined>;
  insertDictationRef: RefLike<((text: string) => void) | undefined>;
  resolveIntentWithLlmRef: RefLike<((input: {
    text: string;
    mode: VoiceAgentMode;
    session: VoiceSession;
  }) => Promise<VoiceIntent | null>) | undefined>;
  executeVoiceToolCallRef: RefLike<VoiceAssistantToolCallHandler | undefined>;
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
    params?: { segmentIndex?: number };
  } | null>>;
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
  currentMode: VoiceMode;
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
  const { refineLlmFallbackIntent } = await loadVoiceIntentRefineRuntime();

  const { intent, llmFallbackFailed, nextAliasMap, errorMessage } = await resolveVoiceIntent(
    {
      routeIntent: intentRouter.routeIntent,
      learnVoiceIntentAlias: intentRouter.learnVoiceIntentAlias,
      bumpAliasUsage: intentRouter.bumpAliasUsage,
      refineLlmFallbackIntent,
    },
    {
      result: options.result,
      mode: options.currentMode,
      session: options.session,
      aliasMap: options.aliasMap,
      locale: options.locale,
      ...(options.resolveIntentWithLlm !== undefined && { resolveIntentWithLlm: options.resolveIntentWithLlm }),
    },
  );
  if (errorMessage) {
    options.setError(errorMessage);
  }

  return {
    intentRouter,
    intent,
    llmFallbackFailed,
    nextAliasMap,
  };
}

export function useVoiceAgentResultHandler({
  locale,
  corpusLang,
  handlePipelineResult,
  modeRef,
  safeModeRef,
  sessionRef,
  executeActionRef,
  sendToAiChatRef,
  insertDictationRef,
  resolveIntentWithLlmRef,
  executeVoiceToolCallRef,
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

    if (
      applyVoiceSttInterimIfNotFinal({
        result,
        clearErrorOnNonEmptyInterim: () => {
          setError(null);
        },
        setInterimText,
        setConfidence,
      })
    ) {
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

    await runVoiceFinalSttAfterIntentResolution({
      corpusLang,
      baseSession: sessionRef.current,
      intent,
      sttResult: result,
      llmFallbackFailed,
      afterIntentResolved: () => {
        setLastIntent(intent);
        updateDisambiguationOptions(
          intent,
          result.text,
          result.confidence,
          intentRouter,
          setDisambiguationOptions,
        );
        setAgentState(llmFallbackFailed ? 'idle' : 'executing');
      },
      commitAppendedSession: (next) => {
        setSession(next);
      },
      locale,
      safeMode: safeModeRef.current,
      intentRouter,
      executeAction: executeActionRef.current,
      ...(sendToAiChatRef.current !== undefined ? { sendToAiChat: sendToAiChatRef.current } : {}),
      ...(insertDictationRef.current !== undefined ? { insertDictation: insertDictationRef.current } : {}),
      ...(executeVoiceToolCallRef.current !== undefined ? { executeVoiceToolCall: executeVoiceToolCallRef.current } : {}),
      queueAiThinking,
      setError,
      setAgentState,
      setPendingConfirm,
      inputModality: 'voice',
    });
  }, [
    aliasMapRef,
    corpusLang,
    executeActionRef,
    executeVoiceToolCallRef,
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
