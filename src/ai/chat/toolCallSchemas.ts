/**
 * Zod schemas for tool call argument validation.
 * Replaces manual JSON extraction + type guards with structured validation.
 */
import { z } from 'zod';

// ─── Shared primitives ────────────────────────────────────────────────────────

const IdString = z.string().trim().min(1, 'ID 不能为空').max(128);
const TextString = z.string().trim().min(1, '文本不能为空').max(5000);
const AMBIGUOUS_LANGUAGE_TARGETS = ['und', 'unknown', 'auto', 'default'];
const LanguageId = z.string().trim().min(1).max(32).superRefine((val, ctx) => {
  if (AMBIGUOUS_LANGUAGE_TARGETS.includes(val.toLowerCase())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'languageId 不能是 und/unknown/auto/default，请提供明确语言。' });
  }
});
const Alias = z.string().trim().max(64).optional();
const Modality = z.enum(['text', 'audio', 'mixed']).optional();
const SplitTime = z.number().finite().nonnegative().optional();
const LayerType = z.enum(['translation', 'transcription']).optional();
const LanguageQuery = z.string().trim().min(1).max(32).optional();
const Form = z.string().trim().min(1).max(128).optional();
const Pos = z.string().trim().min(1).max(32).optional();
const Gloss = z.string().trim().max(256).optional();

// ─── Per-tool argument schemas ────────────────────────────────────────────────

export const createTranscriptionSegmentSchema = z.object({
  utteranceId: IdString,
});

export const splitTranscriptionSegmentSchema = z.object({
  utteranceId: IdString,
  splitTime: SplitTime,
});

export const deleteTranscriptionSegmentSchema = z.object({
  utteranceId: IdString,
});

export const clearTranslationSegmentSchema = z.object({
  utteranceId: IdString,
  layerId: IdString,
});

export const setTranscriptionTextSchema = z.object({
  utteranceId: IdString,
  text: TextString,
});

export const setTranslationTextSchema = z.object({
  utteranceId: IdString,
  layerId: IdString,
  text: TextString,
});

export const createTranscriptionLayerSchema = z.object({
  languageId: LanguageId,
  alias: Alias,
});

export const createTranslationLayerSchema = z.object({
  languageId: LanguageId,
  alias: Alias,
  modality: Modality,
});

export const deleteLayerSchema = z.object({
  layerId: IdString.optional(),
  layerType: LayerType,
  languageQuery: LanguageQuery,
}).superRefine((args, ctx) => {
  const hasLayerId = Boolean(args.layerId);
  const hasTypeAndQuery = Boolean(args.layerType) && Boolean(args.languageQuery);
  if (!hasLayerId && !hasTypeAndQuery) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: '需要 layerId，或同时提供 layerType + languageQuery',
    });
  }
});

export const linkTranslationLayerSchema = z.object({
  transcriptionLayerId: IdString.optional(),
  transcriptionLayerKey: z.string().optional(),
  translationLayerId: IdString.optional(),
  layerId: IdString.optional(),
}).superRefine((args, ctx) => {
  const hasTranscription = Boolean(args.transcriptionLayerId) || Boolean(args.transcriptionLayerKey);
  const hasTranslation = Boolean(args.translationLayerId) || Boolean(args.layerId);
  if (!hasTranscription) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '缺少 transcriptionLayerId/transcriptionLayerKey' });
  }
  if (!hasTranslation) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '缺少 translationLayerId/layerId' });
  }
});

export const unlinkTranslationLayerSchema = z.object({
  transcriptionLayerId: IdString.optional(),
  transcriptionLayerKey: z.string().optional(),
  translationLayerId: IdString.optional(),
  layerId: IdString.optional(),
}).superRefine((args, ctx) => {
  const hasTranscription = Boolean(args.transcriptionLayerId) || Boolean(args.transcriptionLayerKey);
  const hasTranslation = Boolean(args.translationLayerId) || Boolean(args.layerId);
  if (!hasTranscription) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '缺少 transcriptionLayerId/transcriptionLayerKey' });
  }
  if (!hasTranslation) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '缺少 translationLayerId/layerId' });
  }
});

