/**
 * ADR-0028: `resolveVoiceIntent` 之后的统一编排 — 追加语音回合并调用 `dispatchResolvedVoiceIntent`。
 * Shared tail for VoiceAgentService.commandBridge and useVoiceAgentResultHandler.
 */

import type { VoiceSession } from './IntentRouter';
import { appendTurnToVoiceSession, dispatchResolvedVoiceIntent, type DispatchResolvedVoiceIntentInput } from './assistantVoiceIntentDispatch';

export type VoiceSttResolutionTailInput = Omit<DispatchResolvedVoiceIntentInput, 'sessionId'> & {
  baseSession: VoiceSession;
  /** e.g. lastIntent + agentState (+ hook-only disambiguation UI) */
  afterIntentResolved: () => void;
  /** React: setSession(next)；Service：仅 emit / 无状态脉冲（会话由调用方在 await 后写回） */
  commitAppendedSession: (nextSession: VoiceSession) => void;
};

export async function runVoiceFinalSttResolutionTail(
  input: VoiceSttResolutionTailInput,
): Promise<{ session: VoiceSession }> {
  const {
    baseSession,
    intent,
    sttResult,
    llmFallbackFailed,
    afterIntentResolved,
    commitAppendedSession,
    ...dispatchFields
  } = input;

  afterIntentResolved();
  const nextSession = appendTurnToVoiceSession(baseSession, intent, sttResult);
  commitAppendedSession(nextSession);

  await dispatchResolvedVoiceIntent({
    ...dispatchFields,
    sessionId: nextSession.id,
    intent,
    sttResult,
    llmFallbackFailed,
  });

  return { session: nextSession };
}
