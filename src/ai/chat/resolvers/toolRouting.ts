/**
 * toolRouting — Normalization guards, routing plan, and per-tool call resolution
 * Extracted from localToolSlotResolver.ts
 */

import type { AiSessionMemory, LocalToolMetric, LocalUnitScope } from '../chatDomain.types';
import { isFollowUpIntentText, isUnitListIntentText } from '../intentContracts';
import type { LocalContextToolCall } from '../localContextTools';
import type { LocalToolRoutingPlan } from '../localToolSlotTypes';
import {
  inferScopeFromUserText,
  inferMetricFromUserText,
  inferGapMetricFromUserText,
  isCountIntentText,
  isGapCountIntentText,
  isLayerListIntentText,
  isLayerLinkIntentText,
  isUnsavedDraftIntentText,
  isSpeakerBreakdownIntentText,
  isSpeakerListIntentText,
  isNoteDetailIntentText,
  isNoteListIntentText,
  isVisibleTimelineStateIntentText,
  isLinguisticMemoryIntentText,
  shouldReusePreviousMetric,
  inferBatchApplyActionFromUserText,
  inferSearchQueryFromUserText,
} from './intentDetection';

export function normalizeLimit(value: unknown, fallback = 8): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(20, Math.max(1, Math.floor(value)));
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.min(20, Math.max(1, Math.floor(parsed)));
    }
  }
  return fallback;
}

export function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeScopeArg(value: unknown): LocalUnitScope | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'project' || normalized === 'global' || normalized === 'all') return 'project';
  if (
    normalized === 'current_track' ||
    normalized === 'current-track' ||
    normalized === 'track' ||
    normalized === 'current_audio' ||
    normalized === 'current-audio'
  )
    return 'current_track';
  if (
    normalized === 'current_scope' ||
    normalized === 'current-scope' ||
    normalized === 'scope' ||
    normalized === 'current'
  )
    return 'current_scope';
  return undefined;
}

export function normalizeMetricArg(value: unknown): LocalToolMetric | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'unit_count' ||
    normalized === 'unitcount' ||
    normalized === 'units' ||
    normalized === 'unit'
  )
    return 'unit_count';
  if (
    normalized === 'speaker_count' ||
    normalized === 'speakercount' ||
    normalized === 'speakers' ||
    normalized === 'speaker'
  )
    return 'speaker_count';
  if (
    normalized === 'translation_layer_count' ||
    normalized === 'translationlayercount' ||
    normalized === 'translation_layers' ||
    normalized === 'layers'
  )
    return 'translation_layer_count';
  if (
    normalized === 'ai_confidence_avg' ||
    normalized === 'confidence' ||
    normalized === 'avg_confidence'
  )
    return 'ai_confidence_avg';
  if (
    normalized === 'untranscribed_count' ||
    normalized === 'untranscribed' ||
    normalized === 'unfinished' ||
    normalized === 'remaining'
  )
    return 'untranscribed_count';
  if (
    normalized === 'missing_speaker_count' ||
    normalized === 'missing_speaker' ||
    normalized === 'speaker_missing'
  )
    return 'missing_speaker_count';
  return undefined;
}

export function isGapMetric(metric: LocalToolMetric | undefined): boolean {
  return metric === 'untranscribed_count' || metric === 'missing_speaker_count';
}

export function normalizeGapMetricArg(value: unknown): LocalToolMetric | undefined {
  const metric = normalizeMetricArg(value);
  return isGapMetric(metric) ? metric : undefined;
}

export function resolvePreferredScope(
  call: LocalContextToolCall,
  userText: string,
  memory: AiSessionMemory,
  scopeHint?: LocalUnitScope,
): LocalUnitScope {
  return (
    normalizeScopeArg(call.arguments.scope) ??
    inferScopeFromUserText(userText) ??
    scopeHint ??
    memory.localToolState?.lastScope ??
    'current_scope'
  );
}

