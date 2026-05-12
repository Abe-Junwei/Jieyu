/**
 * statePatch — Semantic frame builder and local tool state patch generator
 * Extracted from localToolSlotResolver.ts
 */

import type { AiSessionMemoryLocalSemanticFrame, LocalUnitScope } from '../chatDomain.types';
import { inferIntentFromToolName } from '../intentContracts';
import type { LocalContextToolCall } from '../localContextTools';
import type { LocalToolStatePatch } from '../localToolSlotTypes';
import {
  normalizeText,
  normalizeScopeArg,
  normalizeMetricArg,
  normalizeGapMetricArg,
  isGapMetric,
} from './toolRouting';

function buildSemanticFrameFromCall(
  call: LocalContextToolCall,
  scope: LocalUnitScope | undefined,
): AiSessionMemoryLocalSemanticFrame | undefined {
  const updatedAt = new Date().toISOString();
  switch (call.name) {
    case 'list_units':
      return {
        domain: 'units',
        questionKind: 'list',
        ...(scope ? { scope } : {}),
        source: 'tool',
        updatedAt,
      };
    case 'search_units':
      return {
        domain: 'units',
        questionKind: 'search',
        ...(scope ? { scope } : {}),
        source: 'tool',
        updatedAt,
      };
    case 'get_unit_detail':
    case 'get_unit_linguistic_memory':
      return {
        domain: 'units',
        questionKind: 'detail',
        ...(scope ? { scope } : {}),
        source: 'tool',
        updatedAt,
      };
    case 'get_project_stats': {
      const metric = normalizeMetricArg(call.arguments.metric);
      return {
        domain: 'project_stats',
        questionKind: 'count',
        ...(metric ? { metric } : {}),
        ...(metric ? { metricCategory: isGapMetric(metric) ? 'gap' : 'total' } : {}),
        ...(scope ? { scope } : {}),
        ...(metric && isGapMetric(metric) ? { isQualityGapQuestion: true } : {}),
        source: 'tool',
        updatedAt,
      };
    }
    case 'diagnose_quality': {
      const metric = normalizeGapMetricArg(call.arguments.metric);
      return {
        domain: 'project_stats',
        questionKind: 'count',
        ...(metric ? { metric } : {}),
        metricCategory: 'gap',
        ...(scope ? { scope } : {}),
        isQualityGapQuestion: true,
        source: 'tool',
        updatedAt,
      };
    }
    default:
      return undefined;
  }
}

function asResultUnitIds(result: unknown): string[] {
  if (!result || typeof result !== 'object') return [];
  const matches = (result as { matches?: unknown[] }).matches;
  if (!Array.isArray(matches)) return [];
  return matches
    .map((item) => (item && typeof item === 'object' ? (item as { id?: unknown }).id : undefined))
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
}

export function buildLocalToolStatePatchFromCallResult(
  call: LocalContextToolCall,
  result: { ok: boolean; result: unknown },
): LocalToolStatePatch {
  if (!result.ok) {
    return {};
  }
  const intent = inferIntentFromToolName(call.name) ?? undefined;
  const resultIds = asResultUnitIds(result.result);
  const query = call.name === 'search_units' ? normalizeText(call.arguments.query) : '';
  const patch: LocalToolStatePatch = {};
  const scopeFromArgs = normalizeScopeArg(call.arguments.scope);
  const scopeFromResult =
    result.result && typeof result.result === 'object' && !Array.isArray(result.result)
      ? normalizeScopeArg((result.result as Record<string, unknown>).scope)
      : undefined;
  const scope = scopeFromArgs ?? scopeFromResult;
  if (scope) {
    patch.lastScope = scope;
  }
  if (intent) {
    patch.lastIntent = intent;
  }
  if (query.length > 0) {
    patch.lastQuery = query;
  } else if (call.name === 'list_units') {
    patch.clearLastQuery = true;
  }
  if (intent === 'unit.list' || intent === 'unit.search') {
    patch.lastResultUnitIds = resultIds;
  }
  const semanticFrame = buildSemanticFrameFromCall(call, scope);
  if (semanticFrame) {
    patch.lastFrame = semanticFrame;
  }
  return patch;
}
