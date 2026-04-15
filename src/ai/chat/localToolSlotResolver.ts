import type {
  AiSessionMemory,
  AiSessionMemoryLocalSemanticFrame,
  LocalToolIntent,
  LocalToolMetric,
  LocalUnitScope,
} from './chatDomain.types';
import {
  inferIntentFromToolName,
  isFollowUpIntentText,
  isUtteranceListIntentText,
} from './intentContracts';
import type { LocalContextToolCall } from './localContextTools';

type LocalToolStatePatch = {
  lastIntent?: LocalToolIntent;
  lastQuery?: string;
  lastResultUnitIds?: string[];
  lastScope?: LocalUnitScope;
  lastFrame?: AiSessionMemoryLocalSemanticFrame;
  /** When true, drop persisted lastQuery (e.g. after list-all). */
  clearLastQuery?: boolean;
};

export type ResolveLocalToolCallsOutput = {
  calls: LocalContextToolCall[];
};

export type LocalToolClarificationReason =
  | 'metric_ambiguous'
  | 'query_ambiguous'
  | 'target_ambiguous'
  | 'action_ambiguous';

export type LocalToolClarificationNeed = {
  needed: true;
  reason: LocalToolClarificationReason;
  callName: LocalContextToolCall['name'];
} | {
  needed: false;
};

function normalizeLimit(value: unknown, fallback = 8): number {
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

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeScopeArg(value: unknown): LocalUnitScope | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'project' || normalized === 'global' || normalized === 'all') return 'project';
  if (normalized === 'current_track' || normalized === 'current-track' || normalized === 'track' || normalized === 'current_audio' || normalized === 'current-audio') return 'current_track';
  if (normalized === 'current_scope' || normalized === 'current-scope' || normalized === 'scope' || normalized === 'current') return 'current_scope';
  return undefined;
}

function normalizeMetricArg(value: unknown): LocalToolMetric | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'unit_count' || normalized === 'unitcount' || normalized === 'units' || normalized === 'unit') return 'unit_count';
  if (normalized === 'speaker_count' || normalized === 'speakercount' || normalized === 'speakers' || normalized === 'speaker') return 'speaker_count';
  if (normalized === 'translation_layer_count' || normalized === 'translationlayercount' || normalized === 'translation_layers' || normalized === 'layers') return 'translation_layer_count';
  if (normalized === 'ai_confidence_avg' || normalized === 'confidence' || normalized === 'avg_confidence') return 'ai_confidence_avg';
  if (normalized === 'untranscribed_count' || normalized === 'untranscribed' || normalized === 'unfinished' || normalized === 'remaining') return 'untranscribed_count';
  if (normalized === 'missing_speaker_count' || normalized === 'missing_speaker' || normalized === 'speaker_missing') return 'missing_speaker_count';
  return undefined;
}

function isGapMetric(metric: LocalToolMetric | undefined): boolean {
  return metric === 'untranscribed_count' || metric === 'missing_speaker_count';
}

function normalizeGapMetricArg(value: unknown): LocalToolMetric | undefined {
  const metric = normalizeMetricArg(value);
  return isGapMetric(metric) ? metric : undefined;
}

function inferScopeFromUserText(userText: string): LocalUnitScope | undefined {
  const text = userText.trim();
  if (!text) return undefined;

  if (/(全项目|全局|所有音频|所有语段|全部语段|all\s+segments?|whole\s+project|project[-\s]*wide|global)/i.test(text)) {
    return 'project';
  }
  if (/(当前音频|这条音频|这段音频|当前轨道|本轨|this\s+track|current\s+track|this\s+audio|current\s+audio)/i.test(text)) {
    return 'current_track';
  }
  if (/(当前语段|当前句段|当前层|本层|这一层|这个语段|这条语段|这里|这儿|selected\s+(segment|layer))/i.test(text)) {
    return 'current_scope';
  }
  return undefined;
}

function resolvePreferredScope(
  call: LocalContextToolCall,
  userText: string,
  memory: AiSessionMemory,
  scopeHint?: LocalUnitScope,
): LocalUnitScope {
  return normalizeScopeArg(call.arguments.scope)
    ?? inferScopeFromUserText(userText)
    ?? scopeHint
    ?? memory.localToolState?.lastScope
    ?? 'current_scope';
}

function resolveProjectStatsScope(
  call: LocalContextToolCall,
  userText: string,
  memory: AiSessionMemory,
  scopeHint?: LocalUnitScope,
): LocalUnitScope {
  return normalizeScopeArg(call.arguments.scope)
    ?? inferScopeFromUserText(userText)
    ?? scopeHint
    ?? memory.localToolState?.lastFrame?.scope
    ?? memory.localToolState?.lastScope
    ?? 'project';
}

