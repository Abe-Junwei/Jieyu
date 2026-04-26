/**
 * useVoiceAgentModeController — 语音智能体模式切换与消歧控制
 * Voice agent mode switching and disambiguation interaction controller
 */

import { useCallback } from 'react';
import type { ActionId, ActionIntent } from '../services/IntentRouter';
import { getActionLabel } from '../services/voiceIntentUi';
import * as Earcon from '../services/EarconService';
import { globalContext } from '../services/GlobalContextService';
import { userBehaviorStore } from '../services/UserBehaviorStore';
import type { VoiceAgentMode, VoiceAgentState } from './useVoiceAgent';
import type { loadIntentRouterRuntime as LoadIntentRouterRuntimeFn } from './useVoiceAgent.runtime';
import type { Locale } from '../i18n';

export interface UseVoiceAgentModeControllerParams {
  locale: Locale;
  listening: boolean;
  dictationPipeline: unknown | undefined;
  safeModeRef: React.RefObject<boolean>;
  sessionRef: React.RefObject<{ id: string }>;
  executeActionRef: React.RefObject<(actionId: ActionId) => void>;
  loadIntentRouterRuntime: typeof LoadIntentRouterRuntimeFn;
  clearInteractionPrompts: () => void;
  startDictationPipeline: () => void;
  stopDictationPipeline: () => void;
  setMode: (mode: VoiceAgentMode) => void;
  setInterimText: (text: string) => void;
  setAgentState: (state: VoiceAgentState['agentState']) => void;
  setDisambiguationOptions: (options: ActionIntent[]) => void;
  setPendingConfirm: (confirm: { actionId: ActionId; label: string; fromFuzzy?: boolean } | null) => void;
}

export function useVoiceAgentModeController({
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
}: UseVoiceAgentModeControllerParams) {
  const cancelPending = useCallback(() => {
    clearInteractionPrompts();
    Earcon.playTick();
  }, [clearInteractionPrompts]);

  const selectDisambiguation = useCallback((actionId: ActionId) => {
    void (async () => {
      setDisambiguationOptions([]);
      const intentRouter = await loadIntentRouterRuntime();
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
        inputModality: 'voice',
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

  return {
    cancelPending,
    selectDisambiguation,
    dismissDisambiguation,
    switchMode,
  };
}
