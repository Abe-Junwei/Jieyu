/**
 * useAiChat.toolAudit — 工具调用审计日志与幂等性检查
 * Tool call audit logging and idempotency checks
 */

import { useCallback, useRef } from 'react';
import { getDb } from '../db';
import { newAuditLogId, nowIso } from './useAiChat.helpers';
import { buildAiToolRequestId } from '../ai/toolRequestId';
import type { AiChatToolCall, AiChatToolName } from './useAiChat.types';
import type { ToolIntentAuditMetadata, ToolDecisionAuditMetadata } from '../ai/chat/toolCallHelpers';

// ── 幂等性指纹 | Idempotency fingerprint ────────────────────────────────────

/** 生成幂等性指纹（按 assistant 消息作用域）| Generate idempotency fingerprint scoped to assistant message */
export function genRequestId(call: AiChatToolCall, scopeMessageId?: string): string {
  const base = buildAiToolRequestId(call);
  if (!scopeMessageId) return base;
  return `${base}_${scopeMessageId}`;
}

// ── Hook | Hook ─────────────────────────────────────────────────────────────

interface ToolIntentAssessment {
  decision: 'execute' | 'clarify' | 'ignore' | 'cancel';
  score: number;
  hasExecutionCue: boolean;
  hasActionVerb: boolean;
  hasActionTarget: boolean;
  hasExplicitId: boolean;
  hasMetaQuestion: boolean;
  hasTechnicalDiscussion: boolean;
}

export function useAiChatToolAudit() {
  // 幂等性工具调用去重集 | Idempotency deduplication set
  const executedRequestIds = useRef<Set<string>>(new Set());

  const markExecutedRequestId = useCallback((requestId: string) => {
    executedRequestIds.current.add(requestId);
  }, []);

  /**
   * 写入工具决策审计日志，自动补充 requestId | Write tool decision audit log with requestId
   */
  const writeToolDecisionAuditLog = useCallback(async (
    assistantMessageId: string,
    oldValue: string,
    newValue: string,
    source: 'human' | 'ai' | 'system',
    requestId?: string,
    metadata?: ToolDecisionAuditMetadata,
  ) => {
    const db = await getDb();
    await db.collections.audit_logs.insert({
      id: newAuditLogId(),
      collection: 'ai_messages',
      documentId: assistantMessageId,
      action: 'update',
      field: 'ai_tool_call_decision',
      oldValue,
      newValue,
      source,
      timestamp: nowIso(),
      ...(requestId ? { requestId } : {}),
      ...(metadata ? { metadataJson: JSON.stringify(metadata) } : {}),
    });
  }, []);

  const writeToolIntentAuditLog = useCallback(async (
    assistantMessageId: string,
    callName: AiChatToolName,
    assessment: ToolIntentAssessment,
    requestId?: string,
    metadata?: ToolIntentAuditMetadata,
  ) => {
    const db = await getDb();
    await db.collections.audit_logs.insert({
      id: newAuditLogId(),
      collection: 'ai_messages',
      documentId: assistantMessageId,
      action: 'update',
      field: 'ai_tool_call_intent',
      oldValue: callName,
      newValue: JSON.stringify(assessment),
      source: 'ai',
      timestamp: nowIso(),
      ...(requestId ? { requestId } : {}),
      ...(metadata ? { metadataJson: JSON.stringify(metadata) } : {}),
    });
  }, []);

  const hasPersistedExecutionForRequest = useCallback(async (requestId: string): Promise<boolean> => {
    if (executedRequestIds.current.has(requestId)) return true;

    const db = await getDb();
    const rows = await db.dexie.audit_logs
      .where('[collection+field+requestId]')
      .equals(['ai_messages', 'ai_tool_call_decision', requestId])
      .toArray();

    const hasExecuted = rows.some((row) => {
      if (typeof row.metadataJson === 'string' && row.metadataJson.trim().length > 0) {
        try {
          const parsed = JSON.parse(row.metadataJson) as { phase?: unknown; executed?: unknown };
          if (parsed.phase === 'decision') {
            return parsed.executed === true;
          }
        } catch (err) {
          console.error('[Jieyu] useAiChat: failed to parse tool decision metadata, falling back to compact parsing', err);
        }
      }

      const parts = String(row.newValue ?? '').split(':');
      const decision = parts[0] ?? '';
      const reason = parts[2] ?? '';
      if (decision === 'confirmed' || decision === 'auto_confirmed') return true;
      if ((decision === 'confirm_failed' || decision === 'auto_failed')
        && reason !== 'invalid_args'
        && reason !== 'no_executor'
        && reason !== 'duplicate_requestId') {
        return true;
      }
      return false;
    });

    if (hasExecuted) {
      executedRequestIds.current.add(requestId);
    }
    return hasExecuted;
  }, []);

  return {
    executedRequestIds,
    markExecutedRequestId,
    writeToolDecisionAuditLog,
    writeToolIntentAuditLog,
    hasPersistedExecutionForRequest,
  };
}
