/**
 * 转写页非语音输入（键盘快捷键、工具栏点击等）→ UserBehaviorStore 打点（inputModality: text）。
 * 勿在语音 `executeAction` 路径调用：语音侧已在 useVoiceAgent* / VoiceAgentService 中单独记 voice。
 */

import { isActionId, type ActionId } from './IntentRouter';
import { userBehaviorStore } from './UserBehaviorStore';

/** 与语音 sessionId 区分，便于按来源聚合 | Distinct from voice session ids for cohorting */
export const TRANSCRIPTION_TEXT_INPUT_BEHAVIOR_SESSION_ID = 'transcription:text-input';

export function recordTranscriptionKeyboardAction(actionId: string): void {
  if (!isActionId(actionId)) return;
  userBehaviorStore.recordAction({
    actionId: actionId as ActionId,
    durationMs: 0,
    sessionId: TRANSCRIPTION_TEXT_INPUT_BEHAVIOR_SESSION_ID,
    inputModality: 'text',
  });
}
