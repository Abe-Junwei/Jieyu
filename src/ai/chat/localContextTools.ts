import type { TimelineUnitView } from '../../hooks/timelineUnitView';
import type { AiPromptContext } from './chatDomain.types';
import { extractJsonCandidates } from './toolCallSchemas';
import { batchApply, diagnoseQuality, findIncompleteUnits, suggestNextAction } from './intentTools';
import {
  AI_AGENT_LOOP_DEEP_STRING_MAX_CHARS_PASS1,
  AI_AGENT_LOOP_DEEP_STRING_MAX_CHARS_PASS2,
  AI_AGENT_LOOP_MATCH_TRANSCRIPTION_PREVIEW_MAX_CHARS,
  AI_AGENT_LOOP_PAYLOAD_SHRINK_MAX_STEPS,
  AI_AGENT_LOOP_USER_REQUEST_MAX_CHARS,
  AI_LOCAL_TOOL_RESULT_CHAR_BUDGET,
} from '../../hooks/useAiChat.config';
import { createMetricTags, recordMetric } from '../../observability/metrics';
import { buildLocalToolReadModelMeta } from './localContextToolReadModelMeta';
import {
  createListUnitsSnapshot,
  getListUnitsSnapshot,
  LIST_UNITS_SNAPSHOT_ROW_THRESHOLD,
  type ListUnitsSnapshotRow,
} from './localContextListUnitsSnapshotStore';

export type LocalContextToolName =
  | 'get_current_selection'
  | 'get_project_stats'
  | 'get_waveform_analysis'
  | 'get_acoustic_summary'
  | 'find_incomplete_units'
  | 'diagnose_quality'
  | 'batch_apply'
  | 'suggest_next_action'
  | 'list_units'
  | 'search_units'
  | 'get_unit_detail';

export interface LocalContextToolCall {
  name: LocalContextToolName;
  arguments: Record<string, unknown>;
}

export interface LocalContextToolResult {
  ok: boolean;
  name: LocalContextToolName;
  result: unknown;
  error?: string;
}

const LOCAL_CONTEXT_TOOL_NAMES = new Set<LocalContextToolName>([
  'get_current_selection',
  'get_project_stats',
  'get_waveform_analysis',
  'get_acoustic_summary',
  'find_incomplete_units',
  'diagnose_quality',
  'batch_apply',
  'suggest_next_action',
  'list_units',
  'search_units',
  'get_unit_detail',
]);

/**
 * Legacy local-tool names kept for older prompts / model outputs.
 * Metrics: `ai.local_tool_alias_usage` records each alias hit; do not add new aliases without an ADR.
 * Sunset: remove once audit shows zero alias usage for several releases.
 */
const LEGACY_LOCAL_CONTEXT_TOOL_ALIAS_MAP = {
  list_utterances: 'list_units',
  search_utterances: 'search_units',
  get_utterance_detail: 'get_unit_detail',
} as const satisfies Record<string, LocalContextToolName>;

type ResolvedLocalToolName = {
  name: LocalContextToolName;
  usedAlias: boolean;
  rawName: string;
};

function normalizeToolName(name: string): ResolvedLocalToolName | null {
  const normalized = name.trim().toLowerCase();
  if (LOCAL_CONTEXT_TOOL_NAMES.has(normalized as LocalContextToolName)) {
    return { name: normalized as LocalContextToolName, usedAlias: false, rawName: normalized };
  }
  const aliased = LEGACY_LOCAL_CONTEXT_TOOL_ALIAS_MAP[normalized as keyof typeof LEGACY_LOCAL_CONTEXT_TOOL_ALIAS_MAP];
  if (aliased) {
    return { name: aliased, usedAlias: true, rawName: normalized };
  }
  return null;
}

function recordLocalToolAliasUsage(aliasName: string, canonicalName: LocalContextToolName): void {
  recordMetric({
    id: 'ai.local_tool_alias_usage',
    value: 1,
    tags: createMetricTags('localContextTools', {
      aliasName,
      canonicalName,
    }),
  });
}