export function resolveLocalToolRoutingPlan(
  userText: string,
  memory: AiSessionMemory,
  scopeHint?: LocalUnitScope,
): LocalToolRoutingPlan {
  const inferredScope =
    inferScopeFromUserText(userText) ??
    scopeHint ??
    memory.localToolState?.lastFrame?.scope ??
    memory.localToolState?.lastScope;

  const requestedMetric =
    inferGapMetricFromUserText(userText) ??
    inferMetricFromUserText(userText) ??
    (shouldReusePreviousMetric(userText) ? memory.localToolState?.lastFrame?.metric : undefined);

  if (isUnsavedDraftIntentText(userText)) {
    return {
      queryFamily: 'selection',
      selectedTools: ['get_unsaved_drafts'],
      scope: inferredScope ?? 'current_scope',
    };
  }

  if (isVisibleTimelineStateIntentText(userText)) {
    return {
      queryFamily: 'selection',
      selectedTools: ['get_visible_timeline_state'],
      scope: inferredScope ?? 'current_scope',
    };
  }

  if (isSpeakerBreakdownIntentText(userText)) {
    return {
      queryFamily: 'count',
      selectedTools: ['get_speaker_breakdown'],
      scope: inferredScope ?? 'current_track',
    };
  }

  if (isSpeakerListIntentText(userText)) {
    return {
      queryFamily: 'list',
      selectedTools: ['list_speakers'],
      scope: inferredScope ?? 'current_scope',
    };
  }

  if (isNoteDetailIntentText(userText)) {
    return {
      queryFamily: 'list',
      selectedTools: ['list_notes_detail'],
      scope: inferredScope ?? 'current_track',
    };
  }

  if (isNoteListIntentText(userText)) {
    return {
      queryFamily: 'list',
      selectedTools: ['list_notes'],
      scope: inferredScope ?? 'current_scope',
    };
  }

  if (isLayerLinkIntentText(userText)) {
    return {
      queryFamily: 'list',
      selectedTools: ['list_layer_links'],
      scope: inferredScope ?? 'current_scope',
    };
  }

  if (isLayerListIntentText(userText)) {
    return {
      queryFamily: 'list',
      selectedTools: ['list_layers'],
      scope: inferredScope ?? 'current_scope',
    };
  }

  if (isGapCountIntentText(userText)) {
    const scope = inferredScope ?? 'current_track';
    return {
      queryFamily: 'quality',
      selectedTools: ['diagnose_quality'],
      scope,
      ...(requestedMetric ? { requestedMetric } : {}),
    };
  }

  if (isCountIntentText(userText) || requestedMetric !== undefined) {
    const scope = inferredScope ?? 'current_track';
    return {
      queryFamily: 'count',
      selectedTools: ['get_project_stats'],
      scope,
      ...(requestedMetric ? { requestedMetric } : {}),
    };
  }

  if (isLinguisticMemoryIntentText(userText)) {
    const scope = inferredScope ?? 'current_scope';
    return {
      queryFamily: 'detail',
      selectedTools: ['get_unit_linguistic_memory'],
      scope,
    };
  }

  if (isUnitListIntentText(userText)) {
    const scope = inferredScope ?? 'current_scope';
    return {
      queryFamily: 'list',
      selectedTools: ['list_units'],
      scope,
    };
  }

  if (/(搜|搜索|查|查询|检索|search|find|query)/iu.test(userText.trim())) {
    const scope = inferredScope ?? 'current_scope';
    return {
      queryFamily: 'search',
      selectedTools: ['search_units'],
      scope,
    };
  }

  if (/(详情|detail|词法|词素|gloss|annotation|第\s*\d+\s*个)/iu.test(userText.trim())) {
    const scope = inferredScope ?? 'current_scope';
    return {
      queryFamily: 'detail',
      selectedTools: ['get_unit_detail'],
      scope,
    };
  }

  const scope = inferredScope ?? 'current_scope';

  return {
    queryFamily: 'selection',
    selectedTools: ['get_current_selection'],
    scope,
  };
}

export function normalizeUnitOrdinal(userText: string): number | null {
  const cn = userText.match(/第\s*(\d+)\s*个/u);
  if (cn) {
    const idx = Number(cn[1]);
    if (!Number.isFinite(idx) || idx <= 0) return null;
    return Math.floor(idx);
  }
  const en = userText.match(/\b(the\s+)?(\d+)(?:st|nd|rd|th)\b/i);
  if (en) {
    const idx = Number(en[2]);
    if (!Number.isFinite(idx) || idx <= 0) return null;
    return Math.floor(idx);
  }
  return null;
}

export function normalizeBatchApplyUnitIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const dedup = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const id = item.trim();
    if (!id) continue;
    dedup.add(id);
    if (dedup.size >= 200) break;
  }
  return [...dedup];
}

export function resolveProjectStatsCall(
  call: LocalContextToolCall,
  userText: string,
  memory: AiSessionMemory,
  scopeHint?: LocalUnitScope,
): LocalContextToolCall {
  const explicitScope = normalizeScopeArg(call.arguments.scope);
  const inferredScope =
    inferScopeFromUserText(userText) ??
    scopeHint ??
    memory.localToolState?.lastFrame?.scope ??
    memory.localToolState?.lastScope;
  const scope = explicitScope ?? inferredScope ?? 'project';
  const scopeAutofilled = explicitScope === undefined && inferredScope === undefined;
  const metric =
    normalizeMetricArg(call.arguments.metric) ??
    inferMetricFromUserText(userText) ??
    (shouldReusePreviousMetric(userText) || isCountIntentText(userText)
      ? memory.localToolState?.lastFrame?.metric
      : undefined) ??
    (isCountIntentText(userText) ? 'unit_count' : undefined);

  return {
    ...call,
    arguments: {
      ...call.arguments,
      ...(metric ? { metric } : {}),
      scope,
      ...(scopeAutofilled ? { _scopeAutofilled: true } : {}),
    },
  };
}

