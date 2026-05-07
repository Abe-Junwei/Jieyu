/**
 * MCP tools/call 持久化审计 — 独立表 `mcp_tool_call_audits`（Dexie v48）。
 * 写入失败不阻断 MCP 响应（best-effort）。
 */
import { createLogger } from '../../../observability/logger';
import { getDb } from '../../../db';
import type { McpToolCallAuditDoc, McpToolCallAuditOutcome } from '../../../db/types';
import type { McpServerRuntimeContext, McpToolCallResult } from './types';

const log = createLogger('mcp.toolCallAudit');

const MAX_TOOL_RESULT_JSON_CHARS = 1_000_000;

function stableJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '"<unserializable>"';
  }
}

function truncateJson(s: string, maxChars: number): string {
  if (s.length <= maxChars) {
    return s;
  }
  return `${s.slice(0, maxChars)}\n…<truncated ${s.length - maxChars} chars>`;
}

function newAuditId(): string {
  return `mcp_aud_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export interface PersistMcpToolCallAuditInput {
  jsonRpcId: string | number | null;
  toolName: string;
  arguments: Record<string, unknown>;
  runtimeContext: McpServerRuntimeContext;
  startedAtMs: number;
  outcome: McpToolCallAuditOutcome;
  toolResult?: McpToolCallResult;
  error?: { code?: number; message?: string; data?: unknown };
}

export async function persistMcpToolCallAudit(input: PersistMcpToolCallAuditInput): Promise<void> {
  const durationMs = Math.max(0, Date.now() - input.startedAtMs);
  const doc: McpToolCallAuditDoc = {
    id: newAuditId(),
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    jsonRpcId: input.jsonRpcId,
    toolName: input.toolName,
    argumentsJson: stableJson(input.arguments),
    runtimeContextJson: stableJson(input.runtimeContext),
    outcome: input.outcome,
    durationMs,
  };
  if (input.toolResult !== undefined) {
    doc.toolResultJson = truncateJson(stableJson(input.toolResult), MAX_TOOL_RESULT_JSON_CHARS);
  }
  if (input.error?.code !== undefined) {
    doc.errorCode = input.error.code;
  }
  if (input.error?.message !== undefined) {
    doc.errorMessage = input.error.message;
  }
  if (input.error?.data !== undefined) {
    doc.errorDataJson = truncateJson(stableJson(input.error.data), 200_000);
  }
  try {
    const db = await getDb();
    await db.collections.mcp_tool_call_audits.insert(doc);
  } catch (err) {
    log.warn('mcp_tool_call_audits insert failed', {
      toolName: input.toolName,
      outcome: input.outcome,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