function toToolCallCandidate(rawText: string): { name: string; arguments: Record<string, unknown> } | null {
  const candidates = extractJsonCandidates(rawText);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const holder = (typeof parsed.tool_call === 'object' && parsed.tool_call !== null)
        ? parsed.tool_call as Record<string, unknown>
        : parsed;

      const rawName = typeof holder.name === 'string' ? holder.name : null;
      if (!rawName) continue;
      const rawArgs = holder.arguments;
      const args = typeof rawArgs === 'object' && rawArgs !== null && !Array.isArray(rawArgs)
        ? rawArgs as Record<string, unknown>
        : {};
      return { name: rawName, arguments: args };
    } catch {
      continue;
    }
  }
  return null;
}

function toToolCallCandidates(rawText: string): LocalContextToolCall[] {
  const candidates = extractJsonCandidates(rawText);
  const parsedCalls: LocalContextToolCall[] = [];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const rawBatch = parsed.tool_calls;
      if (Array.isArray(rawBatch)) {
        for (const item of rawBatch) {
          if (!item || typeof item !== 'object') continue;
          const holder = item as Record<string, unknown>;
          const rawName = typeof holder.name === 'string' ? holder.name : '';
          const normalized = normalizeToolName(rawName);
          if (!normalized) continue;
          if (normalized.usedAlias) {
            recordLocalToolAliasUsage(normalized.rawName, normalized.name);
          }
          const rawArgs = holder.arguments;
          const args = typeof rawArgs === 'object' && rawArgs !== null && !Array.isArray(rawArgs)
            ? rawArgs as Record<string, unknown>
            : {};
          parsedCalls.push({ name: normalized.name, arguments: args });
        }
      }
    } catch {
      continue;
    }
  }

  if (parsedCalls.length > 0) return parsedCalls;
  const single = parseLocalContextToolCallFromText(rawText);
  return single ? [single] : [];
}

export function parseLocalContextToolCallFromText(rawText: string): LocalContextToolCall | null {
  const candidate = toToolCallCandidate(rawText);
  if (!candidate) return null;
  const normalized = normalizeToolName(candidate.name);
  if (!normalized) return null;
  if (normalized.usedAlias) {
    recordLocalToolAliasUsage(normalized.rawName, normalized.name);
  }
  return {
    name: normalized.name,
    arguments: candidate.arguments,
  };
}

export function parseLocalContextToolCallsFromText(rawText: string): LocalContextToolCall[] {
  return toToolCallCandidates(rawText);
}

function normalizeTextValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLimit(value: unknown, fallback = 5): number {
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

/** Non-snapshot list caps offset (small in-memory index). Snapshot paging uses `LIST_UNITS_SNAPSHOT_OFFSET_MAX`. */
const LIST_UNITS_DEFAULT_OFFSET_MAX = 500;
const LIST_UNITS_SNAPSHOT_OFFSET_MAX = 10_000_000;

function normalizeOffset(value: unknown, fallback = 0, maxOffset = LIST_UNITS_DEFAULT_OFFSET_MAX): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(maxOffset, Math.max(0, Math.floor(value)));
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.min(maxOffset, Math.max(0, Math.floor(parsed)));
    }
  }
  return fallback;
}

interface NormalizedUnitRow {
  id: string;
  kind: 'utterance' | 'segment';
  layerId: string;
  textId?: string;
  mediaId?: string;
  startTime: number;
  endTime: number;
  transcription: string;
  speakerId?: string;
  annotationStatus?: string;
}

function normalizedUnitRowsFromContext(context: AiPromptContext): NormalizedUnitRow[] | null {
  const rows = context.shortTerm?.localUnitIndex;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows.map((row) => {
    const legacy = row as TimelineUnitView & { transcription?: string };
    return {
      id: row.id,
      kind: row.kind,
      layerId: row.layerId,
      ...(row.textId !== undefined ? { textId: row.textId } : {}),
      ...(row.mediaId !== undefined ? { mediaId: row.mediaId } : {}),
      startTime: row.startTime,
      endTime: row.endTime,
      transcription: row.text ?? legacy.transcription ?? '',
      ...(row.speakerId !== undefined ? { speakerId: row.speakerId } : {}),
      ...(row.annotationStatus !== undefined ? { annotationStatus: row.annotationStatus } : {}),
    };
  });
}

function loadNormalizedUnitRows(context: AiPromptContext): NormalizedUnitRow[] {
  const fromContext = normalizedUnitRowsFromContext(context);
  if (fromContext) return fromContext;
  return [];
}

