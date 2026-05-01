/**
 * useVoiceAgentModeController — 语音智能体模式切换与消歧控制
 * Voice agent mode switching and disambiguation interaction controller
 */

import { useCallback } from 'react';
import type { ActionId, ActionIntent } from '../services/IntentRouter';
import { getActionLabel } from '../services/voiceIntentUi';
import * as Earcon from '../services/EarconService';
import { applyVoiceConfirmedPendingTelemetry } from '../services/voiceConfirmedPendingTelemetry';
import type { VoiceAgentMode, VoiceAgentState } from './useVoiceAgent';
import type { loadIntentRouterRuntime as LoadIntentRouterRuntimeFn } from './useVoiceAgent.runtime';
import type { Locale } from '../i18n';

export interface UseVoiceAgentModeControllerParams {
  locale: Locale;
  listening: boolean;
  dictationPipeline: unknown | undefined;
  safeModeRef: React.RefObject<boolean>;
  sessionRef: React.RefObject<{ id: string }>;
  executeActionRef: React.RefObject<(actionId: ActionId, params?: { segmentIndex?: number }) => void>;
  loadIntentRouterRuntime: typeof LoadIntentRouterRuntimeFn;
  clearInteractionPrompts: () => void;
  startDictationPipeline: () => void;
  stopDictationPipeline: () => void;
  setMode: (mode: VoiceAgentMode) => void;
  setInterimText: (text: string) => void;
  setAgentState: (state: VoiceAgentState['agentState']) => void;
  setDisambiguationOptions: (options: ActionIntent[]) => void;
  setPendingConfirm: (confirm: {
    actionId: ActionId;
    label: string;
    fromFuzzy?: boolean;
    params?: { segmentIndex?: number };
  } | null) => void;
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

  const selectDisambiguation = useCallback((chosen: ActionIntent) => {
    void (async () => {
      setDisambiguationOptions([]);
      const intentRouter = await loadIntentRouterRuntime();
      const needsConfirm = intentRouter.shouldConfirmFuzzyAction(chosen.actionId)
        || (safeModeRef.current && intentRouter.isDestructiveAction(chosen.actionId));
      if (needsConfirm) {
        setPendingConfirm({
          actionId: chosen.actionId,
          label: getActionLabel(chosen.actionId, locale),
          fromFuzzy: true,
          ...(chosen.params !== undefined ? { params: chosen.params } : {}),
        });
        Earcon.playTick();
        setAgentState('idle');
        return;
      }

      setPendingConfirm(null);
      executeActionRef.current(chosen.actionId, chosen.params);
      applyVoiceConfirmedPendingTelemetry({
        actionId: chosen.actionId,
        sessionId: sessionRef.current.id,
        inputModality: 'voice',
      });
      setAgentState('idle');
    })();
  }, [executeActionRef, loadIntentRouterRuntime, locale, safeModeRef, sessionRef, setAgentState, setDisambiguationOptions, setPendingConfirm]);

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
