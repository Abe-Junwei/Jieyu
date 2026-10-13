/**
 * R1：语音动作写入与聊天相同的工具决策审计（同一 requestId 规则，auditReplay 可读回）。
 * Voice actions write the same tool-decision audit rows as chat (same requestId rule).
 */
import { getDb } from '../db';
import { buildAiToolRequestId } from '../ai/toolRequestId';
import { newAuditLogId, nowIso } from '../hooks/ai/useAiChat.helpers';
import type { ActionId } from './IntentRouter';

export type VoiceActionDecision = 'auto_confirmed' | 'pending' | 'confirmed' | 'timeout_discarded';

/** toolName 用点号，避免与 `decision:tool:reason` 的冒号分隔冲突 | dot-separated tool name */
export const voiceToolName = (actionId: ActionId) => `voice.${actionId}`;

export function voiceActionRequestId(actionId: ActionId, params?: Record<string, unknown>): string {
  return buildAiToolRequestId({ name: voiceToolName(actionId), arguments: params ?? {} });
}

export async function writeVoiceActionAudit(input: {
  sessionId: string;
  actionId: ActionId;
  decision: VoiceActionDecision;
  params?: Record<string, unknown>;
}): Promise<string> {
  const requestId = voiceActionRequestId(input.actionId, input.params);
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