async function searchUnits(context: AiPromptContext, args: Record<string, unknown>): Promise<LocalContextToolResult> {
  const query = normalizeTextValue(args.query);
  if (query.length === 0) {
    const listFallback = await listUnits(context, args);
    return {
      ok: listFallback.ok,
      name: 'search_units',
      result: listFallback.ok
        ? {
          mode: 'list_fallback',
          ...(listFallback.result as Record<string, unknown>),
        }
        : listFallback.result,
      ...(listFallback.error ? { error: listFallback.error } : {}),
    };
  }

  const rows = loadNormalizedUnitRows(context);
  if (rows.length === 0) {
    return { ok: false, name: 'search_units', result: null, error: 'data_loading' };
  }
  const lowered = query.toLowerCase();
  const limit = normalizeLimit(args.limit);

  const matches = rows
    .filter((row) => row.transcription.toLowerCase().includes(lowered))
    .sort((a, b) => a.startTime - b.startTime)
    .slice(0, limit);

  return {
    ok: true,
    name: 'search_units',
    result: {
      query,
      count: matches.length,
      matches,
    },
  };
}

function sortNormalizedUnitRows(rows: NormalizedUnitRow[], sort: 'time_asc' | 'time_desc'): NormalizedUnitRow[] {
  return [...rows].sort((a, b) => (sort === 'time_desc' ? b.startTime - a.startTime : a.startTime - b.startTime));
}

function buildListUnitsPageResult(
  context: AiPromptContext,
  rowsUnsorted: NormalizedUnitRow[],
  args: Record<string, unknown>,
  opts: { resultHandle?: string; snapshotPaging?: boolean },
): LocalContextToolResult {
  const limit = normalizeLimit(args.limit, 8);
  const offsetMax = opts.snapshotPaging || opts.resultHandle
    ? LIST_UNITS_SNAPSHOT_OFFSET_MAX
    : LIST_UNITS_DEFAULT_OFFSET_MAX;
  const offset = normalizeOffset(args.offset, 0, offsetMax);
  const sort = normalizeTextValue(args.sort).toLowerCase() === 'time_desc' ? 'time_desc' : 'time_asc';
  const normalized = sortNormalizedUnitRows(rowsUnsorted, sort);
  const matches = normalized.slice(offset, offset + limit);
  const expectedTotal = context.longTerm?.projectStats?.unitCount ?? context.shortTerm?.projectUnitCount;
  if (typeof expectedTotal === 'number' && Number.isFinite(expectedTotal) && normalized.length !== expectedTotal) {
    if (import.meta.env.DEV) {
      console.warn('[timeline_unit_count_mismatch]', { tool: 'list_units', total: normalized.length, expectedTotal });
    }
    recordMetric({
      id: 'ai.timeline_unit_count_mismatch',
      value: 1,
      tags: createMetricTags('localContextTools', {
        source: 'list_units',
        total: normalized.length,
        expectedTotal,
      }),
    });
  }

  const result: Record<string, unknown> = {
    count: matches.length,
    total: normalized.length,
    offset,
    limit,
    sort,
    matches,
  };
  if (opts.resultHandle) {
    result.resultHandle = opts.resultHandle;
  }
  if (opts.snapshotPaging) {
    result.snapshotPaging = true;
  }
  return {
    ok: true,
    name: 'list_units',
    result: result,
  };
}

async function listUnits(context: AiPromptContext, args: Record<string, unknown>): Promise<LocalContextToolResult> {
  const handleArg = normalizeTextValue(args.resultHandle);
  if (handleArg.length > 0) {
    const entry = getListUnitsSnapshot(handleArg);
    if (!entry) {
      return { ok: false, name: 'list_units', result: null, error: 'invalid_or_expired_handle' };
    }
    const ctxEpoch = context.shortTerm?.timelineReadModelEpoch;
    if (
      typeof entry.epoch === 'number'
      && Number.isFinite(entry.epoch)
      && typeof ctxEpoch === 'number'
      && Number.isFinite(ctxEpoch)
      && entry.epoch !== ctxEpoch
    ) {
      return { ok: false, name: 'list_units', result: null, error: 'stale_list_handle' };
    }
    return buildListUnitsPageResult(context, entry.rows as NormalizedUnitRow[], args, {
      resultHandle: handleArg,
      snapshotPaging: true,
    });
  }

  const rows = loadNormalizedUnitRows(context);
  if (rows.length === 0) {
    return { ok: false, name: 'list_units', result: null, error: 'data_loading' };
  }

  if (rows.length > LIST_UNITS_SNAPSHOT_ROW_THRESHOLD) {
    const epoch = context.shortTerm?.timelineReadModelEpoch;
    const newHandle = createListUnitsSnapshot(
      rows as ListUnitsSnapshotRow[],
      typeof epoch === 'number' && Number.isFinite(epoch) ? epoch : undefined,
    );
    recordMetric({
      id: 'ai.list_units_snapshot_created',
      value: 1,
      tags: createMetricTags('localContextTools', {
        rowCount: rows.length,
      }),
    });
    return buildListUnitsPageResult(context, rows, args, {
      resultHandle: newHandle,
      snapshotPaging: true,
    });
  }

  return buildListUnitsPageResult(context, rows, args, {});
}

