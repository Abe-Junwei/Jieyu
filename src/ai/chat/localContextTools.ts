import type { TimelineUnitView } from '../../hooks/timelineUnitView';
import type { AiPromptContext } from './chatDomain.types';
import { extractJsonCandidates } from './toolCallSchemas';

export type LocalContextToolName =
  | 'get_current_selection'
  | 'get_project_stats'
  | 'get_waveform_analysis'
  | 'get_acoustic_summary'
  | 'list_units'
  | 'search_units'
  | 'get_unit_detail'
  | 'list_utterances'
  | 'search_utterances'
  | 'get_utterance_detail';

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
  'list_units',
  'search_units',
  'get_unit_detail',
  'list_utterances',
  'search_utterances',
  'get_utterance_detail',
]);

function canonicalToolName(name: LocalContextToolName): LocalContextToolName {
  switch (name) {
    case 'list_utterances':
      return 'list_units';
    case 'search_utterances':
      return 'search_units';
    case 'get_utterance_detail':
      return 'get_unit_detail';
    default:
      return name;
  }
}

function normalizeToolName(name: string): LocalContextToolName | null {
  const normalized = name.trim().toLowerCase();
  return LOCAL_CONTEXT_TOOL_NAMES.has(normalized as LocalContextToolName)
    ? (normalized as LocalContextToolName)
    : null;
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
          const rawArgs = holder.arguments;
          const args = typeof rawArgs === 'object' && rawArgs !== null && !Array.isArray(rawArgs)
            ? rawArgs as Record<string, unknown>
            : {};
          parsedCalls.push({ name: normalized, arguments: args });
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
  return {
    name: normalized,
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

function normalizeOffset(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(500, Math.max(0, Math.floor(value)));
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.min(500, Math.max(0, Math.floor(parsed)));
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
  const rows = context.shortTerm?.localUnitIndex ?? context.shortTerm?.localUtteranceIndex;
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

async function listUnits(context: AiPromptContext, args: Record<string, unknown>): Promise<LocalContextToolResult> {
  const rows = loadNormalizedUnitRows(context);
  if (rows.length === 0) {
    return { ok: false, name: 'list_units', result: null, error: 'data_loading' };
  }
  const limit = normalizeLimit(args.limit, 8);
  const offset = normalizeOffset(args.offset, 0);
  const sort = normalizeTextValue(args.sort).toLowerCase() === 'time_desc' ? 'time_desc' : 'time_asc';

  const normalized = [...rows].sort((a, b) => (sort === 'time_desc' ? b.startTime - a.startTime : a.startTime - b.startTime));
  const matches = normalized.slice(offset, offset + limit);

  return {
    ok: true,
    name: 'list_units',
    result: {
      count: matches.length,
      total: normalized.length,
      offset,
      limit,
      sort,
      matches,
    },
  };
}

async function getUnitDetail(args: Record<string, unknown>, context: AiPromptContext): Promise<LocalContextToolResult> {
  const unitId = normalizeTextValue(args.unitId || args.utteranceId);
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

export async function executeLocalContextToolCall(
  call: LocalContextToolCall,
  context: AiPromptContext | null,
  callCountRef: { current: number },
  maxCalls = 20,
): Promise<LocalContextToolResult> {
  const resolvedCall: LocalContextToolCall = {
    ...call,
    name: canonicalToolName(call.name),
  };
  if (!context) {
    return {
      ok: false,
      name: resolvedCall.name,
      result: null,
      error: 'context is unavailable',
    };
  }

  if (callCountRef.current >= maxCalls) {
    return {
      ok: false,
      name: resolvedCall.name,
      result: null,
      error: 'local tool call limit exceeded',
    };
  }
  callCountRef.current += 1;

  switch (resolvedCall.name) {
    case 'get_current_selection': {
      const { localUnitIndex: _stripped, localUtteranceIndex: _strippedLegacy, ...visibleShortTerm } = context.shortTerm ?? {};
      return {
        ok: true,
        name: resolvedCall.name,
        result: {
          ...visibleShortTerm,
          ...(context.longTerm?.projectStats?.unitCount !== undefined
            ? { projectUnitCount: context.longTerm.projectStats.unitCount, projectUtteranceCount: context.longTerm.projectStats.unitCount }
            : context.longTerm?.projectStats?.utteranceCount !== undefined
              ? {
                  projectUnitCount: context.longTerm.projectStats.utteranceCount,
                  projectUtteranceCount: context.longTerm.projectStats.utteranceCount,
                }
            : {}),
        },
      };
    }
    case 'get_project_stats':
      return { ok: true, name: call.name, result: context.longTerm?.projectStats ?? null };
    case 'get_waveform_analysis':
      return { ok: true, name: call.name, result: context.longTerm?.waveformAnalysis ?? null };
    case 'get_acoustic_summary':
      return { ok: true, name: call.name, result: context.longTerm?.acousticSummary ?? null };
    case 'list_units':
      return {
        ...(await listUnits(context, resolvedCall.arguments)),
        name: call.name,
      };
    case 'search_units':
      return {
        ...(await searchUnits(context, resolvedCall.arguments)),
        name: call.name,
      };
    case 'get_unit_detail':
      return {
        ...(await getUnitDetail(resolvedCall.arguments, context)),
        name: call.name,
      };
    default:
      return {
        ok: false,
        name: resolvedCall.name,
        result: null,
        error: `unsupported local context tool: ${resolvedCall.name}`,
      };
  }
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

const TOOL_RESULT_TRUNCATION_WARNING = '\n[DATA TRUNCATED — do NOT fabricate missing items. Tell the user that the full list is too long and suggest using more specific queries or smaller limit/offset.]';

function scopeLabelByToolName(name: LocalContextToolName): string {
  switch (name) {
    case 'list_units':
    case 'search_units':
    case 'get_unit_detail':
    case 'list_utterances':
    case 'search_utterances':
    case 'get_utterance_detail':
    case 'get_project_stats':
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
  const truncated = payload.length > 2000;
  const limitedPayload = truncated ? `${payload.slice(0, 2000)}...` : payload;
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
  const truncated = payload.length > 2000;
  const limitedPayload = truncated ? `${payload.slice(0, 2000)}...` : payload;
  return [
    'Local context tool batch executed [scope: mixed]',
    '```json',
    limitedPayload,
    '```',
    ...(truncated ? [TOOL_RESULT_TRUNCATION_WARNING] : []),
  ].join('\n');
}

export function buildLocalContextToolGuide(): string {
  return [
    'Query tools (auto-executed, use freely even for questions — preferred over guessing):',
    '- list_units(arguments:{"limit":8,"offset":0,"sort":"time_asc"}): Project-scope list; returns {total,count(page size),offset,limit,sort,matches}',
    '- search_units(arguments:{"query":"...","limit":5}): Project-scope substring search; returns {query,count,matches}; empty query => {mode:"list_fallback",...list_units_result}',
    '- get_unit_detail(arguments:{"unitId":"..."}): Project-scope unit detail by id',
    '- get_current_selection(arguments:{}): Current selection/track snapshot; includes projectUnitCount for total-project baseline',
    '- get_project_stats(arguments:{}): Project stats ({unitCount,translationLayerCount,aiConfidenceAvg})',
    '- get_waveform_analysis(arguments:{}): Current track waveform analysis summary',
    '- get_acoustic_summary(arguments:{}): Current selection acoustic summary',
    '- Compatibility aliases still accepted for one transition cycle: list_utterances/search_utterances/get_utterance_detail',
    '- Tool JSON payloads may be truncated at 2000 chars; treat omitted tail as unknown and do not fabricate missing values',
  ].join('\n');
}
