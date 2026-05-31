/**
 * agentLoopReplanning — Agent loop 闭环重规划（P0）。
 *
 * 在工具结果就绪后评估是否需要 replan / clarify / abort，避免初始 queryFamily 误判
 * 或搜索 0 条时盲目早停。纯函数；runner 在 flag 后接入。
 *
 * Spec: docs/execution/specs/ai-agent-loop-reliability-improvements/ §2.1
 */

import type { LocalContextToolResult } from './localContextToolTypes';
import type { LocalToolMetric } from './chatDomain.types';
import type { LocalToolRoutingPlan } from './localToolSlotTypes';

export type ReplanningDecisionAction = 'continue' | 'replan' | 'abort' | 'clarify';

export type ReplanningMessageKey = 'agentLoopSearchNoResults' | 'agentLoopToolValidationError';

export interface ReplanningDecision {
  action: ReplanningDecisionAction;
  reason: string;
  newPlan?: LocalToolRoutingPlan;
  messageKey?: ReplanningMessageKey;
}

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isKnownMetric(value: unknown): value is LocalToolMetric {
  return (
    value === 'unit_count' ||
    value === 'speaker_count' ||
    value === 'translation_layer_count' ||
    value === 'ai_confidence_avg' ||
    value === 'untranscribed_count' ||
    value === 'missing_speaker_count'
  );
}

function resolveMetricValue(result: LocalContextToolResult): number | undefined {
  if (!result.ok) return undefined;
  const body = asObjectRecord(result.result);
  if (!body) return undefined;
  if (typeof body.value === 'number' && Number.isFinite(body.value)) return body.value;
  const meta = asObjectRecord(body.meta);
  if (meta && typeof meta.value === 'number' && Number.isFinite(meta.value)) return meta.value;
  return undefined;
}

function resolveRequestedMetric(result: LocalContextToolResult): LocalToolMetric | undefined {
  if (!result.ok) return undefined;
  const body = asObjectRecord(result.result);
  if (!body) return undefined;
  const requestedMetric =
    typeof body.requestedMetric === 'string' ? body.requestedMetric : undefined;
  if (isKnownMetric(requestedMetric)) return requestedMetric;
  const meta = asObjectRecord(body.meta);
  const metaRequested =
    meta && typeof meta.requestedMetric === 'string' ? meta.requestedMetric : undefined;
  if (isKnownMetric(metaRequested)) return metaRequested;
  return undefined;
}

function hasMetricAnswer(results: LocalContextToolResult[], metric: LocalToolMetric): boolean {
  return results.some((item) => {
    if (!item.ok || (item.name !== 'diagnose_quality' && item.name !== 'get_project_stats')) {
      return false;
    }
    const value = resolveMetricValue(item);
    if (value === undefined) return false;
    return resolveRequestedMetric(item) === metric;
  });
}

export function isSearchZeroResults(result: LocalContextToolResult): boolean {
  if (!result.ok || result.name !== 'search_units') return false;
  const body = asObjectRecord(result.result);
  if (!body) return false;
  if (typeof body.count === 'number') return body.count === 0;
  if (Array.isArray(body.matches)) return body.matches.length === 0;
  return false;
}

export function isUnitNotFoundError(result: LocalContextToolResult): boolean {
  if (result.ok || result.name !== 'get_unit_detail') return false;
  const err = (result.error ?? '').toLowerCase();
  return err.includes('unit not found');
}

export function isRecoverableValidationError(result: LocalContextToolResult): boolean {
  if (result.ok) return false;
  const err = (result.error ?? '').toLowerCase();
  return err.includes('required') || err.includes('invalid');
}

/**
 * 评估本步工具结果是否需要重规划。顺序与 spec §2.1 规则表一致。
 */
export function evaluateReplanningNeed(
  currentPlan: LocalToolRoutingPlan,
  localToolResults: LocalContextToolResult[] | undefined,
  step: number,
  maxSteps: number,
): ReplanningDecision {
  if (!localToolResults || localToolResults.length === 0) {
    return { action: 'continue', reason: 'no_tool_results' };
  }

  if (step >= maxSteps - 1) {
    return { action: 'continue', reason: 'near_max_steps_no_replan' };
  }

  if (currentPlan.queryFamily === 'search' && localToolResults.some(isSearchZeroResults)) {
    return {
      action: 'clarify',
      reason: 'search_zero_results',
      messageKey: 'agentLoopSearchNoResults',
    };
  }

  if (currentPlan.queryFamily === 'detail' && localToolResults.some(isUnitNotFoundError)) {
    return {
      action: 'replan',
      reason: 'detail_unit_not_found',
      newPlan: {
        ...currentPlan,
        queryFamily: 'search',
        selectedTools: ['search_units'],
      },
    };
  }

  const metric = currentPlan.requestedMetric;
  if (
    (currentPlan.queryFamily === 'count' || currentPlan.queryFamily === 'quality') &&
    metric &&
    !hasMetricAnswer(localToolResults, metric) &&
    localToolResults.every((r) => r.ok)
  ) {
    return {
      action: 'replan',
      reason: 'metric_empty_replan_list',
      newPlan: {
        ...currentPlan,
        queryFamily: 'list',
        selectedTools: ['list_units'],
      },
    };
  }

  const hasUnrecoverableFailure = localToolResults.some(
    (r) => !r.ok && !isRecoverableValidationError(r),
  );
  if (hasUnrecoverableFailure) {
    return { action: 'abort', reason: 'unrecoverable_tool_failure' };
  }

  if (localToolResults.some(isRecoverableValidationError)) {
    return {
      action: 'clarify',
      reason: 'recoverable_validation_error',
      messageKey: 'agentLoopToolValidationError',
    };
  }

  return { action: 'continue', reason: 'tool_results_ok' };
}
