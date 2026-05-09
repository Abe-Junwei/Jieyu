import { extractJsonCandidates } from './toolCallSchemas';
import { AI_LOCAL_TOOL_RESULT_CHAR_BUDGET } from '../../hooks/useAiChat.config';
import type { LocalContextToolCall, LocalContextToolName } from './localContextToolTypes';

export type {
  LocalContextToolCall,
  LocalContextToolResult,
  LocalToolExecutionTraceOptions,
} from './localContextToolTypes';

const LOCAL_CONTEXT_TOOL_NAMES = new Set<LocalContextToolName>([
  'get_current_selection',
  'list_layers',
  'list_layer_links',
  'get_unsaved_drafts',
  'list_speakers',
  'list_notes',
  'list_notes_detail',
  'get_visible_timeline_state',
  'get_speaker_breakdown',
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
  'get_unit_linguistic_memory',
]);

function normalizeToolName(name: string): LocalContextToolName | null {
  const normalized = name.trim().toLowerCase();
  if (LOCAL_CONTEXT_TOOL_NAMES.has(normalized as LocalContextToolName)) {
    return normalized as LocalContextToolName;
  }
  return null;
}

function toToolCallCandidate(
  rawText: string,
): { name: string; arguments: Record<string, unknown> } | null {
  const candidates = extractJsonCandidates(rawText);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const holder =
        typeof parsed.tool_call === 'object' && parsed.tool_call !== null
          ? (parsed.tool_call as Record<string, unknown>)
          : parsed;

      const rawName = typeof holder.name === 'string' ? holder.name : null;
      if (!rawName) continue;
      const rawArgs = holder.arguments;
      const args =
        typeof rawArgs === 'object' && rawArgs !== null && !Array.isArray(rawArgs)
          ? (rawArgs as Record<string, unknown>)
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
          const args =
            typeof rawArgs === 'object' && rawArgs !== null && !Array.isArray(rawArgs)
              ? (rawArgs as Record<string, unknown>)
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

export { executeLocalContextToolCall } from './localContextToolExecutors';
export {
  formatLocalContextToolResultMessage,
  formatLocalContextToolBatchResultMessage,
  buildAgentLoopContinuationToolPayload,
} from './localContextToolFormatters';
export { AI_LOCAL_TOOL_RESULT_CHAR_BUDGET as LOCAL_TOOL_RESULT_CHAR_BUDGET } from '../../hooks/useAiChat.config';

export function buildLocalContextToolGuide(): string {
  return [
    'Query tools (auto-executed, use freely even for questions — preferred over guessing):',
    '- Successful tool JSON includes `_readModel`: { timelineReadModelEpoch?, unitIndexComplete, capturedAtMs, indexRowCount? } — system metadata for snapshot freshness; do not treat as transcript content.',
    '- list_units(arguments:{"limit":8,"offset":0,"sort":"time_asc","scope":"current_scope|current_track|project","resultHandle":"..."}): Scoped list; returns {scope,total,count,offset,limit,sort,matches,_readModel}. When total rows exceed 50, response includes resultHandle + snapshotPaging:true — reuse the same resultHandle with offset/limit for additional pages until the handle expires (~15m) or timeline epoch changes (then stale_list_handle; call list_units again without resultHandle).',
    '- search_units(arguments:{"query":"...","limit":5,"scope":"current_scope|current_track|project","speakerId":"...","noteCategory":"todo|question|comment|correction|linguistic|fieldwork","selfCertainty":"certain|uncertain|guess","annotationStatus":"raw|transcribed|translated|glossed|verified","hasText":true}): Scoped search; for current_scope it prefers the segment_meta read model and supports structured filters. Returns {scope,query,count,matches,_readModel}; empty query without filters => {mode:"list_fallback",...,_readModel}',
    '- get_unit_detail(arguments:{"unitId":"...","scope":"current_scope|current_track|project"}): Scoped unit detail by id (+ `_readModel` on success)',
    '- get_unit_linguistic_memory(arguments:{"unitId":"...","scope":"current_scope|current_track|project","includeNotes":true,"includeMorphemes":true}): Deep per-unit memory snapshot (sentence transcriptions/translations + token/morpheme gloss/POS + annotation notes) (+ `_readModel` on success)',
    '- get_current_selection(arguments:{}): Current selection/track snapshot; includes currentScopeUnitCount/currentMediaUnitCount plus projectUnitCount baseline (+ `_readModel`)',
    '- list_layers(arguments:{"layerType":"transcription|translation"}): Structured workspace layer list with ids, labels, language/modality, selected/active/default flags, and per-layer row counts (+ `_readModel`)',
    '- list_layer_links(arguments:{}): Translation/transcription host link list; use when users ask which translation layer is connected to which transcription layer (+ `_readModel`)',
    '- get_unsaved_drafts(arguments:{}): Unsaved unit/translation drafts currently visible in the workspace; use when users ask whether new edits are visible before save (+ `_readModel`)',
    '- list_speakers(arguments:{}): Current speaker list in workspace context; returns ids/names/colors when available (+ `_readModel`)',
    '- list_notes(arguments:{}): Current note summary (count, category histogram, focused layer/target hints) for visible context (+ `_readModel`)',
    '- list_notes_detail(arguments:{"limit":20,"scope":"current_scope|current_track|project","category":"todo|question|comment|correction|linguistic|fieldwork"}): Recent `user_notes` rows tied to timeline units in scope (newest first; capped scan). When `localUnitIndex` is empty, uses the same scoped `segment_meta` path as `list_units` for ids, then `_readModel.source` is `segment_meta`. (+ `_readModel`)',
    '- get_visible_timeline_state(arguments:{}): Visible timeline state snapshot (media, layers, selection, layout mode, zoom/ruler sample, speaker filter/track-lock hints) (+ `_readModel`)',
    '- get_speaker_breakdown(arguments:{"scope":"current_scope|current_track|project"}): Per-speaker row counts from the timeline read model for the requested scope (+ `_readModel`)',
    '- get_project_stats(arguments:{}): Authoritative project-wide counts (e.g. units; + `_readModel`; stats fields unchanged). Prefer this (or list_units) when the user asks how many segments/units exist in the project.',
    '- get_waveform_analysis(arguments:{}): Current-track waveform quality summary; trackGaps are silence/gap regions on the analysis timeline, not project unit totals (+ `_readModel`)',
    '- get_acoustic_summary(arguments:{}): Current selection acoustic summary (+ `_readModel`)',
    '- find_incomplete_units(arguments:{"limit":12}): High-order query for units not yet verified (+ `_readModel`)',
    '- diagnose_quality(arguments:{}): Aggregated quality report for missing text/speaker/gaps (+ `_readModel`)',
    '- batch_apply(arguments:{"action":"...","unitIds":["..."]}): Batch preview contract for the same action across many units (+ `_readModel`)',
    '- suggest_next_action(arguments:{}): Ranked next-step recommendations from current project state (+ `_readModel`)',
    `- Tool JSON payloads may be truncated at ${AI_LOCAL_TOOL_RESULT_CHAR_BUDGET} chars; treat omitted tail as unknown and do not fabricate missing values`,
    "- User-facing natural language: never echo the snake_case tool names above; describe actions in the user's language. JSON tool_call names stay machine-only.",
    '- Query economy: if the last local tool JSON already answered the same scope/params, do not issue an equivalent read again unless [CONTEXT] changed, the prior payload was truncated, or you need a strictly different field.',
    '- If the user quoted exact text, ids, or times for set_transcription_text/set_translation_text/etc., copy them verbatim into tool_call arguments.',
  ].join('\n');
}