function normalizeUtteranceOrdinal(userText: string): number | null {
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

function inferSearchQueryFromUserText(userText: string): string {
  const normalized = userText
    .replace(/[，。！？,.!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return '';
  if (/^(帮我|请|麻烦)?\s*(搜|搜索|查|查询|找|检索)\s*(一下|下|看看|一条|一些)?$/iu.test(normalized)) {
    return '';
  }
  if (isUtteranceListIntentText(normalized) || isFollowUpIntentText(normalized)) {
    return '';
  }
  const quoted = normalized.match(/["“”'‘’]([^"“”'‘’]{1,64})["“”'‘’]/u);
  if (quoted?.[1]?.trim()) {
    return quoted[1].trim();
  }
  return normalized.length <= 2 ? '' : normalized;
}

function isLinguisticMemoryIntentText(userText: string): boolean {
  const text = userText.trim();
  if (!text) return false;
  return /(语言学|词法|词素|词项|token|morpheme|gloss|词性|pos\b|注释|备注|译文|linguistic|annotation)/i.test(text);
}

function normalizeBatchApplyUnitIds(value: unknown): string[] {
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

function inferBatchApplyActionFromUserText(userText: string): string | undefined {
  const text = userText.trim();
  if (!text) return undefined;
  if (/(删除|移除|delete|remove)/i.test(text)) return 'delete';
  if (/(说话人|speaker)/i.test(text)) return 'assign_speaker';
  if (/(验证|校验|标记.*完成|设为完成|complete|verify|verified)/i.test(text)) return 'verify';
  if (/(修改|更新|update)/i.test(text)) return 'update';
  return undefined;
}

function isCountIntentText(userText: string): boolean {
  const text = userText.trim();
  if (!text) return false;
  return /(多少|几个|几位|几名|一共|总共|总计|how\s+many|count\b|total\b|number\s+of)/i.test(text);
}

function inferGapMetricFromUserText(userText: string): LocalToolMetric | undefined {
  const text = userText.trim();
  if (!text) return undefined;
  if (/(缺少说话人|未标说话人|missing\s+speaker|speaker\s+missing)/i.test(text)) return 'missing_speaker_count';
  if (/(未转写|未完成转写|未写文本|空文本|还没转写|未完成|还剩|剩余|unfinished|untranscribed|remaining)/i.test(text)) {
    return 'untranscribed_count';
  }
  return undefined;
}

function isGapCountIntentText(userText: string): boolean {
  return inferGapMetricFromUserText(userText) !== undefined;
}

function shouldReusePreviousMetric(userText: string): boolean {
  const text = userText.trim();
  if (!text) return false;
  return isFollowUpIntentText(text)
    || /^(多少|几个|几位|几名)$/u.test(text)
    || /^(那|那么)?(当前|当前音频|这条音频|当前轨道|项目里|全项目|这个).*(呢|吗)?$/u.test(text)
    || /^\s*(what about|how about|and)\b/i.test(text);
}

function inferMetricFromUserText(userText: string): LocalToolMetric | undefined {
  const text = userText.trim();
  if (!text) return undefined;
  if (/(speaker|speakers|说话人|发言人)/i.test(text)) return 'speaker_count';
  if (/(translation\s*layers?|翻译层|译层|层数)/i.test(text)) return 'translation_layer_count';
  if (/(confidence|置信度|可信度)/i.test(text)) return 'ai_confidence_avg';
  if (/(segments?|units?|utterances?|rows?|语段|句段|条目)/i.test(text)) return 'unit_count';
  return undefined;
}

function resolveProjectStatsCall(
  call: LocalContextToolCall,
  userText: string,
  memory: AiSessionMemory,
  scopeHint?: LocalUnitScope,
): LocalContextToolCall {
  const scope = resolveProjectStatsScope(call, userText, memory, scopeHint);
  const metric = normalizeMetricArg(call.arguments.metric)
    ?? inferMetricFromUserText(userText)
    ?? ((shouldReusePreviousMetric(userText) || isCountIntentText(userText))
      ? memory.localToolState?.lastFrame?.metric
      : undefined)
    ?? (isCountIntentText(userText) ? 'unit_count' : undefined);

  return {
    ...call,
    arguments: {
      ...call.arguments,
      ...(metric ? { metric } : {}),
      scope,
    },
  };
}

function resolveDiagnoseQualityScope(
  call: LocalContextToolCall,
  userText: string,
  memory: AiSessionMemory,
  scopeHint?: LocalUnitScope,
): LocalUnitScope {
  return normalizeScopeArg(call.arguments.scope)
    ?? inferScopeFromUserText(userText)
    ?? scopeHint
    ?? memory.localToolState?.lastFrame?.scope
    ?? memory.localToolState?.lastScope
    ?? 'current_track';
}

function resolveDiagnoseQualityCall(
  call: LocalContextToolCall,
  userText: string,
  memory: AiSessionMemory,
  scopeHint?: LocalUnitScope,
): LocalContextToolCall {
  const scope = resolveDiagnoseQualityScope(call, userText, memory, scopeHint);
  const metric = normalizeGapMetricArg(call.arguments.metric)
    ?? inferGapMetricFromUserText(userText)
    ?? ((shouldReusePreviousMetric(userText) && memory.localToolState?.lastFrame?.metricCategory === 'gap')
      ? memory.localToolState?.lastFrame?.metric
      : undefined);

  return {
    name: 'diagnose_quality',
    arguments: {
      ...call.arguments,
      scope,
      ...(metric ? { metric } : {}),
    },
  };
}

function shouldUpgradeSelectionToProjectStats(userText: string): boolean {
  if (isGapCountIntentText(userText)) return false;
  return isCountIntentText(userText) || inferMetricFromUserText(userText) !== undefined;
}

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

function resolveSearchCall(call: LocalContextToolCall, userText: string, memory: AiSessionMemory, scopeHint?: LocalUnitScope): LocalContextToolCall {
  const query = normalizeText(call.arguments.query);
  const scope = resolvePreferredScope(call, userText, memory, scopeHint);
  const limit = normalizeLimit(call.arguments.limit);
  if (query.length > 0) {
    return { ...call, arguments: { ...call.arguments, query, limit, scope } };
  }

  if (isUtteranceListIntentText(userText)) {
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

function resolveDetailCall(call: LocalContextToolCall, userText: string, memory: AiSessionMemory, scopeHint?: LocalUnitScope): LocalContextToolCall {
  const scope = resolvePreferredScope(call, userText, memory, scopeHint);
  const unitId = normalizeText(call.arguments.unitId);
  const toLinguisticMemory = call.name === 'get_unit_detail' && isLinguisticMemoryIntentText(userText);
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
  const ordinal = normalizeUtteranceOrdinal(userText);
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

function resolveBatchApplyCall(call: LocalContextToolCall, userText: string, memory: AiSessionMemory): LocalContextToolCall {
  const action = normalizeText(call.arguments.action)
    || inferBatchApplyActionFromUserText(userText)
    || '';
  const explicitUnitIds = normalizeBatchApplyUnitIds(call.arguments.unitIds);
  const fallbackUnitIds = (isFollowUpIntentText(userText) || /(这些|这批|those|them|all\s+of\s+them)/iu.test(userText.trim()))
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

function needsMetricClarification(
  call: LocalContextToolCall,
  userText: string,
  memory: AiSessionMemory,
): boolean {
  if (!isCountIntentText(userText)) return false;
  const userTextMetric = inferMetricFromUserText(userText)
    ?? inferGapMetricFromUserText(userText);
  const callMetric = normalizeMetricArg(call.arguments.metric)
    ?? normalizeGapMetricArg(call.arguments.metric);
  const reusableMetric = memory.localToolState?.lastFrame?.questionKind === 'count'
    ? memory.localToolState.lastFrame.metric
    : undefined;
  if (userTextMetric !== undefined) return false;
  if (reusableMetric !== undefined) return false;
  if (callMetric === undefined) return true;
  return callMetric === 'unit_count';
}

function needsQueryClarification(
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

function needsTargetClarification(
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
  const ordinal = normalizeUtteranceOrdinal(userText);
  if (ordinal && ids[ordinal - 1]) return false;
  return true;
}

function needsActionClarification(
  call: LocalContextToolCall,
): boolean {
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
    if ((call.name === 'get_project_stats' || call.name === 'diagnose_quality')
      && needsMetricClarification(call, userText, memory)) {
      return { needed: true, reason: 'metric_ambiguous', callName: call.name };
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
      case 'get_project_stats':
        if (isGapCountIntentText(userText)
          || (shouldReusePreviousMetric(userText) && memory.localToolState?.lastFrame?.metricCategory === 'gap')) {
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
        if (isGapCountIntentText(userText)
          || (shouldReusePreviousMetric(userText) && memory.localToolState?.lastFrame?.metricCategory === 'gap')) {
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

function asResultUtteranceIds(result: unknown): string[] {
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
  const resultIds = asResultUtteranceIds(result.result);
  const query =
    call.name === 'search_units'
      ? normalizeText(call.arguments.query)
      : '';
  const patch: LocalToolStatePatch = {};
  const scopeFromArgs = normalizeScopeArg(call.arguments.scope);
  const scopeFromResult = result.result && typeof result.result === 'object' && !Array.isArray(result.result)
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
