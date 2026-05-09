import type { AiSessionMemory, LocalUnitScope } from './chatDomain.types';
import type { LocalContextToolCall } from './localContextTools';
import type { ResolveLocalToolCallsOutput } from './localToolSlotTypes';
import { isGapCountIntentText, shouldReusePreviousMetric } from './resolvers/intentDetection';
import {
  normalizeLimit,
  normalizeScopeArg,
  resolvePreferredScope,
  resolveSearchCall,
  resolveDetailCall,
  resolveProjectStatsCall,
  resolveDiagnoseQualityCall,
  resolveBatchApplyCall,
  shouldUpgradeSelectionToProjectStats,
} from './resolvers/toolRouting';

export type {
  ResolveLocalToolCallsOutput,
  LocalToolRoutingPlan,
  LocalToolClarificationNeed,
} from './localToolSlotTypes';
export { resolveLocalToolRoutingPlan } from './resolvers/toolRouting';
export { detectLocalToolClarificationNeed } from './resolvers/clarification';
export { buildLocalToolStatePatchFromCallResult } from './resolvers/statePatch';

export function resolveLocalToolCalls(
  calls: LocalContextToolCall[],
  userText: string,
  memory: AiSessionMemory,
  scopeHint?: LocalUnitScope,
): ResolveLocalToolCallsOutput {
  const resolved = calls.map((call) => {
    switch (call.name) {
      case 'search_units':
        return resolveSearchCall(call, userText, memory, scopeHint);
      case 'get_unit_detail':
      case 'get_unit_linguistic_memory':
        return resolveDetailCall(call, userText, memory, scopeHint);
      case 'list_units': {
        const scope = resolvePreferredScope(call, userText, memory, scopeHint);
        return {
          ...call,
          arguments: {
            ...call.arguments,
            limit: normalizeLimit(call.arguments.limit),
            scope,
          },
        };
      }
      case 'get_speaker_breakdown': {
        const scope = resolvePreferredScope(call, userText, memory, scopeHint);
        return {
          ...call,
          arguments: {
            ...call.arguments,
            scope,
          },
        };
      }
      case 'list_notes_detail': {
        const scope = resolvePreferredScope(call, userText, memory, scopeHint);
        return {
          ...call,
          arguments: {
            ...call.arguments,
            scope,
            limit: (() => {
              const raw = call.arguments.limit;
              if (typeof raw === 'number' && Number.isFinite(raw)) {
                return Math.min(50, Math.max(1, Math.floor(raw)));
              }
              if (typeof raw === 'string' && raw.trim().length > 0) {
                const parsed = Number(raw);
                if (Number.isFinite(parsed)) {
                  return Math.min(50, Math.max(1, Math.floor(parsed)));
                }
              }
              return 20;
            })(),
          },
        };
      }
      case 'get_project_stats':
        if (
          isGapCountIntentText(userText) ||
          (shouldReusePreviousMetric(userText) &&
            memory.localToolState?.lastFrame?.metricCategory === 'gap')
        ) {
          return resolveDiagnoseQualityCall(
            {
              name: 'diagnose_quality',
              arguments: {
                ...call.arguments,
                scope: normalizeScopeArg(call.arguments.scope) ?? 'current_track',
              },
            },
            userText,
            memory,
            scopeHint,
          );
        }
        return resolveProjectStatsCall(call, userText, memory, scopeHint);
      case 'diagnose_quality':
        return resolveDiagnoseQualityCall(call, userText, memory, scopeHint);
      case 'batch_apply':
        return resolveBatchApplyCall(call, userText, memory);
      case 'get_current_selection':
        if (
          isGapCountIntentText(userText) ||
          (shouldReusePreviousMetric(userText) &&
            memory.localToolState?.lastFrame?.metricCategory === 'gap')
        ) {
          return resolveDiagnoseQualityCall(
            {
              name: 'diagnose_quality',
              arguments: {
                ...call.arguments,
                scope: normalizeScopeArg(call.arguments.scope) ?? 'current_track',
              },
            },
            userText,
            memory,
            scopeHint ?? 'current_track',
          );
        }
        if (shouldUpgradeSelectionToProjectStats(userText)) {
          return resolveProjectStatsCall(
            {
              name: 'get_project_stats',
              arguments: {
                ...call.arguments,
                scope: normalizeScopeArg(call.arguments.scope) ?? 'current_track',
              },
            },
            userText,
            memory,
            scopeHint ?? 'current_track',
          );
        }
        return call;
      default:
        return call;
    }
  });
  return { calls: resolved };
}
