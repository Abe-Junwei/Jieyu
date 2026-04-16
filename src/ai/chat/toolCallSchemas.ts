/**
 * Zod schemas for tool call argument validation.
 * Replaces manual JSON extraction + type guards with structured validation.
 */
import { z } from 'zod';
import { decodeEscapedUnicode } from '../../utils/decodeEscapedUnicode';

// ─── Shared primitives ────────────────────────────────────────────────────────

const IdString = z.string().trim().min(1, 'ID \u4e0d\u80fd\u4e3a\u7a7a').max(128);
const IdStringArray = z.array(IdString).min(1, '\u81f3\u5c11\u63d0\u4f9b 1 \u4e2a ID').max(200);
const TextString = z.string().trim().min(1, '\u6587\u672c\u4e0d\u80fd\u4e3a\u7a7a').max(5000);
const AMBIGUOUS_LANGUAGE_TARGETS = ['und', 'unknown', 'auto', 'default'];
const LanguageId = z.string().trim().min(1).max(32).superRefine((val, ctx) => {
  if (AMBIGUOUS_LANGUAGE_TARGETS.includes(val.toLowerCase())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'languageId \u4e0d\u80fd\u662f und/unknown/auto/default\uff0c\u8bf7\u63d0\u4f9b\u660e\u786e\u8bed\u8a00\u3002' });
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
const SegmentIndex = z.number().int().min(1).optional();
const SegmentPosition = z.enum(['last', 'previous', 'next', 'penultimate', 'middle']).optional();

const SegmentTargetShape = {
  segmentId: IdString.optional(),
  segmentIndex: SegmentIndex,
  segmentPosition: SegmentPosition,
} as const;

function refineSegmentTarget(
  args: {
    segmentId?: string | undefined;
    segmentIndex?: number | undefined;
    segmentPosition?: 'last' | 'previous' | 'next' | 'penultimate' | 'middle' | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  const hasIdTarget = Boolean(args.segmentId);
  const hasSelectorTarget = typeof args.segmentIndex === 'number' || Boolean(args.segmentPosition);
  if (!hasIdTarget && !hasSelectorTarget) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: '\u9700\u8981 segmentId / segmentIndex / segmentPosition \u4e4b\u4e00\u3002',
    });
  }
}

// ─── Per-tool argument schemas ────────────────────────────────────────────────

export const createTranscriptionSegmentSchema = z.object(SegmentTargetShape).superRefine(refineSegmentTarget);

export const splitTranscriptionSegmentSchema = z.object({
  ...SegmentTargetShape,
  splitTime: SplitTime,
}).superRefine(refineSegmentTarget);

export const mergeTranscriptionSegmentsSchema = z.object({
  segmentIds: IdStringArray.optional(),
}).superRefine((args, ctx) => {
  const targetCount = args.segmentIds?.length ?? 0;
  if (targetCount < 2) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: decodeEscapedUnicode('\u9700\u8981\u81f3\u5c11 2 \u4e2a\u53e5\u6bb5 ID \u624d\u80fd\u5408\u5e76\u3002'),
    });
  }
});

export const deleteTranscriptionSegmentSchema = z.object({
  ...SegmentTargetShape,
  segmentIds: IdStringArray.optional(),
  allSegments: z.boolean().optional(),
}).superRefine((args, ctx) => {
  const hasSingleTarget = Boolean(args.segmentId) || typeof args.segmentIndex === 'number' || Boolean(args.segmentPosition);
  const hasBatchTarget = Boolean(args.segmentIds?.length);
  const hasGlobalTarget = args.allSegments === true;
  if (!hasSingleTarget && !hasBatchTarget && !hasGlobalTarget) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: '\u9700\u8981 segmentId / segmentIds / allSegments \u4e4b\u4e00\u3002',
    });
  }
});

export const clearTranslationSegmentSchema = z.object({
  ...SegmentTargetShape,
  layerId: IdString,
}).superRefine(refineSegmentTarget);

export const setTranscriptionTextSchema = z.object({
  ...SegmentTargetShape,
  text: TextString,
}).superRefine(refineSegmentTarget);

export const setTranslationTextSchema = z.object({
  ...SegmentTargetShape,
  layerId: IdString,
  text: TextString,
}).superRefine(refineSegmentTarget);

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
      message: '\u9700\u8981 layerId\uff0c\u6216\u540c\u65f6\u63d0\u4f9b layerType + languageQuery',
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
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '\u7f3a\u5c11 transcriptionLayerId/transcriptionLayerKey' });
  }
  if (!hasTranslation) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '\u7f3a\u5c11 translationLayerId/layerId' });
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
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '\u7f3a\u5c11 transcriptionLayerId/transcriptionLayerKey' });
  }
  if (!hasTranslation) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '\u7f3a\u5c11 translationLayerId/layerId' });
  }
});

