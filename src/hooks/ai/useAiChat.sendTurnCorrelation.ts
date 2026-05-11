/**
 * Optional DEV-style tracing for send-turn pipeline phases (localStorage-gated).
 */

import { createLogger } from '../../observability/logger';

const DEBUG_LS_KEY = 'jieyu_debug_ai_send_turn';
const log = createLogger('useAiChat.sendTurnCorrelation');

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
  log.info('send-turn phase', { correlationId, phase, detail });
}