export function resolveDiagnoseQualityCall(
  call: LocalContextToolCall,
  userText: string,
  memory: AiSessionMemory,
  scopeHint?: LocalUnitScope,
): LocalContextToolCall {
  const explicitScope = normalizeScopeArg(call.arguments.scope);
  const inferredScope =
    inferScopeFromUserText(userText) ??
    scopeHint ??
    memory.localToolState?.lastFrame?.scope ??
    memory.localToolState?.lastScope;
  const scope = explicitScope ?? inferredScope ?? 'current_track';
  const scopeAutofilled = explicitScope === undefined && inferredScope === undefined;
  const metric =
    normalizeGapMetricArg(call.arguments.metric) ??
    inferGapMetricFromUserText(userText) ??
    (shouldReusePreviousMetric(userText) &&
    memory.localToolState?.lastFrame?.metricCategory === 'gap'
      ? memory.localToolState?.lastFrame?.metric
      : undefined);

  return {
    name: 'diagnose_quality',
    arguments: {
      ...call.arguments,
      scope,
      ...(scopeAutofilled ? { _scopeAutofilled: true } : {}),
      ...(metric ? { metric } : {}),
    },
  };
}

export function shouldUpgradeSelectionToProjectStats(userText: string): boolean {
  if (isGapCountIntentText(userText)) return false;
  return isCountIntentText(userText) || inferMetricFromUserText(userText) !== undefined;
}

export function resolveSearchCall(
  call: LocalContextToolCall,
  userText: string,
  memory: AiSessionMemory,
  scopeHint?: LocalUnitScope,
): LocalContextToolCall {
  const query = normalizeText(call.arguments.query);
  const scope = resolvePreferredScope(call, userText, memory, scopeHint);
  const limit = normalizeLimit(call.arguments.limit);
  if (query.length > 0) {
    return { ...call, arguments: { ...call.arguments, query, limit, scope } };
  }

  if (isUnitListIntentText(userText)) {
    return {
      name: 'list_units',
      arguments: { limit, scope },
    };
  }

  const inferred = inferSearchQueryFromUserText(userText);
  if (inferred.length > 0) {
    return {
      ...call,
      arguments: {
        ...call.arguments,
        query: inferred,
        limit,
        scope,
      },
    };
  }

  const memoryQuery = normalizeText(memory.localToolState?.lastQuery);
  if (memoryQuery.length > 0 && isFollowUpIntentText(userText)) {
    return {
      ...call,
      arguments: {
        ...call.arguments,
        query: memoryQuery,
        limit,
        scope,
      },
    };
  }

  return {
    ...call,
    arguments: {
      ...call.arguments,
      query: '',
      limit,
      scope,
    },
  };
}

export function resolveDetailCall(
  call: LocalContextToolCall,
  userText: string,
  memory: AiSessionMemory,
  scopeHint?: LocalUnitScope,
): LocalContextToolCall {
  const scope = resolvePreferredScope(call, userText, memory, scopeHint);
  const unitId = normalizeText(call.arguments.unitId);
  const toLinguisticMemory =
    call.name === 'get_unit_detail' && isLinguisticMemoryIntentText(userText);
  const detailCallName: LocalContextToolCall['name'] = toLinguisticMemory
    ? 'get_unit_linguistic_memory'
    : call.name;
  if (unitId.length > 0) {
    return {
      name: detailCallName,
      arguments: {
        ...call.arguments,
        unitId,
        scope,
        ...(toLinguisticMemory ? { includeNotes: true, includeMorphemes: true } : {}),
      },
    };
  }
  const ids = memory.localToolState?.lastResultUnitIds ?? [];
  if (ids.length === 1) {
    return {
      name: detailCallName,
      arguments: {
        ...call.arguments,
        unitId: ids[0],
        scope,
        ...(toLinguisticMemory ? { includeNotes: true, includeMorphemes: true } : {}),
      },
    };
  }
  const ordinal = normalizeUnitOrdinal(userText);
  if (ordinal && ids[ordinal - 1]) {
    return {
      name: detailCallName,
      arguments: {
        ...call.arguments,
        unitId: ids[ordinal - 1],
        scope,
        ...(toLinguisticMemory ? { includeNotes: true, includeMorphemes: true } : {}),
      },
    };
  }
  return {
    name: detailCallName,
    arguments: {
      ...call.arguments,
      scope,
      ...(toLinguisticMemory ? { includeNotes: true, includeMorphemes: true } : {}),
    },
  };
}

export function resolveBatchApplyCall(
  call: LocalContextToolCall,
  userText: string,
  memory: AiSessionMemory,
): LocalContextToolCall {
  const action =
    normalizeText(call.arguments.action) || inferBatchApplyActionFromUserText(userText) || '';
  const explicitUnitIds = normalizeBatchApplyUnitIds(call.arguments.unitIds);
  const fallbackUnitIds =
    isFollowUpIntentText(userText) ||
    /(这些|这批|those|them|all\s+of\s+them)/iu.test(userText.trim())
      ? (memory.localToolState?.lastResultUnitIds ?? [])
      : [];
  const unitIds = explicitUnitIds.length > 0 ? explicitUnitIds : fallbackUnitIds;
  return {
    ...call,
    arguments: {
      ...call.arguments,
      action,
      unitIds,
    },
  };
}
