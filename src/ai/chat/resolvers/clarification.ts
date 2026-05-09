/**
 * clarification — Clarification need detection for local tool calls
 * Extracted from localToolSlotResolver.ts
 */

import type { AiSessionMemory } from '../chatDomain.types';
import { isFollowUpIntentText } from '../intentContracts';
import type { LocalContextToolCall } from '../localContextTools';
import type { LocalToolClarificationNeed } from '../localToolSlotTypes';
import {
  inferScopeFromUserText,
  inferMetricFromUserText,
  inferGapMetricFromUserText,
  inferSearchQueryFromUserText,
  isCountIntentText,
} from './intentDetection';
import {
  normalizeScopeArg,
  normalizeMetricArg,
  normalizeGapMetricArg,
  normalizeText,
  normalizeBatchApplyUnitIds,
  normalizeUnitOrdinal,
} from './toolRouting';

export function needsMetricClarification(
  call: LocalContextToolCall,
  userText: string,
  memory: AiSessionMemory,
): boolean {
  if (!isCountIntentText(userText)) return false;
  const userTextMetric = inferMetricFromUserText(userText) ?? inferGapMetricFromUserText(userText);
  const callMetric =
    normalizeMetricArg(call.arguments.metric) ?? normalizeGapMetricArg(call.arguments.metric);
  const reusableMetric =
    memory.localToolState?.lastFrame?.questionKind === 'count'
      ? memory.localToolState.lastFrame.metric
      : undefined;
  if (userTextMetric !== undefined) return false;
  if (reusableMetric !== undefined) return false;
  if (callMetric === undefined) return true;
  return callMetric === 'unit_count';
}

export function needsScopeClarification(
  call: LocalContextToolCall,
  userText: string,
  memory: AiSessionMemory,
): boolean {
  if (call.name !== 'get_project_stats' && call.name !== 'diagnose_quality') return false;
  const explicitScope = normalizeScopeArg(call.arguments.scope);
  const scopeAutofilled = call.arguments._scopeAutofilled === true;
  if (explicitScope && !scopeAutofilled) return false;
  const metric =
    normalizeMetricArg(call.arguments.metric) ??
    normalizeGapMetricArg(call.arguments.metric) ??
    inferMetricFromUserText(userText) ??
    inferGapMetricFromUserText(userText);
  if (metric === undefined) return false;
  if (inferScopeFromUserText(userText)) return false;
  if (memory.localToolState?.lastFrame?.scope || memory.localToolState?.lastScope) return false;
  return scopeAutofilled || explicitScope === undefined;
}

export function needsQueryClarification(
  call: LocalContextToolCall,
  userText: string,
  memory: AiSessionMemory,
): boolean {
  if (call.name !== 'search_units') return false;
  const query = normalizeText(call.arguments.query);
  if (query.length > 0) return false;
  const inferred = inferSearchQueryFromUserText(userText);
  if (inferred.length > 0) return false;
  const lastQuery = normalizeText(memory.localToolState?.lastQuery);
  return !isFollowUpIntentText(userText) || lastQuery.length === 0;
}

export function needsTargetClarification(
  call: LocalContextToolCall,
  userText: string,
  memory: AiSessionMemory,
): boolean {
  if (call.name === 'batch_apply') {
    const unitIds = normalizeBatchApplyUnitIds(call.arguments.unitIds);
    if (unitIds.length > 0) return false;
    return true;
  }
  if (call.name !== 'get_unit_detail' && call.name !== 'get_unit_linguistic_memory') return false;
  const unitId = normalizeText(call.arguments.unitId);
  if (unitId.length > 0) return false;
  const ids = memory.localToolState?.lastResultUnitIds ?? [];
  if (ids.length === 1) return false;
  const ordinal = normalizeUnitOrdinal(userText);
  if (ordinal && ids[ordinal - 1]) return false;
  return true;
}

export function needsActionClarification(call: LocalContextToolCall): boolean {
  if (call.name !== 'batch_apply') return false;
  const action = normalizeText(call.arguments.action);
  return action.length === 0;
}

export function detectLocalToolClarificationNeed(
  calls: LocalContextToolCall[],
  userText: string,
  memory: AiSessionMemory,
): LocalToolClarificationNeed {
  for (const call of calls) {
    if (needsActionClarification(call)) {
      return { needed: true, reason: 'action_ambiguous', callName: call.name };
    }
    if (
      (call.name === 'get_project_stats' || call.name === 'diagnose_quality') &&
      needsMetricClarification(call, userText, memory)
    ) {
      return { needed: true, reason: 'metric_ambiguous', callName: call.name };
    }
    if (needsScopeClarification(call, userText, memory)) {
      return { needed: true, reason: 'scope_ambiguous', callName: call.name };
    }
    if (needsQueryClarification(call, userText, memory)) {
      return { needed: true, reason: 'query_ambiguous', callName: call.name };
    }
    if (needsTargetClarification(call, userText, memory)) {
      return { needed: true, reason: 'target_ambiguous', callName: call.name };
    }
  }
  return { needed: false };
}