async function getUnitDetail(args: Record<string, unknown>, context: AiPromptContext): Promise<LocalContextToolResult> {
  const unitId = normalizeTextValue(args.unitId);
  if (unitId.length === 0) {
    return {
      ok: false,
      name: 'get_unit_detail',
      result: null,
      error: 'unitId is required',
    };
  }

  const localRows = normalizedUnitRowsFromContext(context);
  if (localRows) {
    const hit = localRows.find((r) => r.id === unitId);
    if (hit) {
      return {
        ok: true,
        name: 'get_unit_detail',
        result: {
          id: hit.id,
          kind: hit.kind,
          layerId: hit.layerId,
          textId: hit.textId,
          mediaId: hit.mediaId,
          startTime: hit.startTime,
          endTime: hit.endTime,
          speakerId: hit.speakerId,
          annotationStatus: hit.annotationStatus,
          transcription: hit.transcription,
        },
      };
    }
  }
  return { ok: false, name: 'get_unit_detail', result: null, error: `unit not found: ${unitId}` };
}

function attachReadModelToToolPayload(context: AiPromptContext, result: unknown): unknown {
  const meta = buildLocalToolReadModelMeta(context);
  if (result === null) {
    return { _readModel: meta };
  }
  if (typeof result !== 'object' || Array.isArray(result)) {
    return result;
  }
  const body = result as Record<string, unknown>;
  if (body._readModel !== undefined) {
    return result;
  }
  return { ...body, _readModel: meta };
}

function finalizeLocalContextToolResult(context: AiPromptContext, out: LocalContextToolResult): LocalContextToolResult {
  if (!out.ok) {
    return out;
  }
  return {
    ...out,
    result: attachReadModelToToolPayload(context, out.result),
  };
}

export async function executeLocalContextToolCall(
  call: LocalContextToolCall,
  context: AiPromptContext | null,
  callCountRef: { current: number },
  maxCalls = 20,
): Promise<LocalContextToolResult> {
  if (!context) {
    return {
      ok: false,
      name: call.name,
      result: null,
      error: 'context is unavailable',
    };
  }

  if (callCountRef.current >= maxCalls) {
    return {
      ok: false,
      name: call.name,
      result: null,
      error: 'local tool call limit exceeded',
    };
  }
  callCountRef.current += 1;

  let out: LocalContextToolResult;
  switch (call.name) {
    case 'get_current_selection': {
      const { localUnitIndex: _stripped, ...visibleShortTerm } = context.shortTerm ?? {};
      out = {
        ok: true,
        name: call.name,
        result: {
          ...visibleShortTerm,
          ...(context.longTerm?.projectStats?.unitCount !== undefined
            ? { projectUnitCount: context.longTerm.projectStats.unitCount }
            : context.longTerm?.projectStats?.utteranceCount !== undefined
              ? { projectUnitCount: context.longTerm.projectStats.utteranceCount }
              : {}),
        },
      };
      break;
    }
    case 'get_project_stats':
      out = { ok: true, name: call.name, result: context.longTerm?.projectStats ?? null };
      break;
    case 'get_waveform_analysis':
      out = { ok: true, name: call.name, result: context.longTerm?.waveformAnalysis ?? null };
      break;
    case 'get_acoustic_summary':
      out = { ok: true, name: call.name, result: context.longTerm?.acousticSummary ?? null };
      break;
    case 'find_incomplete_units':
      out = { ok: true, name: call.name, result: findIncompleteUnits(context, call.arguments) };
      break;
    case 'diagnose_quality':
      out = { ok: true, name: call.name, result: diagnoseQuality(context) };
      break;
    case 'batch_apply':
      out = { ok: true, name: call.name, result: batchApply(context, call.arguments) };
      break;
    case 'suggest_next_action':
      out = { ok: true, name: call.name, result: suggestNextAction(context) };
      break;
    case 'list_units':
      out = {
        ...(await listUnits(context, call.arguments)),
        name: call.name,
      };
      break;
    case 'search_units':
      out = {
        ...(await searchUnits(context, call.arguments)),
        name: call.name,
      };
      break;
    case 'get_unit_detail':
      out = {
        ...(await getUnitDetail(call.arguments, context)),
        name: call.name,
      };
      break;
    default:
      return {
        ok: false,
        name: call.name,
        result: null,
        error: `unsupported local context tool: ${call.name}`,
      };
  }

  return finalizeLocalContextToolResult(context, out);
}

