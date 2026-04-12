import { getDb } from '../../db';
import type { AiPromptContext } from '../../hooks/useAiChat.types';
import { extractJsonCandidates } from './toolCallSchemas';

export type LocalContextToolName =
  | 'get_current_selection'
  | 'get_project_stats'
  | 'get_waveform_analysis'
  | 'get_acoustic_summary'
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
  'search_utterances',
  'get_utterance_detail',
]);

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

function pickDefaultTranscriptionText(transcription: unknown): string {
  if (!transcription || typeof transcription !== 'object') return '';
  const record = transcription as Record<string, unknown>;
  const direct = normalizeTextValue(record.default);
  if (direct.length > 0) return direct;
  for (const value of Object.values(record)) {
    const next = normalizeTextValue(value);
    if (next.length > 0) return next;
  }
  return '';
}

async function searchUtterances(context: AiPromptContext, args: Record<string, unknown>): Promise<LocalContextToolResult> {
  const query = normalizeTextValue(args.query);
  if (query.length === 0) {
    return {
      ok: false,
      name: 'search_utterances',
      result: [],
      error: 'query is required',
    };
  }

  const db = await getDb();
  const rows = await db.collections.utterances.find().exec();
  const lowered = query.toLowerCase();
  const limit = normalizeLimit(args.limit);

  const matches = rows
    .map((row) => ({
      id: row.id,
      textId: row.textId,
      mediaId: row.mediaId,
      startTime: row.startTime,
      endTime: row.endTime,
      transcription: pickDefaultTranscriptionText((row as { transcription?: unknown }).transcription),
    }))
    .filter((row) => row.transcription.toLowerCase().includes(lowered))
    .sort((a, b) => a.startTime - b.startTime)
    .slice(0, limit);

  return {
    ok: true,
    name: 'search_utterances',
    result: {
      query,
      count: matches.length,
      matches,
    },
  };
}

async function getUtteranceDetail(args: Record<string, unknown>): Promise<LocalContextToolResult> {
  const utteranceId = normalizeTextValue(args.utteranceId);
  if (utteranceId.length === 0) {
    return {
      ok: false,
      name: 'get_utterance_detail',
      result: null,
      error: 'utteranceId is required',
    };
  }

  const db = await getDb();
  const row = await db.collections.utterances.findOne({ selector: { id: utteranceId } }).exec();
  if (!row) {
    return {
      ok: false,
      name: 'get_utterance_detail',
      result: null,
      error: `utterance not found: ${utteranceId}`,
    };
  }

  return {
    ok: true,
    name: 'get_utterance_detail',
    result: {
      id: row.id,
      textId: row.textId,
      mediaId: row.mediaId,
      startTime: row.startTime,
      endTime: row.endTime,
      speakerId: row.speakerId,
      annotationStatus: row.annotationStatus,
      transcription: pickDefaultTranscriptionText((row as { transcription?: unknown }).transcription),
    },
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

  switch (call.name) {
    case 'get_current_selection':
      return { ok: true, name: call.name, result: context.shortTerm ?? null };
    case 'get_project_stats':
      return { ok: true, name: call.name, result: context.longTerm?.projectStats ?? null };
    case 'get_waveform_analysis':
      return { ok: true, name: call.name, result: context.longTerm?.waveformAnalysis ?? null };
    case 'get_acoustic_summary':
      return { ok: true, name: call.name, result: context.longTerm?.acousticSummary ?? null };
    case 'search_utterances':
      return searchUtterances(context, call.arguments);
    case 'get_utterance_detail':
      return getUtteranceDetail(call.arguments);
    default:
      return {
        ok: false,
        name: call.name,
        result: null,
        error: `unsupported local context tool: ${call.name}`,
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

export function formatLocalContextToolResultMessage(result: LocalContextToolResult): string {
  const payload = result.ok
    ? JSON.stringify(result.result, null, 2)
    : JSON.stringify({ error: result.error ?? 'unknown_error', result: result.result }, null, 2);
  const limitedPayload = payload.length > 2000 ? `${payload.slice(0, 2000)}...` : payload;
  return [
    `Local context tool executed: ${result.name}`,
    '```json',
    limitedPayload,
    '```',
  ].join('\n');
}

export function formatLocalContextToolBatchResultMessage(results: LocalContextToolResult[]): string {
  const payload = JSON.stringify(results, null, 2);
  const limitedPayload = payload.length > 2000 ? `${payload.slice(0, 2000)}...` : payload;
  return [
    'Local context tool batch executed',
    '```json',
    limitedPayload,
    '```',
  ].join('\n');
}

export function buildLocalContextToolGuide(): string {
  return [
    'Local context tools (auto-executed, no confirmation):',
    '- get_current_selection(arguments:{}): Current selection context',
    '- get_project_stats(arguments:{}): Project stats',
    '- get_waveform_analysis(arguments:{}): Waveform analysis summary',
    '- get_acoustic_summary(arguments:{}): Acoustic summary',
    '- search_utterances(arguments:{"query":"...","limit":5}): Search utterances',
    '- get_utterance_detail(arguments:{"utteranceId":"..."}): Utterance detail',
  ].join('\n');
}