export const autoGlossUtteranceSchema = z.object({
  utteranceId: IdString,
});

export const setTokenPosSchema = z.object({
  tokenId: IdString.optional(),
  utteranceId: IdString.optional(),
  form: Form.optional(),
  pos: Pos.optional(),
}).superRefine((args, ctx) => {
  const hasTokenId = Boolean(args.tokenId);
  const hasBatch = Boolean(args.utteranceId) && Boolean(args.form) && Boolean(args.pos);
  if (!hasTokenId && !hasBatch) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: '需要 tokenId，或同时提供 utteranceId + form + pos',
    });
  }
});

export const setTokenGlossSchema = z.object({
  tokenId: IdString,
  gloss: Gloss,
  lang: z.string().trim().max(8).optional(),
});

// ─── No-argument tools ────────────────────────────────────────────────────────

const NoArgs = z.object({}).strict();

const NAV_TARGET_SCHEMA = z.object({ segmentIndex: z.number().int().nonnegative() });
const TIME_TARGET_SCHEMA = z.object({ timeSeconds: z.number().finite().nonnegative() });
const SEGMENT_TARGET_SCHEMA = z.object({ segmentId: IdString });
const START_TIME_SCHEMA = z.object({ startTime: z.number().finite().nonnegative().optional() });
const SEARCH_SEGMENTS_SCHEMA = z.object({
  query: TextString,
  layers: z.array(z.enum(['transcription', 'translation', 'gloss'])).optional(),
});
const OPTIONAL_SEGMENT_TARGET_SCHEMA = z.object({ segmentId: IdString.optional() });
const SEGMENT_OR_UTTERANCE_TARGET_SCHEMA = z.object({
  segmentId: IdString.optional(),
  utteranceId: IdString.optional(),
}).superRefine((args, ctx) => {
  if (!args.segmentId && !args.utteranceId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '需要 segmentId 或 utteranceId。' });
  }
});

// ─── Schema map ──────────────────────────────────────────────────────────────

export const toolArgumentSchemas = {
  create_transcription_segment: createTranscriptionSegmentSchema,
  split_transcription_segment: splitTranscriptionSegmentSchema,
  delete_transcription_segment: deleteTranscriptionSegmentSchema,
  clear_translation_segment: clearTranslationSegmentSchema,
  set_transcription_text: setTranscriptionTextSchema,
  set_translation_text: setTranslationTextSchema,
  create_transcription_layer: createTranscriptionLayerSchema,
  create_translation_layer: createTranslationLayerSchema,
  delete_layer: deleteLayerSchema,
  link_translation_layer: linkTranslationLayerSchema,
  unlink_translation_layer: unlinkTranslationLayerSchema,
  auto_gloss_utterance: autoGlossUtteranceSchema,
  set_token_pos: setTokenPosSchema,
  set_token_gloss: setTokenGlossSchema,
  play_pause: NoArgs,
  undo: NoArgs,
  redo: NoArgs,
  search_segments: SEARCH_SEGMENTS_SCHEMA,
  toggle_notes: NoArgs,
  mark_segment: OPTIONAL_SEGMENT_TARGET_SCHEMA,
  delete_segment: OPTIONAL_SEGMENT_TARGET_SCHEMA,
  auto_gloss_segment: SEGMENT_OR_UTTERANCE_TARGET_SCHEMA,
  auto_translate_segment: SEGMENT_OR_UTTERANCE_TARGET_SCHEMA,
  nav_to_segment: NAV_TARGET_SCHEMA,
  nav_to_time: TIME_TARGET_SCHEMA,
  focus_segment: SEGMENT_TARGET_SCHEMA,
  zoom_to_segment: z.object({ segmentId: IdString, zoomLevel: z.number().int().min(1).max(20).optional() }),
  split_at_time: TIME_TARGET_SCHEMA,
  merge_prev: OPTIONAL_SEGMENT_TARGET_SCHEMA,
  merge_next: OPTIONAL_SEGMENT_TARGET_SCHEMA,
  auto_segment: START_TIME_SCHEMA,
  suggest_segment_improvement: SEGMENT_OR_UTTERANCE_TARGET_SCHEMA,
  analyze_segment_quality: SEGMENT_OR_UTTERANCE_TARGET_SCHEMA,
  get_current_segment: NoArgs,
  get_project_summary: NoArgs,
  get_recent_history: NoArgs,
} as const;