export async function executeLocalContextToolCallsBatch(
  calls: LocalContextToolCall[],
  context: AiPromptContext | null,
  callCountRef: { current: number },
  maxCalls = 20,
): Promise<LocalContextToolResult[]> {
  const results: LocalContextToolResult[] = [];
  for (const call of calls) {
    const result = await executeLocalContextToolCall(call, context, callCountRef, maxCalls);
    results.push(result);
  }
  return results;
}

/** @see AI_LOCAL_TOOL_RESULT_CHAR_BUDGET in `useAiChat.config.ts` */
export const LOCAL_TOOL_RESULT_CHAR_BUDGET = AI_LOCAL_TOOL_RESULT_CHAR_BUDGET;

const TOOL_RESULT_TRUNCATION_WARNING = '\n[DATA TRUNCATED — do NOT fabricate missing items. Tell the user that the full list is too long and suggest using more specific queries or smaller limit/offset.]';

function applyLocalToolResultCharBudget(
  payload: string,
  meta: { scope: 'single' | 'batch' | 'agent_loop'; toolName?: string },
): { limitedPayload: string; truncated: boolean } {
  const truncated = payload.length > LOCAL_TOOL_RESULT_CHAR_BUDGET;
  if (truncated) {
    recordMetric({
      id: 'ai.local_tool_result_truncated',
      value: 1,
      tags: createMetricTags('localContextTools', {
        scope: meta.scope,
        ...(meta.toolName !== undefined ? { toolName: meta.toolName } : {}),
        payloadChars: payload.length,
      }),
    });
  }
  const limitedPayload = truncated
    ? `${payload.slice(0, LOCAL_TOOL_RESULT_CHAR_BUDGET)}...`
    : payload;
  return { limitedPayload, truncated };
}

function scopeLabelByToolName(name: LocalContextToolName): string {
  switch (name) {
    case 'list_units':
    case 'search_units':
    case 'get_unit_detail':
    case 'get_project_stats':
    case 'find_incomplete_units':
    case 'diagnose_quality':
    case 'batch_apply':
    case 'suggest_next_action':
      return 'project';
    case 'get_current_selection':
      return 'selection+track';
    case 'get_waveform_analysis':
      return 'current-track-analysis';
    case 'get_acoustic_summary':
      return 'selection-acoustic';
    default:
      return 'unknown';
  }
}

export function formatLocalContextToolResultMessage(result: LocalContextToolResult): string {
  const payload = result.ok
    ? JSON.stringify(result.result, null, 2)
    : JSON.stringify({ error: result.error ?? 'unknown_error', result: result.result }, null, 2);
  const { limitedPayload, truncated } = applyLocalToolResultCharBudget(payload, {
    scope: 'single',
    toolName: result.name,
  });
  return [
    `Local context tool executed: ${result.name} [scope: ${scopeLabelByToolName(result.name)}]`,
    '```json',
    limitedPayload,
    '```',
    ...(truncated ? [TOOL_RESULT_TRUNCATION_WARNING] : []),
  ].join('\n');
}

export function formatLocalContextToolBatchResultMessage(results: LocalContextToolResult[]): string {
  const payload = JSON.stringify(results, null, 2);
  const { limitedPayload, truncated } = applyLocalToolResultCharBudget(payload, { scope: 'batch' });
  return [
    'Local context tool batch executed [scope: mixed]',
    '```json',
    limitedPayload,
    '```',
    ...(truncated ? [TOOL_RESULT_TRUNCATION_WARNING] : []),
  ].join('\n');
}

