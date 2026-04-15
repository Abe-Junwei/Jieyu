import type { AiSessionMemory, LocalToolIntent } from './chatDomain.types';
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
  /** When true, drop persisted lastQuery (e.g. after list-all). */
  clearLastQuery?: boolean;
};

export type ResolveLocalToolCallsOutput = {
  calls: LocalContextToolCall[];
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
  if (isUtteranceListIntentText(normalized) || isFollowUpIntentText(normalized)) {
    return '';
  }
  const quoted = normalized.match(/["“”'‘’]([^"“”'‘’]{1,64})["“”'‘’]/u);
  if (quoted?.[1]?.trim()) {
    return quoted[1].trim();
  }
  return normalized.length <= 2 ? '' : normalized;
}

function resolveSearchCall(call: LocalContextToolCall, userText: string, memory: AiSessionMemory): LocalContextToolCall {
  const query = normalizeText(call.arguments.query);
  const limit = normalizeLimit(call.arguments.limit);
  if (query.length > 0) {
    return { ...call, arguments: { ...call.arguments, query, limit } };
  }

  if (isUtteranceListIntentText(userText)) {
    return {
      name: 'list_units',
      arguments: { limit },
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
      },
    };
  }

  return {
    name: 'list_units',
    arguments: { limit },
  };
}

function resolveDetailCall(call: LocalContextToolCall, userText: string, memory: AiSessionMemory): LocalContextToolCall {
  const unitId = normalizeText(call.arguments.unitId);
  if (unitId.length > 0) {
    return {
      ...call,
      arguments: { ...call.arguments, unitId },
    };
  }
  const ids = memory.localToolState?.lastResultUnitIds ?? [];
  if (ids.length === 1) {
    return {
      ...call,
      arguments: { ...call.arguments, unitId: ids[0] },
    };
  }
  const ordinal = normalizeUtteranceOrdinal(userText);
  if (ordinal && ids[ordinal - 1]) {
    return {
      ...call,
      arguments: { ...call.arguments, unitId: ids[ordinal - 1] },
    };
  }
  return call;
}

export function resolveLocalToolCalls(
  calls: LocalContextToolCall[],
  userText: string,
  memory: AiSessionMemory,
): ResolveLocalToolCallsOutput {
  const resolved = calls.map((call) => {
    switch (call.name) {
      case 'search_units':
        return resolveSearchCall(call, userText, memory);
      case 'get_unit_detail':
        return resolveDetailCall(call, userText, memory);
      case 'list_units':
        return {
          ...call,
          arguments: {
            ...call.arguments,
            limit: normalizeLimit(call.arguments.limit),
          },
        };
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
  return patch;
}
