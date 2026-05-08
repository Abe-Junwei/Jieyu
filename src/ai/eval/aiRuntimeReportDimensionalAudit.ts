/**
 * PR-P3: Dimensional audit data collectors for AiRuntimeReport.
 * Reads various audit log types from Dexie and aggregates them.
 */

import { getDb } from '../../db';

export interface ReflectionFailedCheckRecord {
  workflowId: string;
  checkName: string;
  requestId: string;
  timestamp: string;
}

export interface ToolDecisionRecord {
  requestId: string;
  decision: string;
  reasonCode?: string;
  toolName: string;
  timestamp: string;
}

function workflowIdFromReflectionField(field: string): string {
  switch (field) {
    case 'ai_segment_qa_reflection':
      return 'segment_qa';
    case 'ai_annotation_qa_reflection':
      return 'annotation_qa';
    case 'ai_lexeme_candidates_reflection':
      return 'lexeme_candidates';
    case 'ai_elan_flex_compatibility_reflection':
      return 'elan_flex_compatibility';
    default:
      return 'unknown';
  }
}

function normalizeToolDecision(value: unknown): 'denied' | 'confirm_required' | null {
  if (typeof value !== 'string') return null;
  if (value === 'denied' || value === 'blocked' || value === 'policy_blocked') return 'denied';
  if (value === 'confirm_required' || value === 'pending' || value === 'policy_pending') return 'confirm_required';
  return null;
}

/**
 * Collect reflection failed checks from ai_segment_qa_reflection / ai_annotation_qa_reflection / ai_lexeme_candidates_reflection audit logs.
 */
export async function collectReflectionFailedChecks(): Promise<ReflectionFailedCheckRecord[]> {
  try {
    const db = await getDb();
    const rows = await db.collections.audit_logs.findByIndex('collection', 'ai_messages' as string);
    const reflectionFields = new Set([
      'ai_segment_qa_reflection',
      'ai_annotation_qa_reflection',
      'ai_lexeme_candidates_reflection',
      'ai_elan_flex_compatibility_reflection',
    ]);
    const result: ReflectionFailedCheckRecord[] = [];
    for (const row of rows) {
      if (typeof row.field !== 'string' || !reflectionFields.has(row.field)) continue;
      if (typeof row.metadataJson !== 'string') continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(row.metadataJson);
      } catch {
        continue;
      }
      if (!parsed || typeof parsed !== 'object') continue;
      const p = parsed as Record<string, unknown>;
      if (p.reflectionFlagged !== true) continue;
      const workflowId = typeof p.workflowId === 'string' ? p.workflowId : workflowIdFromReflectionField(row.field);
      const requestId = typeof row.requestId === 'string' ? row.requestId : 'unknown';
      const checks = p.checks;
      if (!Array.isArray(checks)) {
        const failedCheckNames = p.failedCheckNames;
        if (!Array.isArray(failedCheckNames)) continue;
        for (const checkName of failedCheckNames) {
          if (typeof checkName !== 'string' || checkName.trim().length === 0) continue;
          result.push({
            workflowId,
            checkName,
            requestId,
            timestamp: row.timestamp,
          });
        }
        continue;
      }
      for (const check of checks) {
        if (check && typeof check === 'object' && check.passed === false && typeof check.name === 'string') {
          result.push({
            workflowId,
            checkName: check.name,
            requestId,
            timestamp: row.timestamp,
          });
        }
      }
    }
    return result;
  } catch {
    return [];
  }
}

/**
 * Collect tool decision records (denied / confirm required) from ai_tool_call_decision audit logs.
 */
export async function collectToolDecisionRecords(): Promise<ToolDecisionRecord[]> {
  try {
    const db = await getDb();
    const rows = await db.collections.audit_logs.findByIndex('collection', 'ai_messages');
    const result: ToolDecisionRecord[] = [];
    for (const row of rows) {
      if (row.field !== 'ai_tool_call_decision') continue;
      if (typeof row.metadataJson !== 'string') continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(row.metadataJson);
      } catch {
        continue;
      }
      if (!parsed || typeof parsed !== 'object') continue;
      const p = parsed as Record<string, unknown>;
      const decision = normalizeToolDecision(p.decision) ?? normalizeToolDecision(p.outcome);
      if (!decision) continue;
      const toolCall = p.toolCall && typeof p.toolCall === 'object'
        ? p.toolCall as Record<string, unknown>
        : null;
      result.push({
        requestId: typeof row.requestId === 'string' ? row.requestId : 'unknown',
        decision,
        ...(typeof p.reasonCode === 'string' ? { reasonCode: p.reasonCode } : {}),
        ...(typeof p.reason === 'string' ? { reasonCode: p.reason } : {}),
        toolName: typeof p.toolName === 'string'
          ? p.toolName
          : (typeof toolCall?.name === 'string' ? toolCall.name : 'unknown'),
        timestamp: row.timestamp,
      });
    }
    return result;
  } catch {
    return [];
  }
}