function cloneLocalToolResultsForAgentLoop(results: LocalContextToolResult[]): LocalContextToolResult[] {
  return JSON.parse(JSON.stringify(results)) as LocalContextToolResult[];
}

function agentLoopContinuationPayloadJson(
  cappedUserRequest: string,
  results: LocalContextToolResult[],
  step: number,
): string {
  return JSON.stringify({
    type: 'local_tool_result',
    step,
    originalUserRequest: cappedUserRequest,
    results,
  });
}

function truncateMatchTranscriptionsForAgentLoop(results: LocalContextToolResult[]): boolean {
  let changed = false;
  for (const item of results) {
    if (!item.ok || item.result === null || typeof item.result !== 'object' || Array.isArray(item.result)) continue;
    const body = item.result as Record<string, unknown>;
    const matches = body.matches;
    if (!Array.isArray(matches)) continue;
    for (const m of matches) {
      if (!m || typeof m !== 'object' || Array.isArray(m)) continue;
      const row = m as Record<string, unknown>;
      const t = row.transcription;
      if (typeof t === 'string' && t.length > AI_AGENT_LOOP_MATCH_TRANSCRIPTION_PREVIEW_MAX_CHARS) {
        row.transcription = `${t.slice(0, AI_AGENT_LOOP_MATCH_TRANSCRIPTION_PREVIEW_MAX_CHARS)}…`;
        changed = true;
      }
    }
  }
  return changed;
}

function popLongestMatchesRowForAgentLoop(results: LocalContextToolResult[]): boolean {
  let bestIdx = -1;
  let bestLen = -1;
  for (let i = 0; i < results.length; i += 1) {
    const item = results[i]!;
    if (!item.ok || item.result === null || typeof item.result !== 'object' || Array.isArray(item.result)) continue;
    const matches = (item.result as Record<string, unknown>).matches;
    if (Array.isArray(matches) && matches.length > bestLen) {
      bestLen = matches.length;
      bestIdx = i;
    }
  }
  if (bestIdx < 0 || bestLen <= 0) return false;
  const matches = (results[bestIdx]!.result as Record<string, unknown>).matches as unknown[];
  matches.pop();
  return true;
}

function truncateDeepStringsForAgentLoop(value: unknown, maxLen: number): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const el of value) truncateDeepStringsForAgentLoop(el, maxLen);
    return;
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (typeof v === 'string' && v.length > maxLen) {
      obj[key] = `${v.slice(0, maxLen)}…`;
    } else {
      truncateDeepStringsForAgentLoop(v, maxLen);
    }
  }
}

/**
 * Fits `local_tool_result` JSON (agent loop continuation) under {@link LOCAL_TOOL_RESULT_CHAR_BUDGET}
 * while keeping valid JSON: trim `matches[].transcription`, drop tail `matches`, then deep-string trim.
 * Records `ai.local_tool_result_truncated` when any shrink was applied.
 */
