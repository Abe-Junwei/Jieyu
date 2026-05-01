/**
 * 用户确认或免确认直跑后的语音动作副产物（Earcon + 会话标记 + 行为记录），ADR-0028 与多入口共用。
 */

import * as Earcon from './EarconService';
import { globalContext } from './GlobalContextService';
import { userBehaviorStore } from './UserBehaviorStore';
import type { ActionId } from './IntentRouter';

export function applyVoiceConfirmedPendingTelemetry(input: {
  actionId: ActionId;
  sessionId: string;
  inputModality: 'voice' | 'text';
}): void {
  Earcon.playSuccess();
  globalContext.markSessionStart();
  userBehaviorStore.recordAction({
    actionId: input.actionId,
    durationMs: 0,
    sessionId: input.sessionId,
    inputModality: input.inputModality,
  });
}
