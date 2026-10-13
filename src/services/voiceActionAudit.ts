/**
 * R1：语音动作写入与聊天相同的工具决策审计（同一 requestId 规则，auditReplay 可读回）。
 * Voice actions write the same tool-decision audit rows as chat (same requestId rule).
 */
import { getDb } from '../db';
import { buildAiToolRequestId } from '../ai/toolRequestId';
import { newAuditLogId, nowIso } from '../hooks/ai/useAiChat.helpers';
import type { ActionId } from './IntentRouter';

export type VoiceActionDecision =
  | 'auto_confirmed'
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'timeout_discarded';

/** toolName 用点号，避免与 `decision:tool:reason` 的冒号分隔冲突 | dot-separated tool name */
export const voiceToolName = (actionId: ActionId) => `voice.${actionId}`;

/** 混入 session + turn，避免同会话/跨会话同参数动作撞同一 requestId | mix session+turn so repeats don't collide */
export function voiceActionRequestId(
  actionId: ActionId,
  params?: Record<string, unknown>,
  sessionId?: string,
  turnIndex?: number,
): string {
  return buildAiToolRequestId({
    name: voiceToolName(actionId),
    arguments: { ...(params ?? {}), __voiceSession: sessionId ?? '', __voiceTurn: turnIndex ?? 0 },
  });
}

export async function writeVoiceActionAudit(input: {
  sessionId: string;
  actionId: ActionId;
  decision: VoiceActionDecision;
  params?: Record<string, unknown>;
  turnIndex?: number;
  /** confirm/reject 复用 pending 行的 requestId | confirm/reject reuse the pending row's requestId */
  requestId?: string;
}): Promise<string> {
  const requestId =
    input.requestId ??
    voiceActionRequestId(input.actionId, input.params, input.sessionId, input.turnIndex);
  const toolName = voiceToolName(input.actionId);
  const db = await getDb();
  await db.collections.audit_logs.insert({
    id: newAuditLogId(),
    collection: 'ai_messages',
    documentId: `voice_${input.sessionId}`,
    action: 'update',
    field: 'ai_tool_call_decision',
    oldValue: `voice:${toolName}`,
    newValue: `${input.decision}:${toolName}`,
    source: 'ai',
    timestamp: nowIso(),
    requestId,
  });
  return requestId;
}
