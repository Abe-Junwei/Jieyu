import { toBcp47 } from '../utils/langMapping';
import type { ActionId, VoiceSession } from './IntentRouter';
import * as Earcon from './EarconService';
import { globalContext } from './GlobalContextService';
import { applyVoiceConfirmedPendingTelemetry } from './voiceConfirmedPendingTelemetry';
import type { VoiceInputService as VoiceInputServiceType } from './VoiceInputService';
import type { SttEngine } from './VoiceInputService.types';

export function switchVoiceAgentEngineControl(input: {
  newEngine: SttEngine;
  listening: boolean;
  voiceService: VoiceInputServiceType | null;
  whisperServerUrl: string;
  whisperServerModel: string;
  setEngine: (engine: SttEngine) => void;
  resetEngineSwitchCounter: () => void;
}): void {
  input.resetEngineSwitchCounter();
  input.setEngine(input.newEngine);
  globalContext.updatePreference('preferredEngine', input.newEngine);
  if (!input.listening) return;
  if (input.newEngine === 'whisper-local') {
    input.voiceService?.switchEngine(input.newEngine, {
      whisperServerUrl: input.whisperServerUrl,
      whisperServerModel: input.whisperServerModel,
    });
    return;
  }
  input.voiceService?.switchEngine(input.newEngine);
}

export function applyVoiceAgentLangOverrideControl(input: {
  lang: string | null;
  voiceService: VoiceInputServiceType | null;
  setLangOverride: (lang: string | null) => void;
  emitStateChange: () => void;
}): void {
  input.setLangOverride(input.lang);
  if (input.voiceService && input.lang) {
    const bcp47 = input.lang === '__auto__' ? '' : (toBcp47(input.lang) ?? input.lang);
    input.voiceService.setLang(bcp47);
  }
  input.emitStateChange();
}

export function confirmVoiceAgentPendingAction(input: {
  pendingConfirm: {
    actionId: ActionId;
    label: string;
    fromFuzzy?: boolean;
    params?: { segmentIndex?: number };
  } | null;
  session: VoiceSession;
  setPendingExecutionState: () => void;
  onExecuteAction?: (actionId: ActionId, params?: { segmentIndex?: number }) => void;
  setIdleState: () => void;
}): void {
  if (!input.pendingConfirm) return;
  const { actionId, params } = input.pendingConfirm;
  input.setPendingExecutionState();
  input.onExecuteAction?.(actionId, params);
  applyVoiceConfirmedPendingTelemetry({
    actionId,
    sessionId: input.session.id,
    inputModality: 'voice',
  });
  input.setIdleState();
}

export function cancelVoiceAgentPendingAction(input: { clearPendingConfirm: () => void }): void {
  input.clearPendingConfirm();
  Earcon.playTick();
}