export function buildAgentLoopContinuationToolPayload(
  originalUserText: string,
  localToolResults: LocalContextToolResult[],
  step: number,
  charBudget = LOCAL_TOOL_RESULT_CHAR_BUDGET,
): { payloadJson: string; truncated: boolean; originalPayloadChars: number; cappedUserRequest: string } {
  const cappedUserRequest = originalUserText.length <= AI_AGENT_LOOP_USER_REQUEST_MAX_CHARS
    ? originalUserText
    : `${originalUserText.slice(0, AI_AGENT_LOOP_USER_REQUEST_MAX_CHARS)}…`;
  const userRequestWasCapped = cappedUserRequest !== originalUserText;

  const working = cloneLocalToolResultsForAgentLoop(localToolResults);
  const originalPayloadChars = agentLoopContinuationPayloadJson(cappedUserRequest, working, step).length;
  if (originalPayloadChars <= charBudget) {
    if (userRequestWasCapped) {
      recordMetric({
        id: 'ai.local_tool_result_truncated',
        value: 1,
        tags: createMetricTags('localContextTools', {
          scope: 'agent_loop',
          payloadChars: originalPayloadChars,
        }),
      });
    }
    return {
      payloadJson: agentLoopContinuationPayloadJson(cappedUserRequest, working, step),
      truncated: userRequestWasCapped,
      originalPayloadChars,
      cappedUserRequest,
    };
  }

  let truncated = userRequestWasCapped;
  let steps = 0;
  while (
    agentLoopContinuationPayloadJson(cappedUserRequest, working, step).length > charBudget
    && steps < AI_AGENT_LOOP_PAYLOAD_SHRINK_MAX_STEPS
  ) {
    steps += 1;
    truncated = true;
    if (truncateMatchTranscriptionsForAgentLoop(working)) continue;
    if (popLongestMatchesRowForAgentLoop(working)) continue;
    break;
  }

  if (agentLoopContinuationPayloadJson(cappedUserRequest, working, step).length > charBudget) {
    truncated = true;
    truncateDeepStringsForAgentLoop(working, AI_AGENT_LOOP_DEEP_STRING_MAX_CHARS_PASS1);
  }
  if (agentLoopContinuationPayloadJson(cappedUserRequest, working, step).length > charBudget) {
    truncateDeepStringsForAgentLoop(working, AI_AGENT_LOOP_DEEP_STRING_MAX_CHARS_PASS2);
  }

  const finalJson = agentLoopContinuationPayloadJson(cappedUserRequest, working, step);
  if (finalJson.length > charBudget) {
    truncated = true;
    const minimal: LocalContextToolResult[] = working.map((r) => ({
      ok: r.ok,
      name: r.name,
      result: r.ok ? { _agentLoopPayloadTooLarge: true, tool: r.name } : r.result,
      ...(r.error !== undefined ? { error: r.error } : {}),
    }));
    const fallbackJson = agentLoopContinuationPayloadJson(cappedUserRequest, minimal, step);
    recordMetric({
      id: 'ai.local_tool_result_truncated',
      value: 1,
      tags: createMetricTags('localContextTools', {
        scope: 'agent_loop',
        payloadChars: originalPayloadChars,
      }),
    });
    return { payloadJson: fallbackJson, truncated, originalPayloadChars, cappedUserRequest };
  }

  if (truncated) {
    recordMetric({
      id: 'ai.local_tool_result_truncated',
      value: 1,
      tags: createMetricTags('localContextTools', {
        scope: 'agent_loop',
        payloadChars: originalPayloadChars,
      }),
    });
  }

  return { payloadJson: finalJson, truncated, originalPayloadChars, cappedUserRequest };
}

export function buildLocalContextToolGuide(): string {
  return [
    'Query tools (auto-executed, use freely even for questions — preferred over guessing):',
    '- Successful tool JSON includes `_readModel`: { timelineReadModelEpoch?, unitIndexComplete, capturedAtMs, indexRowCount? } — system metadata for snapshot freshness; do not treat as transcript content.',
    '- list_units(arguments:{"limit":8,"offset":0,"sort":"time_asc","resultHandle":"..."}): Project-scope list; returns {total,count,offset,limit,sort,matches,_readModel}. When total rows exceed 50, response includes resultHandle + snapshotPaging:true — reuse the same resultHandle with offset/limit for additional pages until the handle expires (~15m) or timeline epoch changes (then stale_list_handle; call list_units again without resultHandle).',
    '- search_units(arguments:{"query":"...","limit":5}): Project-scope substring search; returns {query,count,matches,_readModel}; empty query => {mode:"list_fallback",...,_readModel}',
    '- get_unit_detail(arguments:{"unitId":"..."}): Project-scope unit detail by id (+ `_readModel` on success)',
    '- get_current_selection(arguments:{}): Current selection/track snapshot; includes projectUnitCount for total-project baseline (+ `_readModel`)',
    '- get_project_stats(arguments:{}): Project stats (+ `_readModel`; stats fields unchanged)',
    '- get_waveform_analysis(arguments:{}): Current track waveform analysis summary (+ `_readModel`)',
    '- get_acoustic_summary(arguments:{}): Current selection acoustic summary (+ `_readModel`)',
    '- find_incomplete_units(arguments:{"limit":12}): High-order query for units not yet verified (+ `_readModel`)',
    '- diagnose_quality(arguments:{}): Aggregated quality report for missing text/speaker/gaps (+ `_readModel`)',
    '- batch_apply(arguments:{"action":"...","unitIds":["..."]}): Batch preview contract for the same action across many units (+ `_readModel`)',
    '- suggest_next_action(arguments:{}): Ranked next-step recommendations from current project state (+ `_readModel`)',
    `- Tool JSON payloads may be truncated at ${LOCAL_TOOL_RESULT_CHAR_BUDGET} chars; treat omitted tail as unknown and do not fabricate missing values`,
  ].join('\n');
}
