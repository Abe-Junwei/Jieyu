/**
 * ADR-0028: `resolveVoiceIntent` 之后的统一编排 — 追加语音回合并调用 `dispatchResolvedVoiceIntent`。
 * Shared tail for VoiceAgentService.commandBridge and useVoiceAgentResultHandler.
 */

import type { VoiceSession } from './IntentRouter';
import { appendTurnToVoiceSession, dispatchResolvedVoiceIntent, type DispatchResolvedVoiceIntentInput } from './assistantVoiceIntentDispatch';
import { detectAndRecordMemoryPattern } from './voiceMemoryPattern';

export type VoiceSttResolutionTailInput = Omit<DispatchResolvedVoiceIntentInput, 'sessionId'> & {
  baseSession: VoiceSession;
  /** e.g. lastIntent + agentState (+ hook-only disambiguation UI) */
  afterIntentResolved: () => void;
  /** React: setSession(next)；Service：仅 emit / 无状态脉冲（会话由调用方在 await 后写回） */
  commitAppendedSession: (nextSession: VoiceSession) => void;
};

export type VoiceSttAfterResolutionInput = VoiceSttResolutionTailInput & {
  /** ISO 639-3 corpus language for memory-pattern detection（与 Hook / commandBridge 对齐） */
  corpusLang: string;
};

/**
 * 意图解析完成后：记忆模式扫描 + 回合追加 + `dispatchResolvedVoiceIntent`。
 * Single entry after `resolveVoiceIntent` for Hook path and VoiceAgentService.commandBridge.
 */
export async function runVoiceFinalSttAfterIntentResolution(
  input: VoiceSttAfterResolutionInput,
): Promise<{ session: VoiceSession }> {
  detectAndRecordMemoryPattern(input.sttResult.text, input.corpusLang);
  return runVoiceFinalSttResolutionTail(input);
}

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