export const autoGlossUnitSchema = z.object(SegmentTargetShape).superRefine(refineSegmentTarget);

export const setTokenPosSchema = z.object({
  tokenId: IdString.optional(),
  unitId: IdString.optional(),
  form: Form.optional(),
  pos: Pos.optional(),
}).superRefine((args, ctx) => {
  const hasTokenId = Boolean(args.tokenId);
  const hasBatch = Boolean(args.unitId) && Boolean(args.form) && Boolean(args.pos);
  if (!hasTokenId && !hasBatch) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: '\u9700\u8981 tokenId\uff0c\u6216\u540c\u65f6\u63d0\u4f9b unitId + form + pos',
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
const SEARCH_SEGMENTS_SCHEMA = z.object({
  query: TextString,
  layers: z.array(z.enum(['transcription', 'translation', 'gloss'])).optional(),
});
const OPTIONAL_SEGMENT_TARGET_SCHEMA = z.object({ segmentId: IdString.optional() });
const SEGMENT_OR_UNIT_TARGET_SCHEMA = z.object({
  segmentId: IdString.optional(),
  unitId: IdString.optional(),
}).superRefine((args, ctx) => {
  if (!args.segmentId && !args.unitId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '\u9700\u8981 segmentId \u6216 unitId\u3002' });
  }
});

const proposeChangeItemSchema = z.object({
  tool: z.string().trim().min(1).max(64).optional(),
  name: z.string().trim().min(1).max(64).optional(),
  arguments: z.record(z.string(), z.unknown()).optional(),
}).superRefine((row, ctx) => {
  if (!row.tool && !row.name) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: decodeEscapedUnicode('\\u6bcf\\u6761 changes \\u9700\\u8981 tool \\u6216 name\\u3002'),
    });
  }
});

export const proposeChangesArgsSchema = z.object({
  description: z.string().trim().max(2000).optional(),
  changes: z.array(proposeChangeItemSchema).min(1).max(40),
  sourceEpoch: z.number().int().nonnegative().optional(),
});

// ─── Schema map ──────────────────────────────────────────────────────────────

export const toolArgumentSchemas = {
  create_transcription_segment: createTranscriptionSegmentSchema,
  split_transcription_segment: splitTranscriptionSegmentSchema,
  merge_transcription_segments: mergeTranscriptionSegmentsSchema,
  delete_transcription_segment: deleteTranscriptionSegmentSchema,
  clear_translation_segment: clearTranslationSegmentSchema,
  set_transcription_text: setTranscriptionTextSchema,
  set_translation_text: setTranslationTextSchema,
  create_transcription_layer: createTranscriptionLayerSchema,
  create_translation_layer: createTranslationLayerSchema,
  delete_layer: deleteLayerSchema,
  link_translation_layer: linkTranslationLayerSchema,
  unlink_translation_layer: unlinkTranslationLayerSchema,
  auto_gloss_unit: autoGlossUnitSchema,
  set_token_pos: setTokenPosSchema,
  set_token_gloss: setTokenGlossSchema,
  propose_changes: proposeChangesArgsSchema,
  play_pause: NoArgs,
  undo: NoArgs,
  redo: NoArgs,
  search_segments: SEARCH_SEGMENTS_SCHEMA,
  toggle_notes: NoArgs,
  mark_segment: OPTIONAL_SEGMENT_TARGET_SCHEMA,
  delete_segment: OPTIONAL_SEGMENT_TARGET_SCHEMA,
  auto_gloss_segment: SEGMENT_OR_UNIT_TARGET_SCHEMA,
  nav_to_segment: NAV_TARGET_SCHEMA,
  nav_to_time: TIME_TARGET_SCHEMA,
  focus_segment: SEGMENT_TARGET_SCHEMA,
  zoom_to_segment: z.object({ segmentId: IdString, zoomLevel: z.number().int().min(1).max(20).optional() }),
  split_at_time: TIME_TARGET_SCHEMA,
  merge_prev: OPTIONAL_SEGMENT_TARGET_SCHEMA,
  merge_next: OPTIONAL_SEGMENT_TARGET_SCHEMA,
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
