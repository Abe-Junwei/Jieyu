/**
 * Optional DEV-style tracing for send-turn pipeline phases (localStorage-gated).
 */

const DEBUG_LS_KEY = 'jieyu_debug_ai_send_turn';

export function isSendTurnCorrelationDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(DEBUG_LS_KEY) === '1';
  } catch {
    return false;
  }
}

export function logSendTurnPhase(
  correlationId: string,
  phase: string,
  detail?: Record<string, unknown>,
): void {
  if (!isSendTurnCorrelationDebugEnabled()) return;
  // eslint-disable-next-line no-console -- intentional gated debug trace
  console.info('[jieyu][ai-chat:send-turn]', { correlationId, phase, detail });
}
