/**
 * agentLoopResultQuality — Agent loop verify 步（Result Quality Gate）的纯校验逻辑。
 *
 * 在 agent loop 续跑前，对本步工具结果做确定性质量评估：标注"空结果 / 搜索无命中 /
 * 工具失败"等情形。这些标注写入 continuation payload，使后续推理不基于空证据收敛或编造。
 * 纯函数、无 React / 无 IO，便于单测；接入点见 formatters/agentLoopPayload.ts（flag 后）。
 *
 * 对应 spec：docs/execution/specs/ai-agent-loop-reliability-improvements/ §2.2 Result Quality Gate (P1)。
 */

import type { LocalContextToolResult, LocalContextToolName } from './localContextToolTypes';

/** 工具结果质量标注 | Quality annotation for a single tool result. */
export type ToolResultQualityAnnotation = 'tool_failed' | 'empty_result' | 'search_no_results';

export interface ToolResultQualityEntry {
  name: LocalContextToolName;
  ok: boolean;
  annotations: ToolResultQualityAnnotation[];
}

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** 结果体是否"空"：空数组 / 空对象 / matches 为空数组 / count===0。 */
function isEmptyResultBody(result: unknown): boolean {
  if (result === null || result === undefined) return true;
  if (Array.isArray(result)) return result.length === 0;
  const body = asObjectRecord(result);
  if (!body) return false;
  if (Object.keys(body).length === 0) return true;
  if (Array.isArray(body.matches) && body.matches.length === 0) return true;
  if (typeof body.count === 'number' && body.count === 0) return true;
  return false;
}

/** search_units 是否 0 命中（count===0 或 matches 空）。 */
function isSearchWithNoResults(result: LocalContextToolResult): boolean {
  if (!result.ok || result.name !== 'search_units') return false;
  const body = asObjectRecord(result.result);
  if (!body) return false;
  if (typeof body.count === 'number') return body.count === 0;
  if (Array.isArray(body.matches)) return body.matches.length === 0;
  return false;
}

/** 评估单条结果，返回其质量标注（可能为空数组）。 */
export function annotateToolResult(result: LocalContextToolResult): ToolResultQualityAnnotation[] {
  const annotations: ToolResultQualityAnnotation[] = [];
  if (!result.ok) {
    annotations.push('tool_failed');
    return annotations;
  }
  if (isSearchWithNoResults(result)) {
    annotations.push('search_no_results');
    return annotations;
  }
  if (isEmptyResultBody(result.result)) {
    annotations.push('empty_result');
  }
  return annotations;
}

/**
 * 评估一组工具结果，仅返回"有标注"的条目（全部正常时返回空数组）。
 * 用于写入 continuation payload 的 `quality` 元字段。
 */
export function assessToolResultQuality(
  results: LocalContextToolResult[] | undefined,
): ToolResultQualityEntry[] {
  if (!results || results.length === 0) return [];
  const entries: ToolResultQualityEntry[] = [];
  for (const result of results) {
    const annotations = annotateToolResult(result);
    if (annotations.length > 0) {
      entries.push({ name: result.name, ok: result.ok, annotations });
    }
  }
  return entries;
}

export type AgentLoopToolFailureMessageKey =
  | 'agentLoopToolRetryableError'
  | 'agentLoopToolValidationError';

export interface AgentLoopToolFailureClassification {
  messageKey: AgentLoopToolFailureMessageKey;
  reason: string;
}

/** 对 loop 退出时的工具失败做可展示分类（spec §2.4）。 */
export function classifyAgentLoopToolFailure(
  results: LocalContextToolResult[] | undefined,
): AgentLoopToolFailureClassification | null {
  if (!results?.length) return null;
  const failed = results.filter((r) => !r.ok);
  if (failed.length === 0) return null;

  for (const item of failed) {
    const err = (item.error ?? '').toLowerCase();
    if (
      err.includes('rate limit') ||
      err.includes('timeout') ||
      err.includes('timed out') ||
      err.includes('unavailable') ||
      err.includes('503') ||
      err.includes('502')
    ) {
      return { messageKey: 'agentLoopToolRetryableError', reason: 'retryable_transport' };
    }
  }

  for (const item of failed) {
    const err = (item.error ?? '').toLowerCase();
    if (err.includes('required') || err.includes('invalid') || err.includes('unit not found')) {
      return { messageKey: 'agentLoopToolValidationError', reason: 'validation_or_not_found' };
    }
  }

  return { messageKey: 'agentLoopToolRetryableError', reason: 'default_retryable' };
}