// ─── JSON extraction helpers ──────────────────────────────────────────────────

/**
 * Extract the first balanced JSON object from text.
 * Falls back gracefully when the model outputs partial JSON mid-stream.
 */
export function extractFirstBalancedJson(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.includes('{')) return null;

  for (let start = 0; start < trimmed.length; start++) {
    if (trimmed[start] !== '{') continue;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let cursor = start; cursor < trimmed.length; cursor++) {
      const ch = trimmed[cursor]!;

      if (escaped) {
        escaped = false;
        continue;
      }

      if (ch === '\\') {
        escaped = true;
        continue;
      }

      if (ch === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          return trimmed.slice(start, cursor + 1);
        }
      }
    }
    break;
  }

  return null;
}

/**
 * Extract all JSON candidates: direct text, balanced objects, and code-fence blocks.
 */
export function extractJsonCandidates(text: string): string[] {
  const candidates: string[] = [];
  const trimmed = text.trim();

  // 1. The text itself if it looks like JSON
  if (trimmed.startsWith('{')) {
    candidates.push(trimmed);
  }

  // 2. Balanced JSON objects found inline
  const balanced = extractFirstBalancedJson(trimmed);
  if (balanced && balanced !== trimmed) {
    candidates.push(balanced);
  }

  // 3. Code fence blocks
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match = fenceRegex.exec(trimmed);
  while (match) {
    const content = (match[1] ?? '').trim();
    if (content) candidates.push(content);
    match = fenceRegex.exec(trimmed);
  }

  return candidates;
}

// ─── Top-level parse ─────────────────────────────────────────────────────────

interface ToolCallParseResult {
  name: string;
  arguments: Record<string, unknown>;
}

export function parseToolCallFromTextZod(
  rawText: string,
  normalizeNameFn: (name: string) => string | null,
): { name: string; arguments: Record<string, unknown> } | null {
  const candidates = extractJsonCandidates(rawText);

  for (const candidate of candidates) {
    // Try direct parse first (most common case: clean JSON without extra text)
    const direct = tryParseCandidate(candidate, normalizeNameFn);
    if (direct) return direct;
  }

  return null;
}

function tryParseCandidate(
  candidate: string,
  normalizeNameFn: (name: string) => string | null,
): ToolCallParseResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return null;
  }

  // Unwrap { tool_call: { name, arguments } } if present
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'tool_call' in parsed
  ) {
    const holder = (parsed as { tool_call: unknown }).tool_call;
    if (typeof holder !== 'object' || holder === null) return null;
    parsed = holder;
  }

  if (typeof parsed !== 'object') return null;

  const obj = parsed as Record<string, unknown>;

  const rawName = typeof obj.name === 'string' ? obj.name : null;
  if (!rawName) return null;

  const normalizedName = normalizeNameFn(rawName);
  if (!normalizedName) return null;

  const rawArgs = obj.arguments;
  const args: Record<string, unknown> =
    typeof rawArgs === 'object' && rawArgs !== null && !Array.isArray(rawArgs)
      ? rawArgs as Record<string, unknown>
      : {};

  return { name: normalizedName, arguments: args };
}

/**
 * Validate parsed tool call arguments against the zod schema for that tool.
 * Returns null on success, or an error message string on failure.
 * Returns null for unknown tools (no schema defined) so the legacy path handles them.
 */
export function validateToolArgumentsZod(
  name: string,
  args: Record<string, unknown>,
): string | null {
  const schema = toolArgumentSchemas[name as keyof typeof toolArgumentSchemas];
  if (!schema) return null; // Unknown tool — let legacy validator decide
  const result = schema.safeParse(args);
  if (result.success) return null;
  return result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
}
