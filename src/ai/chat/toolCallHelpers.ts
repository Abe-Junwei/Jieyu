import { featureFlags } from '../config/featureFlags';
import { resolveLanguageQuery } from '../../utils/langMapping';
import { buildAiToolRequestId } from '../toolRequestId';
import {
  formatActionClarify,
  formatNonActionFallback,
  formatTargetClarify,
  formatToolCancelledMessage,
  formatToolFailureMessage,
  formatToolGraySkippedMessage,
  formatToolPendingMessage,
  formatToolRollbackSkippedMessage,
  formatToolSuccessMessage,
} from '../messages';
import type { AiToolFeedbackStyle } from '../providers/providerCatalog';
import type {
  AiChatToolCall,
  AiChatToolName,
  AiClarifyCandidate,
  AiPromptContext,
  AiSessionMemory,
  AiToolDecisionMode,
  PreviewContract,
  UiChatMessage,
} from '../../hooks/useAiChat';
import type { Locale } from '../../i18n';
import {
  extractJsonCandidates,
  parseToolCallFromTextZod,
  validateToolArgumentsZod,
} from './toolCallSchemas';
import { decodeEscapedUnicode, escapedUnicodeRegExp } from '../../utils/decodeEscapedUnicode';

interface RawToolCallEnvelope {
  name: string;
  arguments: Record<string, unknown>;
}

export type ToolPlannerClarifyReason =
  | 'missing-utterance-target'
  | 'missing-split-position'
  | 'missing-translation-layer-target'
  | 'missing-layer-link-target'
  | 'missing-layer-target'
  | 'missing-language-target';

export type ToolPlannerDecision = 'resolved' | 'clarify';

export interface ToolPlannerResult {
  decision: ToolPlannerDecision;
  call: AiChatToolCall;
  reason?: ToolPlannerClarifyReason;
}

export type ToolIntentDecision = 'execute' | 'clarify' | 'ignore' | 'cancel';

export interface ToolIntentAssessment {
  decision: ToolIntentDecision;
  score: number;
  hasExecutionCue: boolean;
  hasActionVerb: boolean;
  hasActionTarget: boolean;
  hasExplicitId: boolean;
  hasMetaQuestion: boolean;
  hasTechnicalDiscussion: boolean;
}

export interface ToolIntentAssessmentOptions {
  allowDeicticExecution?: boolean;
}

export interface ToolAuditContext {
  userText: string;
  providerId: string;
  model: string;
  toolDecisionMode: AiToolDecisionMode;
  toolFeedbackStyle: AiToolFeedbackStyle;
  plannerDecision?: ToolPlannerDecision;
  plannerReason?: ToolPlannerClarifyReason;
  intentAssessment?: ToolIntentAssessment;
}

export interface ToolIntentAuditMetadata {
  schemaVersion: 1;
  phase: 'intent';
  requestId: string;
  assistantMessageId: string;
  toolCall: AiChatToolCall;
  context: ToolAuditContext;
}

export interface ToolDecisionAuditMetadata {
  schemaVersion: 1;
  phase: 'decision';
  requestId: string;
  assistantMessageId: string;
  source: 'human' | 'ai' | 'system';
  toolCall: AiChatToolCall;
  context: ToolAuditContext;
  executed: boolean;
  outcome: string;
  message?: string;
  reason?: string;
  durationMs?: number;
}

function normalizeToolCallName(rawName: string): AiChatToolName | null {
  const name = rawName.trim().toLowerCase();
  if (!name) return null;

  if (name === 'create_transcription_segment') return name;
  if (name === 'split_transcription_segment') return name;
  if (name === 'merge_transcription_segments') return name;
  if (name === 'delete_transcription_segment') return name;
  if (name === 'clear_translation_segment') return name;
  if (name === 'merge_prev') return name;
  if (name === 'merge_next') return name;
  if (['split_segment', 'split_transcription_row', 'split_row', 'split_utterance', 'cut_segment', 'split_current_segment'].includes(name)) return 'split_transcription_segment';
  if (['create_transcription_row', 'create_segment', 'new_segment', 'add_segment', 'new_transcription_row', 'add_transcription_row'].includes(name)) return 'create_transcription_segment';
  if (['merge_segments', 'merge_segment_selection', 'merge_selected_segments', 'merge_selected_transcription_segments', 'merge_transcription_segment_selection'].includes(name)) return 'merge_transcription_segments';
  if (['delete_transcription_row', 'remove_transcription_row', 'remove_utterance', 'delete_utterance', 'remove_row', 'delete_row', 'delete_segment', 'remove_segment'].includes(name)) return 'delete_transcription_segment';
  if (['delete_translation_row', 'clear_translation_text', 'clear_translation', 'empty_translation', 'remove_translation_text', 'clear_segment_translation'].includes(name)) return 'clear_translation_segment';
  if (name === 'set_transcription_text') return name;
  if (name === 'set_translation_text') return name;
  if (name === 'create_transcription_layer') return name;
  if (name === 'create_translation_layer') return name;
  if (name === 'delete_layer') return name;
  if (name === 'link_translation_layer') return name;
  if (name === 'unlink_translation_layer') return name;
  if (name === 'auto_gloss_utterance') return name;
  if (name === 'set_token_pos') return name;
  if (name === 'set_token_gloss') return name;

  if (['auto_gloss', 'auto_gloss_selected', 'gloss_utterance', 'auto_annotate'].includes(name)) {
    return 'auto_gloss_utterance';
  }

  if (['create_layer', 'new_layer', 'add_layer', 'new_transcription_layer', 'add_transcription_layer'].includes(name)) {
    return 'create_transcription_layer';
  }
  if (['new_translation_layer', 'add_translation_layer'].includes(name)) {
    return 'create_translation_layer';
  }
  if (['remove_layer', 'delete_translation_layer', 'delete_transcription_layer'].includes(name)) {
    return 'delete_layer';
  }
  if (['link_layer', 'create_layer_link', 'add_layer_link', 'connect_layers', 'toggle_layer_link'].includes(name)) {
    return 'link_translation_layer';
  }
  if (['unlink_layer', 'remove_layer_link', 'disconnect_layers'].includes(name)) {
    return 'unlink_translation_layer';
  }

  return null;
}

export function parseToolCallFromText(rawText: string): AiChatToolCall | null {
  const result = parseToolCallFromTextZod(rawText, normalizeToolCallName);
  if (!result) return null;
  return { name: result.name as AiChatToolName, arguments: result.arguments };
}

export function parseLegacyNarratedToolCall(text: string): AiChatToolCall | null {
  const patterns = [
    escapedUnicodeRegExp('\\u6211\\u8bc6\\u522b\\u5230\\u4f60\\u60f3\\u6267\\u884c[“\\”]([^”\\”]+)[“\\”]'),
    /I think you want to (?:run|use|execute) [“\']([^”\']+)[“\']/i,
    /you want to (?:run|use|execute) [“\']([^”\']+)[“\']/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const legacyName = match[1]?.trim() ?? '';
    const normalizedName = normalizeToolCallName(legacyName);
    if (!normalizedName) continue;
    return { name: normalizedName, arguments: {} };
  }
  return null;
}

function parseRawToolCallEnvelope(rawText: string): RawToolCallEnvelope | null {
  const candidates = extractJsonCandidates(rawText);
  for (const candidate of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }

    if (typeof parsed === 'object' && parsed !== null && 'tool_call' in parsed) {
      const holder = (parsed as { tool_call: unknown }).tool_call;
      if (typeof holder !== 'object' || holder === null) continue;
      parsed = holder;
    }

    if (typeof parsed !== 'object' || parsed === null) continue;
    const obj = parsed as Record<string, unknown>;
    const name = typeof obj.name === 'string' ? obj.name.trim() : '';
    if (!name) continue;
    const rawArgs = obj.arguments;
    const args = typeof rawArgs === 'object' && rawArgs !== null && !Array.isArray(rawArgs)
      ? rawArgs as Record<string, unknown>
      : {};
    return { name, arguments: args };
  }
  return null;
}

function inferFallbackActionLabel(userText: string, rawToolName: string): string {
  const trimmedUserText = userText.trim().replace(/[。！？!?]+$/u, '');
  if (trimmedUserText.length > 0 && trimmedUserText.length <= 24) {
    return trimmedUserText;
  }
  return rawToolName.replace(/_/g, ' ');
}

function looksLikeSegmentScopedTool(rawToolName: string, args: Record<string, unknown>): boolean {
  const normalizedName = rawToolName.toLowerCase();
  if (normalizedName.includes('segment') || normalizedName.includes('utterance') || normalizedName.includes('row')) {
    return true;
  }
  return [
    'segmentId',
    'segmentIds',
    'segmentIndex',
    'segmentPosition',
  ].some((key) => key in args);
}

const AMBIGUOUS_LANGUAGE_TARGET_PATTERN = /^(und|unknown|auto|default)$/i;

function isAmbiguousLanguageTarget(value: unknown): boolean {
  if (typeof value !== 'string') return true;
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  return AMBIGUOUS_LANGUAGE_TARGET_PATTERN.test(trimmed);
}

function requiresConcreteLanguageTarget(callName: AiChatToolName): boolean {
  return callName === 'create_transcription_layer' || callName === 'create_translation_layer';
}

function getFirstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return '';
}

function getNormalizedIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function getDeleteTargetIds(args: Record<string, unknown>): string[] {
  const ids = [
    ...getNormalizedIdList(args.segmentIds),
    ...(() => {
      const segmentId = getFirstNonEmptyString(args.segmentId);
      return segmentId ? [segmentId] : [];
    })(),
  ];
  return Array.from(new Set(ids));
}

function hasDeleteAllSegmentsScope(args: Record<string, unknown>): boolean {
  return args.allSegments === true;
}

function hasSegmentSelector(args: Record<string, unknown>): boolean {
  const segmentIndex = args.segmentIndex;
  if (typeof segmentIndex === 'number' && Number.isInteger(segmentIndex) && segmentIndex >= 1) {
    return true;
  }
  return typeof args.segmentPosition === 'string' && args.segmentPosition.length > 0;
}

function segmentSelectorNeedsAnchor(args: Record<string, unknown>): boolean {
  return args.segmentPosition === 'previous' || args.segmentPosition === 'next';
}

function parseChineseInteger(raw: string): number | null {
  const normalized = raw.trim().replace(/\u4e24/g, '\u4e8c');
  if (!normalized) return null;
  if (/^\d+$/.test(normalized)) return Number(normalized);

  const digitMap: Record<string, number> = {
    '\u4e00': 1,
    '\u4e8c': 2,
    '\u4e09': 3,
    '\u56db': 4,
    '\u4e94': 5,
    '\u516d': 6,
    '\u4e03': 7,
    '\u516b': 8,
    '\u4e5d': 9,
  };

  if (normalized === '\u5341') return 10;
  const parts = normalized.split('\u5341');
  if (parts.length === 2) {
    const tens = parts[0] ? (digitMap[parts[0]] ?? NaN) : 1;
    const ones = parts[1] ? (digitMap[parts[1]] ?? NaN) : 0;
    if (Number.isFinite(tens) && Number.isFinite(ones)) {
      return tens * 10 + ones;
    }
  }

  return digitMap[normalized] ?? null;
}

function parseEnglishOrdinal(raw: string): number | null {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;
  const wordMap: Record<string, number> = {
    first: 1,
    second: 2,
    third: 3,
    fourth: 4,
    fifth: 5,
    sixth: 6,
    seventh: 7,
    eighth: 8,
    ninth: 9,
    tenth: 10,
  };
  if (normalized in wordMap) return wordMap[normalized] ?? null;
  const parsed = Number(normalized.replace(/(?:st|nd|rd|th)$/i, ''));
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
}

const SEGMENT_NOUN_PATTERN = `(?:${decodeEscapedUnicode('\u53e5\u6bb5|\u5206\u6bb5|\u53e5\u5b50?|\u53e5|\u6bb5')}|segment|segments?)`;
const LAST_SEGMENT_PREFIX_PATTERN = decodeEscapedUnicode('\u6700\u540e(?:\u4e00[\u4e2a\u6761\u6bb5\u53e5]?|\u4e00\u4e2a)?');
const PREVIOUS_SEGMENT_PREFIX_PATTERN = decodeEscapedUnicode('\u524d\u4e00\u4e2a|\u4e0a\u4e00\u4e2a');
const NEXT_SEGMENT_PREFIX_PATTERN = decodeEscapedUnicode('\u540e\u4e00\u4e2a|\u4e0b\u4e00\u4e2a');
const PENULTIMATE_SEGMENT_PREFIX_PATTERN = decodeEscapedUnicode('\u5012\u6570\u7b2c\u4e8c(?:\u4e2a|\u6761|\u53e5|\u6bb5)?');
const MIDDLE_SEGMENT_PREFIX_PATTERN = decodeEscapedUnicode('\u4e2d\u95f4\u90a3(?:\u4e2a|\u6761|\u53e5|\u6bb5)|\u4e2d\u95f4(?:\u90a3)?\u4e2a');
const CHINESE_SEGMENT_ORDINAL_PATTERN = decodeEscapedUnicode('\u7b2c\\s*([0-9]+|[\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u4e24]+)\\s*(?:\u4e2a|\u6761|\u53e5|\u6bb5)?\\s*');

function extractSegmentSelectorFromUserText(userText: string): Record<string, unknown> | null {
  const normalizedText = userText.trim();
  if (!normalizedText) return null;

  if (new RegExp(`(${LAST_SEGMENT_PREFIX_PATTERN}|(?:the\\s+)?last)\\s*${SEGMENT_NOUN_PATTERN}`, 'i').test(normalizedText)) {
    return { segmentPosition: 'last' };
  }

  if (new RegExp(`(${PREVIOUS_SEGMENT_PREFIX_PATTERN}|(?:the\\s+)?previous|(?:the\\s+)?prev)\\s*${SEGMENT_NOUN_PATTERN}`, 'i').test(normalizedText)) {
    return { segmentPosition: 'previous' };
  }

  if (new RegExp(`(${NEXT_SEGMENT_PREFIX_PATTERN}|(?:the\\s+)?next)\\s*${SEGMENT_NOUN_PATTERN}`, 'i').test(normalizedText)) {
    return { segmentPosition: 'next' };
  }

  if (new RegExp(`(${PENULTIMATE_SEGMENT_PREFIX_PATTERN}|(?:the\\s+)?penultimate)\\s*${SEGMENT_NOUN_PATTERN}`, 'i').test(normalizedText)) {
    return { segmentPosition: 'penultimate' };
  }

  if (new RegExp(`(${MIDDLE_SEGMENT_PREFIX_PATTERN}|(?:the\\s+)?middle)\\s*${SEGMENT_NOUN_PATTERN}`, 'i').test(normalizedText)) {
    return { segmentPosition: 'middle' };
  }

  const chineseMatch = normalizedText.match(new RegExp(`${CHINESE_SEGMENT_ORDINAL_PATTERN}${SEGMENT_NOUN_PATTERN}?`, 'i'));
  if (chineseMatch?.[1]) {
    const parsed = parseChineseInteger(chineseMatch[1]);
    if (typeof parsed === 'number' && Number.isInteger(parsed) && parsed >= 1) {
      return { segmentIndex: parsed };
    }
  }

  const englishMatch = normalizedText.match(/(?:the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|\d+(?:st|nd|rd|th))\s+segments?/i);
  if (englishMatch?.[1]) {
    const ordinal = englishMatch[1].toLowerCase();
    if (ordinal === 'last') return { segmentPosition: 'last' };
    const parsed = parseEnglishOrdinal(ordinal);
    if (typeof parsed === 'number' && Number.isInteger(parsed) && parsed >= 1) {
      return { segmentIndex: parsed };
    }
  }

  return null;
}

function getContextUtteranceCount(context: AiPromptContext | null | undefined): number {
  const count = context?.longTerm?.projectStats?.utteranceCount;
  return typeof count === 'number' && Number.isFinite(count) && count >= 0 ? count : 0;
}

function describeDeleteSegmentSelectorTarget(args: Record<string, unknown>): string | null {
  const segmentIndex = args.segmentIndex;
  if (typeof segmentIndex === 'number' && Number.isInteger(segmentIndex) && segmentIndex >= 1) {
    return decodeEscapedUnicode(`\\u7b2c ${segmentIndex} \\u4e2a\\u53e5\\u6bb5`);
  }

  if (args.segmentPosition === 'last') return decodeEscapedUnicode('\\u6700\\u540e\\u4e00\\u4e2a\\u53e5\\u6bb5');
  if (args.segmentPosition === 'previous') return decodeEscapedUnicode('\\u524d\\u4e00\\u4e2a\\u53e5\\u6bb5');
  if (args.segmentPosition === 'next') return decodeEscapedUnicode('\\u540e\\u4e00\\u4e2a\\u53e5\\u6bb5');
  if (args.segmentPosition === 'penultimate') return decodeEscapedUnicode('\\u5012\\u6570\\u7b2c\\u4e8c\\u4e2a\\u53e5\\u6bb5');
  if (args.segmentPosition === 'middle') return decodeEscapedUnicode('\\u4e2d\\u95f4\\u90a3\\u4e2a\\u53e5\\u6bb5');
  return null;
}

function inferDeleteLayerArgumentsFromText(userText: string): Partial<AiChatToolCall['arguments']> {
  const normalizedText = userText.trim();
  if (!normalizedText) return {};

  let layerType: 'translation' | 'transcription' | undefined;
  if (escapedUnicodeRegExp('(\\u7ffb\\u8bd1\\u5c42|\\u8bd1\\u6587\\u5c42)', 'i').test(normalizedText)) layerType = 'translation';
  if (escapedUnicodeRegExp('(\\u8f6c\\u5199\\u5c42|\\u8f6c\\u5f55\\u5c42|\\u542c\\u5199\\u5c42)', 'i').test(normalizedText)) layerType = 'transcription';

  const languageQueryMatch = normalizedText.match(
    escapedUnicodeRegExp(
      '\\u5220\\u9664\\s*(.+?)\\s*(?:\\u7ffb\\u8bd1\\u5c42|\\u8bd1\\u6587\\u5c42|\\u8f6c\\u5199\\u5c42|\\u8f6c\\u5f55\\u5c42|\\u542c\\u5199\\u5c42|\\u5c42)',
      'i',
    ),
  );
  const languageQuery = languageQueryMatch?.[1]?.trim();

  const result: Partial<AiChatToolCall['arguments']> = {};
  if (layerType) result.layerType = layerType;
  if (languageQuery) result.languageQuery = languageQuery;
  return result;
}

const TOOL_ARG_MAX_ID_LENGTH = 128;
const TOOL_ARG_MAX_TEXT_LENGTH = 5000;

function validateArgId(args: Record<string, unknown>, key: string, required: boolean): string | null {
  if (!(key in args)) return required ? decodeEscapedUnicode(`\\u7f3a\\u5c11 ${key}。`) : null;
  const value = args[key];
  if (typeof value !== 'string') return decodeEscapedUnicode(`${key} \\u5fc5\\u987b\\u662f\\u5b57\\u7b26\\u4e32。`);
  const trimmed = value.trim();
  if (trimmed.length === 0) return decodeEscapedUnicode(`${key} \\u4e0d\\u80fd\\u4e3a\\u7a7a。`);
  if (trimmed.length > TOOL_ARG_MAX_ID_LENGTH) return decodeEscapedUnicode(`${key} \\u957f\\u5ea6\\u4e0d\\u80fd\\u8d85\\u8fc7 ${TOOL_ARG_MAX_ID_LENGTH}。`);
  return null;
}

function validateArgIdList(args: Record<string, unknown>, key: string, required: boolean): string | null {
  if (!(key in args)) return required ? decodeEscapedUnicode(`\\u7f3a\\u5c11 ${key}。`) : null;
  const value = args[key];
  if (!Array.isArray(value)) return decodeEscapedUnicode(`${key} \\u5fc5\\u987b\\u662f ID \\u6570\\u7ec4。`);
  if (value.length === 0) return decodeEscapedUnicode(`${key} \\u81f3\\u5c11\\u9700\\u8981 1 \\u4e2a ID。`);
  for (const item of value) {
    if (typeof item !== 'string') return decodeEscapedUnicode(`${key} \\u5fc5\\u987b\\u662f ID \\u6570\\u7ec4。`);
    const trimmed = item.trim();
    if (trimmed.length === 0) return decodeEscapedUnicode(`${key} \\u4e0d\\u80fd\\u5305\\u542b\\u7a7a ID。`);
    if (trimmed.length > TOOL_ARG_MAX_ID_LENGTH) {
      return decodeEscapedUnicode(`${key} \\u4e2d\\u7684 ID \\u957f\\u5ea6\\u4e0d\\u80fd\\u8d85\\u8fc7 ${TOOL_ARG_MAX_ID_LENGTH}。`);
    }
  }
  return null;
}

function validateDeleteSegmentArgs(args: Record<string, unknown>): string | null {
  if (hasDeleteAllSegmentsScope(args)) {
    return null;
  }

  if (hasSegmentSelector(args)) {
    return null;
  }

  const listValidation = validateArgIdList(args, 'segmentIds', false);
  if (listValidation) return listValidation;

  if (getNormalizedIdList(args.segmentIds).length > 0) {
    return null;
  }

  const segmentId = getFirstNonEmptyString(args.segmentId);
  if (segmentId) return validateArgId(args, 'segmentId', false);

  return decodeEscapedUnicode('\u7f3a\u5c11 segmentId/segmentIds/allSegments。');
}

function validateSegmentTargetArgs(args: Record<string, unknown>): string | null {
  if (hasSegmentSelector(args)) {
    return null;
  }
  return validateArgId(args, 'segmentId', true);
}

function validateOptionalSegmentTargetArgs(args: Record<string, unknown>): string | null {
  if (hasSegmentSelector(args)) {
    return null;
  }
  return validateArgId(args, 'segmentId', false);
}

/** \\u6570\\u503c\\u53c2\\u6570\\u6821\\u9a8c（\\u517c\\u5bb9 Zod number schema） | Numeric arg validator (compatible with Zod number schemas) */
function validateArgNumeric(args: Record<string, unknown>, key: string, required: boolean): string | null {
  if (!(key in args)) return required ? decodeEscapedUnicode(`\\u7f3a\\u5c11 ${key}。`) : null;
  const value = args[key];
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(num)) return decodeEscapedUnicode(`${key} \\u5fc5\\u987b\\u662f\\u6709\\u6548\\u6570\\u5b57。`);
  return null;
}

function validateArgText(args: Record<string, unknown>): string | null {
  const value = args.text;
  if (typeof value !== 'string') return decodeEscapedUnicode('text \\u5fc5\\u987b\\u662f\\u5b57\\u7b26\\u4e32。');
  const trimmed = value.trim();
  if (trimmed.length === 0) return decodeEscapedUnicode('text \\u4e0d\\u80fd\\u4e3a\\u7a7a。');
  if (trimmed.length > TOOL_ARG_MAX_TEXT_LENGTH) return decodeEscapedUnicode(`text \\u957f\\u5ea6\\u4e0d\\u80fd\\u8d85\\u8fc7 ${TOOL_ARG_MAX_TEXT_LENGTH}。`);
  return null;
}

function validateSplitSegmentArgs(args: Record<string, unknown>): string | null {
  let idValidation: string | null = null;
  if (!hasSegmentSelector(args)) {
    idValidation = validateArgId(args, 'segmentId', true);
  }
  if (idValidation) return idValidation;

  if (!('splitTime' in args)) return null;
  const splitTime = args.splitTime;
  if (typeof splitTime !== 'number' || !Number.isFinite(splitTime)) {
    return decodeEscapedUnicode('splitTime \\u5fc5\\u987b\\u662f\\u6570\\u503c（\\u79d2）。');
  }
  if (splitTime < 0) {
    return decodeEscapedUnicode('splitTime \\u4e0d\\u80fd\\u4e3a\\u8d1f\\u6570。');
  }
  return null;
}

function validateArgLayerCreate(args: Record<string, unknown>, allowModality: boolean): string | null {
  const languageId = args.languageId;
  const languageQuery = args.languageQuery;
  const effectiveLang = (typeof languageId === 'string' && languageId.trim().length > 0)
    ? languageId.trim()
    : (typeof languageQuery === 'string' && languageQuery.trim().length > 0)
      ? languageQuery.trim()
      : '';
  if (effectiveLang.length === 0) {
    return decodeEscapedUnicode('languageId \\u5fc5\\u987b\\u662f\\u975e\\u7a7a\\u5b57\\u7b26\\u4e32。');
  }
  if (isAmbiguousLanguageTarget(effectiveLang)) {
    return decodeEscapedUnicode('languageId \\u4e0d\\u80fd\\u662f und/unknown/auto/default，\\u8bf7\\u63d0\\u4f9b\\u660e\\u786e\\u8bed\\u8a00。');
  }
  if (effectiveLang.length > 32) return decodeEscapedUnicode('languageId/languageQuery \\u957f\\u5ea6\\u4e0d\\u80fd\\u8d85\\u8fc7 32。');
  if ('alias' in args) {
    const alias = args.alias;
    if (typeof alias !== 'string') return decodeEscapedUnicode('alias \\u5fc5\\u987b\\u662f\\u5b57\\u7b26\\u4e32。');
    if (alias.trim().length > 64) return decodeEscapedUnicode('alias \\u957f\\u5ea6\\u4e0d\\u80fd\\u8d85\\u8fc7 64。');
  }
  if (allowModality && 'modality' in args) {
    const modality = args.modality;
    if (typeof modality !== 'string') return decodeEscapedUnicode('modality \\u5fc5\\u987b\\u662f\\u5b57\\u7b26\\u4e32。');
    if (!['text', 'audio', 'mixed'].includes((modality as string).trim().toLowerCase())) {
      return decodeEscapedUnicode('modality \\u5fc5\\u987b\\u662f text/audio/mixed \\u4e4b\\u4e00。');
    }
  }
  return null;
}

function validateDeleteLayerArgs(args: Record<string, unknown>): string | null {
  const layerIdValidation = validateArgId(args, 'layerId', false);
  if (layerIdValidation) return layerIdValidation;
  const hasLayerId = typeof args.layerId === 'string' && args.layerId.trim().length > 0;
  if (hasLayerId) return null;
  const layerType = args.layerType;
  if (layerType !== 'translation' && layerType !== 'transcription') {
    return decodeEscapedUnicode('\\u7f3a\\u5c11 layerId，\\u4e14 layerType \\u5fc5\\u987b\\u662f translation/transcription \\u4e4b\\u4e00。');
  }
  const languageQuery = args.languageQuery;
  if (typeof languageQuery !== 'string' || languageQuery.trim().length === 0) {
    return decodeEscapedUnicode('\\u7f3a\\u5c11 layerId \\u65f6\\u5fc5\\u987b\\u63d0\\u4f9b languageQuery。');
  }
  if (languageQuery.trim().length > 32) return decodeEscapedUnicode('languageQuery \\u957f\\u5ea6\\u4e0d\\u80fd\\u8d85\\u8fc7 32。');
  return null;
}

function validateLinkLayerArgs(args: Record<string, unknown>): string | null {
  if (!('transcriptionLayerId' in args) && !('transcriptionLayerKey' in args)) {
    return decodeEscapedUnicode('\\u7f3a\\u5c11 transcriptionLayerId/transcriptionLayerKey。');
  }
  if (!('translationLayerId' in args) && !('layerId' in args)) {
    return decodeEscapedUnicode('\\u7f3a\\u5c11 translationLayerId/layerId。');
  }
  return validateArgId(args, 'transcriptionLayerId', false)
    ?? validateArgId(args, 'transcriptionLayerKey', false)
    ?? validateArgId(args, 'translationLayerId', false)
    ?? validateArgId(args, 'layerId', false);
}

interface ToolContextFillSpec {
  utteranceId?: boolean;
  translationLayerId?: boolean;
  linkBothLayers?: boolean;
  layerTargetInference?: boolean;
}

interface ToolStrategy {
  label: string;
  contextFill?: ToolContextFillSpec;
  destructive?: boolean;
  validateArgs?: (args: Record<string, unknown>) => string | null;
  riskSpec?: {
    summary: (args: Record<string, unknown>) => string;
    preview: string[];
  };
}

const SEGMENT_SELECTION_COMPATIBLE_TOOLS = new Set<AiChatToolName>([
  'create_transcription_segment',
  'split_transcription_segment',
  'merge_prev',
  'merge_next',
  'delete_transcription_segment',
  'set_transcription_text',
  'set_translation_text',
  'clear_translation_segment',
]);

function toolSupportsSegmentSelectionTarget(callName: AiChatToolName): boolean {
  return SEGMENT_SELECTION_COMPATIBLE_TOOLS.has(callName);
}

export function resolveSelectionTargetPatchForTool(
  callName: AiChatToolName,
  context: AiPromptContext | null | undefined,
): Record<string, string> | null {
  const short = context?.shortTerm;
  const activeUtteranceUnitId = getFirstNonEmptyString(short?.activeUtteranceUnitId);
  const activeSegmentUnitId = getFirstNonEmptyString(short?.activeSegmentUnitId);
  const selectedUnitKind = short?.selectedUnitKind;

  if (toolSupportsSegmentSelectionTarget(callName)) {
    if ((selectedUnitKind === 'segment' || activeSegmentUnitId.length > 0) && activeSegmentUnitId.length > 0) {
      return { segmentId: activeSegmentUnitId };
    }
    return null;
  }
  if (activeUtteranceUnitId.length > 0) {
    return { utteranceId: activeUtteranceUnitId };
  }
  return null;
}

const TOOL_STRATEGY_TABLE: Record<AiChatToolName, ToolStrategy> = {
  create_transcription_segment: {
    label: '\\u521b\\u5efa\\u53e5\\u6bb5',
    contextFill: { utteranceId: true },
    validateArgs: validateSegmentTargetArgs,
  },
  split_transcription_segment: {
    label: '\\u5207\\u5206\\u53e5\\u6bb5',
    contextFill: { utteranceId: true },
    validateArgs: (args) => validateSegmentTargetArgs(args) ?? validateSplitSegmentArgs(args),
  },
  merge_transcription_segments: {
    label: '\\u5408\\u5e76\\u53e5\\u6bb5',
    contextFill: {},
    validateArgs: (args) => {
      const segmentIds = getNormalizedIdList(args.segmentIds);
      return segmentIds.length >= 2 ? null : '\\u7f3a\\u5c11\\u81f3\\u5c11 2 \\u4e2a\\u76ee\\u6807\\u53e5\\u6bb5';
    },
  },
  delete_transcription_segment: {
    label: '\\u5220\\u9664\\u53e5\\u6bb5',
    contextFill: { utteranceId: true },
    destructive: true,
    validateArgs: validateDeleteSegmentArgs,
    riskSpec: {
      summary: (args) => {
        if (hasDeleteAllSegmentsScope(args)) {
          return '\\u5c06\\u5220\\u9664\\u5f53\\u524d\\u9875\\u9762\\u7684\\u5168\\u90e8\\u53e5\\u6bb5';
        }
        const selectorTarget = describeDeleteSegmentSelectorTarget(args);
        if (selectorTarget) {
          return `\\u5c06\\u5220\\u9664 1 \\u6761\\u53e5\\u6bb5（\\u76ee\\u6807：${selectorTarget}）`;
        }
        const targetIds = getDeleteTargetIds(args);
        const targetCount = Math.max(1, targetIds.length);
        const target = targetIds[0] ?? 'current-segment';
        return targetCount > 1
          ? `\\u5c06\\u5220\\u9664 ${targetCount} \\u6761\\u53e5\\u6bb5`
          : `\\u5c06\\u5220\\u9664 1 \\u6761\\u53e5\\u6bb5（\\u76ee\\u6807：${target}）`;
      },
      preview: [
        '\\u8be5\\u53e5\\u6bb5\\u7684\\u65f6\\u95f4\\u8303\\u56f4\\u4e0e\\u8f6c\\u5199\\u6587\\u672c\\u4f1a\\u88ab\\u6e05\\u9664',
        '\\u53ef\\u901a\\u8fc7\\u64a4\\u9500（Undo）\\u6062\\u590d',
        '\\u5173\\u8054\\u7ffb\\u8bd1\\u53ef\\u80fd\\u53d8\\u4e3a\\u7a7a\\u5f15\\u7528',
      ],
    },
  },
  clear_translation_segment: {
    label: '\\u6e05\\u7a7a\\u7ffb\\u8bd1',
    contextFill: { utteranceId: true, translationLayerId: true },
    validateArgs: (args) => validateSegmentTargetArgs(args) ?? validateArgId(args, 'layerId', true),
  },
  set_transcription_text: {
    label: '\\u5199\\u5165\\u8f6c\\u5199',
    contextFill: { utteranceId: true },
    validateArgs: (args) => validateArgText(args) ?? validateSegmentTargetArgs(args),
  },
  set_translation_text: {
    label: '\\u5199\\u5165\\u7ffb\\u8bd1',
    contextFill: { utteranceId: true, translationLayerId: true },
    validateArgs: (args) => validateArgText(args) ?? validateSegmentTargetArgs(args) ?? validateArgId(args, 'layerId', true),
  },
  create_transcription_layer: {
    label: '\\u521b\\u5efa\\u8f6c\\u5199\\u5c42',
    validateArgs: (args) => validateArgLayerCreate(args, false),
  },
  create_translation_layer: {
    label: '\\u521b\\u5efa\\u7ffb\\u8bd1\\u5c42',
    validateArgs: (args) => validateArgLayerCreate(args, true),
  },
  delete_layer: {
    label: '\\u5220\\u9664\\u5c42',
    contextFill: { layerTargetInference: true },
    destructive: true,
    validateArgs: validateDeleteLayerArgs,
    riskSpec: {
      summary: (args) => {
        const layerId = typeof args.layerId === 'string' ? args.layerId.trim() : '';
        const layerType = typeof args.layerType === 'string' ? args.layerType.trim() : '';
        const languageQuery = typeof args.languageQuery === 'string' ? args.languageQuery.trim() : '';
        const typeLabel = layerType === 'transcription' ? '\\u8f6c\\u5199\\u5c42' : layerType === 'translation' ? '\\u7ffb\\u8bd1\\u5c42' : '\\u5c42';
        if (languageQuery) {
          return `\\u5c06\\u5220\\u9664\\u6574\\u5c42\\u6570\\u636e（\\u76ee\\u6807：${languageQuery}${typeLabel}${layerId ? `，ID：${layerId}` : ''}）`;
        }
        const layerLabel = layerId || 'current-layer';
        return `\\u5c06\\u5220\\u9664\\u6574\\u5c42\\u6570\\u636e（\\u76ee\\u6807\\u5c42：${layerLabel}）`;
      },
      preview: [
        '\\u8be5\\u5c42\\u4e0b\\u7684\\u6587\\u672c\\u4f1a\\u88ab\\u4e00\\u5e76\\u79fb\\u9664',
        '\\u53ef\\u901a\\u8fc7\\u64a4\\u9500（Undo）\\u6062\\u590d',
        '\\u4e0e\\u8be5\\u5c42\\u76f8\\u5173\\u7684\\u94fe\\u63a5/\\u5bf9\\u9f50\\u5173\\u7cfb\\u53ef\\u80fd\\u5931\\u6548',
      ],
    },
  },
  link_translation_layer: {
    label: '\\u5173\\u8054\\u7ffb\\u8bd1\\u5c42',
    contextFill: { linkBothLayers: true },
    validateArgs: validateLinkLayerArgs,
  },
  unlink_translation_layer: {
    label: '\\u89e3\\u9664\\u7ffb\\u8bd1\\u5c42\\u5173\\u8054',
    contextFill: { linkBothLayers: true },
    validateArgs: validateLinkLayerArgs,
  },
  auto_gloss_utterance: {
    label: '\\u81ea\\u52a8\\u8bcd\\u6c47\\u6807\\u6ce8',
    contextFill: { utteranceId: true },
    validateArgs: validateSegmentTargetArgs,
  },
  set_token_pos: {
    label: '\\u8bbe\\u7f6e\\u8bcd\\u6027',
    contextFill: { utteranceId: true },
    validateArgs: (args) => validateArgId(args, 'utteranceId', false),
  },
  set_token_gloss: {
    label: '\\u8bbe\\u7f6e\\u8bcd\\u6c47\\u6807\\u6ce8',
    contextFill: {},
    validateArgs: (args) => validateArgId(args, 'tokenId', true),
  },
  play_pause: { label: '\\u64ad\\u653e/\\u6682\\u505c', contextFill: {}, validateArgs: () => null },
  undo: { label: '\\u64a4\\u9500', contextFill: {}, validateArgs: () => null },
  redo: { label: '\\u91cd\\u505a', contextFill: {}, validateArgs: () => null },
  search_segments: { label: '\\u641c\\u7d22\\u53e5\\u6bb5', contextFill: {}, validateArgs: (args) => validateArgText({ text: args.query }) },
  toggle_notes: { label: '\\u5207\\u6362\\u5907\\u6ce8', contextFill: {}, validateArgs: () => null },
  mark_segment: { label: '\\u6807\\u8bb0\\u53e5\\u6bb5', contextFill: {}, validateArgs: () => null },
  delete_segment: { label: '\\u5220\\u9664\\u53e5\\u6bb5', contextFill: {}, validateArgs: () => null },
  auto_gloss_segment: {
    label: '\\u81ea\\u52a8\\u6807\\u6ce8',
    contextFill: { utteranceId: true },
    validateArgs: (args) => validateArgId(args, 'segmentId', false) ?? validateArgId(args, 'utteranceId', false),
  },
  auto_translate_segment: {
    label: '\\u81ea\\u52a8\\u7ffb\\u8bd1',
    contextFill: { utteranceId: true },
    validateArgs: (args) => validateArgId(args, 'segmentId', false) ?? validateArgId(args, 'utteranceId', false),
  },
  nav_to_segment: {
    label: '\\u5bfc\\u822a\\u5230\\u53e5\\u6bb5',
    contextFill: {},
    validateArgs: (args) => validateArgNumeric(args, 'segmentIndex', true),
  },
  nav_to_time: {
    label: '\\u5bfc\\u822a\\u5230\\u65f6\\u95f4',
    contextFill: {},
    validateArgs: (args) => validateArgNumeric(args, 'timeSeconds', true),
  },
  focus_segment: {
    label: '\\u805a\\u7126\\u53e5\\u6bb5',
    contextFill: {},
    validateArgs: (args) => validateArgId(args, 'segmentId', true),
  },
  zoom_to_segment: {
    label: '\\u7f29\\u653e\\u81f3\\u53e5\\u6bb5',
    contextFill: {},
    validateArgs: (args) => validateArgId(args, 'segmentId', true),
  },
  split_at_time: {
    label: '\\u65f6\\u95f4\\u70b9\\u5206\\u5272',
    contextFill: {},
    validateArgs: (args) => validateArgNumeric(args, 'timeSeconds', true),
  },
  merge_prev: {
    label: '\\u5408\\u5e76\\u4e0a\\u4e00\\u4e2a',
    contextFill: { utteranceId: true },
    validateArgs: validateOptionalSegmentTargetArgs,
  },
  merge_next: {
    label: '\\u5408\\u5e76\\u4e0b\\u4e00\\u4e2a',
    contextFill: { utteranceId: true },
    validateArgs: validateOptionalSegmentTargetArgs,
  },
  auto_segment: {
    label: '\\u81ea\\u52a8\\u5207\\u5206',
    contextFill: {},
    validateArgs: (args) => validateArgNumeric(args, 'startTime', false),
  },
  suggest_segment_improvement: {
    label: '\\u5efa\\u8bae\\u6539\\u8fdb',
    contextFill: { utteranceId: true },
    validateArgs: (args) => validateArgId(args, 'utteranceId', false),
  },
  analyze_segment_quality: {
    label: '\\u5206\\u6790\\u8d28\\u91cf',
    contextFill: { utteranceId: true },
    validateArgs: (args) => validateArgId(args, 'utteranceId', false),
  },
  get_current_segment: { label: '\\u83b7\\u53d6\\u5f53\\u524d\\u53e5\\u6bb5', contextFill: {}, validateArgs: () => null },
  get_project_summary: { label: '\\u83b7\\u53d6\\u9879\\u76ee\\u6458\\u8981', contextFill: {}, validateArgs: () => null },
  get_recent_history: { label: '\\u83b7\\u53d6\\u6700\\u8fd1\\u5386\\u53f2', contextFill: {}, validateArgs: () => null },
};

export function planToolCallTargets(
  call: AiChatToolCall,
  userText: string,
  context: AiPromptContext | null | undefined,
): ToolPlannerResult {
  const shortTerm = context?.shortTerm;
  const currentUtteranceId = getFirstNonEmptyString(shortTerm?.activeUtteranceUnitId);
  const currentSegmentId = getFirstNonEmptyString(shortTerm?.activeSegmentUnitId);
  const selectedUnitIds = getNormalizedIdList(shortTerm?.selectedUnitIds);
  const currentAudioTimeSec = typeof shortTerm?.audioTimeSec === 'number' && Number.isFinite(shortTerm.audioTimeSec)
    ? shortTerm.audioTimeSec
    : undefined;
  const selectedLayerId = getFirstNonEmptyString(shortTerm?.selectedLayerId);
  const selectedLayerType = shortTerm?.selectedLayerType;
  const selectedTranslationLayerId = getFirstNonEmptyString(
    shortTerm?.selectedTranslationLayerId,
    selectedLayerType === 'translation' ? selectedLayerId : '',
  );
  const selectedTranscriptionLayerId = getFirstNonEmptyString(
    shortTerm?.selectedTranscriptionLayerId,
    selectedLayerType === 'transcription' ? selectedLayerId : '',
  );

  const nextCall: AiChatToolCall = {
    ...call,
    arguments: { ...call.arguments },
  };
  if (toolSupportsSegmentSelectionTarget(call.name)) {
    delete nextCall.arguments.utteranceId;
  }
  if (call.name === 'merge_transcription_segments' || call.name === 'delete_transcription_segment') {
    delete nextCall.arguments.utteranceIds;
  }
  const parsedSegmentSelector = extractSegmentSelectorFromUserText(userText);
  const activeSelectionTargetPatch = resolveSelectionTargetPatchForTool(call.name, context);

  const ensureUtteranceId = (): string => {
    const existingSegmentId = getFirstNonEmptyString(nextCall.arguments.segmentId);
    if (existingSegmentId) {
      return existingSegmentId;
    }
    const existing = getFirstNonEmptyString(nextCall.arguments.utteranceId);
    if (existing) {
      if (currentUtteranceId && existing !== currentUtteranceId) {
        nextCall.arguments.utteranceId = currentUtteranceId;
        if (call.name === 'auto_gloss_segment' || call.name === 'auto_translate_segment') {
          nextCall.arguments.segmentId = currentUtteranceId;
        }
        return currentUtteranceId;
      }
      return existing;
    }
    if (currentUtteranceId) {
      nextCall.arguments.utteranceId = currentUtteranceId;
      if (call.name === 'auto_gloss_segment' || call.name === 'auto_translate_segment') {
        nextCall.arguments.segmentId = currentUtteranceId;
      }
      return currentUtteranceId;
    }
    return '';
  };

  const ensureSegmentScopedTarget = (): string => {
    const segmentId = getFirstNonEmptyString(activeSelectionTargetPatch?.segmentId);
    if (!segmentId) {
      return '';
    }
    const existingSegmentId = getFirstNonEmptyString(nextCall.arguments.segmentId);
    if (existingSegmentId === segmentId) {
      return existingSegmentId;
    }
    nextCall.arguments.segmentId = segmentId;
    delete nextCall.arguments.utteranceId;
    return segmentId;
  };

  const cf = TOOL_STRATEGY_TABLE[call.name]?.contextFill;

  if (requiresConcreteLanguageTarget(call.name)) {
    if (isAmbiguousLanguageTarget(nextCall.arguments.languageId) && isAmbiguousLanguageTarget(nextCall.arguments.languageQuery)) {
      return { decision: 'clarify', call: nextCall, reason: 'missing-language-target' };
    }
  }

  if (call.name === 'delete_transcription_segment') {
    const hasExplicitDeleteTarget = getDeleteTargetIds(nextCall.arguments).length > 0 || hasSegmentSelector(nextCall.arguments);
    if (hasSegmentSelector(nextCall.arguments) && segmentSelectorNeedsAnchor(nextCall.arguments) && !currentUtteranceId && !currentSegmentId) {
      return { decision: 'clarify', call: nextCall, reason: 'missing-utterance-target' };
    }
    const refersAllSelectedSegments = /(\u6240\u6709|\u5168\u90e8|\u5168\u4f53|all)/i.test(userText)
      && /(\u53e5\u6bb5|\u5206\u6bb5|segment)/i.test(userText);

    if (!hasExplicitDeleteTarget && !hasDeleteAllSegmentsScope(nextCall.arguments)) {
      if (refersAllSelectedSegments && selectedUnitIds.length > 1) {
        nextCall.arguments.segmentIds = selectedUnitIds;
      } else if (refersAllSelectedSegments) {
        nextCall.arguments.allSegments = true;
      } else if (parsedSegmentSelector) {
        Object.assign(nextCall.arguments, parsedSegmentSelector);
        if (segmentSelectorNeedsAnchor(nextCall.arguments) && !currentUtteranceId && !currentSegmentId) {
          return { decision: 'clarify', call: nextCall, reason: 'missing-utterance-target' };
        }
      } else {
        const selectedTargetPatch = resolveSelectionTargetPatchForTool(call.name, context);
        if (selectedTargetPatch?.segmentId) {
          nextCall.arguments.segmentId = selectedTargetPatch.segmentId;
        }
        const segmentId = ensureSegmentScopedTarget();
        if (!getFirstNonEmptyString(nextCall.arguments.segmentId) && !segmentId) {
          return { decision: 'clarify', call: nextCall, reason: 'missing-utterance-target' };
        }
      }
    }

    if (!hasDeleteAllSegmentsScope(nextCall.arguments) && getDeleteTargetIds(nextCall.arguments).length === 0 && !hasSegmentSelector(nextCall.arguments)) {
      return { decision: 'clarify', call: nextCall, reason: 'missing-utterance-target' };
    }
  }

  if (call.name === 'merge_transcription_segments') {
    if (selectedUnitIds.length > 1) {
      nextCall.arguments.segmentIds = selectedUnitIds;
    }
    const hasBatchTarget = getNormalizedIdList(nextCall.arguments.segmentIds).length >= 2;
    if (!hasBatchTarget) {
      if (selectedUnitIds.length > 1) {
        nextCall.arguments.segmentIds = selectedUnitIds;
      } else {
        return { decision: 'clarify', call: nextCall, reason: 'missing-utterance-target' };
      }
    }
  }

  if (call.name === 'merge_prev' || call.name === 'merge_next') {
    delete nextCall.arguments.segmentIndex;
    delete nextCall.arguments.segmentPosition;
    const segmentId = ensureSegmentScopedTarget();
    if (!segmentId) {
      return { decision: 'clarify', call: nextCall, reason: 'missing-utterance-target' };
    }
  }

  if (cf?.utteranceId && call.name !== 'delete_transcription_segment' && call.name !== 'merge_prev' && call.name !== 'merge_next') {
    if (!getFirstNonEmptyString(nextCall.arguments.segmentId, nextCall.arguments.utteranceId) && !hasSegmentSelector(nextCall.arguments) && parsedSegmentSelector) {
      Object.assign(nextCall.arguments, parsedSegmentSelector);
      if (segmentSelectorNeedsAnchor(nextCall.arguments) && !currentUtteranceId && !currentSegmentId) {
        return { decision: 'clarify', call: nextCall, reason: 'missing-utterance-target' };
      }
    }
    if (!hasSegmentSelector(nextCall.arguments)) {
      const segmentId = ensureSegmentScopedTarget();
      if (toolSupportsSegmentSelectionTarget(call.name)) {
        if (!segmentId) {
          return { decision: 'clarify', call: nextCall, reason: 'missing-utterance-target' };
        }
      } else if (!segmentId) {
        const utteranceId = ensureUtteranceId();
        if (!utteranceId) {
          return { decision: 'clarify', call: nextCall, reason: 'missing-utterance-target' };
        }
      }
    }
  }

  if (call.name === 'split_transcription_segment') {
    const rawSplitTime = nextCall.arguments.splitTime;
    const splitTime = typeof rawSplitTime === 'number' && Number.isFinite(rawSplitTime)
      ? rawSplitTime
      : currentAudioTimeSec;

    if (!(typeof splitTime === 'number' && Number.isFinite(splitTime))) {
      return { decision: 'clarify', call: nextCall, reason: 'missing-split-position' };
    }

    nextCall.arguments.splitTime = splitTime;
  }

  if (cf?.translationLayerId) {
    const layerId = getFirstNonEmptyString(nextCall.arguments.layerId);
    if (layerId) {
      if (selectedTranslationLayerId && layerId !== selectedTranslationLayerId) {
        nextCall.arguments.layerId = selectedTranslationLayerId;
      }
    } else if (selectedTranslationLayerId) {
      nextCall.arguments.layerId = selectedTranslationLayerId;
    }
    if (!getFirstNonEmptyString(nextCall.arguments.layerId)) {
      return { decision: 'clarify', call: nextCall, reason: 'missing-translation-layer-target' };
    }
  }

  if (cf?.linkBothLayers) {
    let transcriptionLayerId = getFirstNonEmptyString(nextCall.arguments.transcriptionLayerId);
    const transcriptionLayerKey = getFirstNonEmptyString(nextCall.arguments.transcriptionLayerKey);
    const refersCurrentLayerPair = escapedUnicodeRegExp('(\\u5f53\\u524d|\\u8fd9\\u5c42|\\u8be5\\u5c42|\\u672c\\u5c42|\\u5f53\\u524d\\u5c42)', 'i').test(userText);

    if (transcriptionLayerId && selectedTranscriptionLayerId && transcriptionLayerId !== selectedTranscriptionLayerId) {
      nextCall.arguments.transcriptionLayerId = selectedTranscriptionLayerId;
      transcriptionLayerId = selectedTranscriptionLayerId;
    }
    if (!transcriptionLayerId && !transcriptionLayerKey && selectedTranscriptionLayerId && refersCurrentLayerPair) {
      nextCall.arguments.transcriptionLayerId = selectedTranscriptionLayerId;
    }

    let translationLayerId = getFirstNonEmptyString(nextCall.arguments.translationLayerId, nextCall.arguments.layerId);
    if (translationLayerId && selectedTranslationLayerId && translationLayerId !== selectedTranslationLayerId) {
      nextCall.arguments.translationLayerId = selectedTranslationLayerId;
      translationLayerId = selectedTranslationLayerId;
    }
    if (!translationLayerId && selectedTranslationLayerId && refersCurrentLayerPair) {
      nextCall.arguments.translationLayerId = selectedTranslationLayerId;
    }

    const hasTranscriptionTarget = getFirstNonEmptyString(nextCall.arguments.transcriptionLayerId, nextCall.arguments.transcriptionLayerKey).length > 0;
    const hasTranslationTarget = getFirstNonEmptyString(nextCall.arguments.translationLayerId, nextCall.arguments.layerId).length > 0;
    if (!hasTranscriptionTarget || !hasTranslationTarget) {
      return { decision: 'clarify', call: nextCall, reason: 'missing-layer-link-target' };
    }
  }

  if (cf?.layerTargetInference) {
    let layerId = getFirstNonEmptyString(nextCall.arguments.layerId);

    if (layerId) {
      const knownIds = [selectedLayerId, selectedTranscriptionLayerId, selectedTranslationLayerId].filter(Boolean);
      if (!knownIds.includes(layerId)) {
        nextCall.arguments = { ...nextCall.arguments };
        delete nextCall.arguments.layerId;
        layerId = '';
      }
    }

    if (!layerId) {
      const inferred = inferDeleteLayerArgumentsFromText(userText);
      nextCall.arguments = { ...nextCall.arguments, ...inferred };

      const refersCurrentLayer = escapedUnicodeRegExp('(\\u5f53\\u524d|\\u8fd9\\u5c42|\\u8be5\\u5c42|\\u672c\\u5c42).*(\\u5c42)|\\u5220\\u9664\\u5f53\\u524d\\u5c42|\\u5220\\u9664\\u8fd9\\u5c42', 'i').test(userText);
      if (refersCurrentLayer && selectedLayerId) {
        nextCall.arguments.layerId = selectedLayerId;
      }

      if (!getFirstNonEmptyString(nextCall.arguments.layerId)) {
        const inferredType = getFirstNonEmptyString(nextCall.arguments.layerType);
        const hasLanguageHint = getFirstNonEmptyString(nextCall.arguments.languageQuery).length > 0;
        if (!hasLanguageHint) {
          if (inferredType === 'transcription' && selectedTranscriptionLayerId) {
            nextCall.arguments.layerId = selectedTranscriptionLayerId;
          } else if (inferredType === 'translation' && selectedTranslationLayerId) {
            nextCall.arguments.layerId = selectedTranslationLayerId;
          }
        }
      }
    }

    const hasLayerId = getFirstNonEmptyString(nextCall.arguments.layerId).length > 0;
    const hasLayerType = getFirstNonEmptyString(nextCall.arguments.layerType).length > 0;
    const hasLanguageQuery = getFirstNonEmptyString(nextCall.arguments.languageQuery).length > 0;
    if (!hasLayerId && !(hasLayerType && hasLanguageQuery)) {
      return { decision: 'clarify', call: nextCall, reason: 'missing-layer-target' };
    }
  }

  return { decision: 'resolved', call: nextCall };
}

function isDeicticConfirmationMessage(userText: string): boolean {
  const normalized = userText.trim();
  return escapedUnicodeRegExp('^(\\u8fd9\\u4e2a|\\u8fd9\\u4e2a\\u5427|\\u5c31\\u8fd9\\u4e2a|\\u5b83|\\u5b83\\u5427|\\u5c31\\u5b83|\\u8fd9\\u6761|\\u8be5\\u6761|\\u8fd9\\u4e00\\u6761|\\u8fd9\\u4e2a\\u53e5\\u6bb5|\\u8be5\\u53e5\\u6bb5|\\u8fd9\\u4e2a\\u5b57\\u6bb5|\\u8be5\\u5b57\\u6bb5|\\u8fd9\\u91cc|\\u6b64\\u5904|\\u5728\\u8fd9\\u91cc|\\u5728\\u6b64\\u5904|\\u5c31\\u8fd9\\u91cc|\\u5c31\\u6b64\\u5904)$', 'i').test(normalized);
}

export function extractClarifyLanguagePatch(userText: string): Record<string, string> | null {
  const trimmed = userText.trim().replace(escapedUnicodeRegExp('[\\u7684\\u90a3\\u4e2a\\u5427]$', 'g'), '').trim();
  if (!trimmed || trimmed.length > 20) return null;
  const resolved = resolveLanguageQuery(trimmed);
  if (!resolved) return null;
  return { languageId: resolved, languageQuery: trimmed };
}

export function extractClarifySplitPositionPatch(
  userText: string,
  context: AiPromptContext | null | undefined,
): Record<string, number | string> | null {
  if (!escapedUnicodeRegExp('^(\\u8fd9\\u91cc|\\u6b64\\u5904|\\u5728\\u8fd9\\u91cc|\\u5728\\u6b64\\u5904|\\u5c31\\u8fd9\\u91cc|\\u5c31\\u6b64\\u5904)$', 'i').test(userText.trim())) return null;
  const audioTimeSec = context?.shortTerm?.audioTimeSec;
  if (typeof audioTimeSec !== 'number' || !Number.isFinite(audioTimeSec)) return null;
  const targetPatch = resolveSelectionTargetPatchForTool('split_transcription_segment', context);
  if (!targetPatch) return null;
  return { ...targetPatch, splitTime: audioTimeSec };
}

function hasResolvableSelectionTargetForTool(callName: AiChatToolName, context: AiPromptContext | null | undefined): boolean {
  const short = context?.shortTerm;
  const selectedUnitIds = getNormalizedIdList(short?.selectedUnitIds);
  const selectedLayerId = getFirstNonEmptyString(short?.selectedLayerId);
  const selectedLayerType = short?.selectedLayerType;
  const selectedTranslationLayerId = getFirstNonEmptyString(
    short?.selectedTranslationLayerId,
    selectedLayerType === 'translation' ? selectedLayerId : '',
  );
  const selectedTranscriptionLayerId = getFirstNonEmptyString(
    short?.selectedTranscriptionLayerId,
    selectedLayerType === 'transcription' ? selectedLayerId : '',
  );
  const selectionTargetPatch = resolveSelectionTargetPatchForTool(callName, context);

  if (['create_transcription_segment', 'split_transcription_segment', 'merge_prev', 'merge_next', 'delete_transcription_segment', 'set_transcription_text', 'auto_gloss_utterance', 'set_token_pos', 'set_token_gloss'].includes(callName)) {
    if (callName === 'delete_transcription_segment' && selectedUnitIds.length > 1) {
      return true;
    }
    return selectionTargetPatch !== null;
  }
  if (callName === 'merge_transcription_segments') {
    return selectedUnitIds.length > 1;
  }
  if (['set_translation_text', 'clear_translation_segment'].includes(callName)) {
    return selectionTargetPatch !== null && selectedTranslationLayerId.length > 0;
  }
  if (callName === 'delete_layer') {
    return selectedLayerId.length > 0;
  }
  if (['link_translation_layer', 'unlink_translation_layer'].includes(callName)) {
    return selectedTranscriptionLayerId.length > 0 && selectedTranslationLayerId.length > 0;
  }
  return false;
}

function wasRecentAssistantClarification(messages: UiChatMessage[]): boolean {
  const latestAssistant = messages.find((item) => item.role === 'assistant' && item.content.trim().length > 0);
  if (!latestAssistant) return false;
  return escapedUnicodeRegExp('(\\u8fd8\\u4e0d\\u591f\\u786e\\u5b9a|\\u8fd8\\u4e0d\\u80fd\\u5b89\\u5168\\u6267\\u884c|\\u7f3a\\u5c11\\u76ee\\u6807|\\u8bf7\\u5148\\u9009\\u4e2d\\u76ee\\u6807)').test(latestAssistant.content);
}

export function shouldAllowDeicticExecutionIntent(
  userText: string,
  callName: AiChatToolName,
  context: AiPromptContext | null | undefined,
  messages: UiChatMessage[],
): boolean {
  if (!isDeicticConfirmationMessage(userText)) return false;
  const hasResolvableTarget = hasResolvableSelectionTargetForTool(callName, context);
  if (!hasResolvableTarget) return false;
  return wasRecentAssistantClarification(messages) || hasResolvableTarget;
}

export function assessToolActionIntent(userText: string, options?: ToolIntentAssessmentOptions): ToolIntentAssessment {
  const trimmed = userText.trim();
  const normalized = trimmed.toLowerCase();
  const allowDeicticExecution = options?.allowDeicticExecution ?? false;
  if (!normalized || normalized.length <= 2 || /^[\p{P}\p{S}\s]+$/u.test(normalized)) {
    if (allowDeicticExecution && isDeicticConfirmationMessage(trimmed)) {
      return {
        decision: 'execute',
        score: 3,
        hasExecutionCue: false,
        hasActionVerb: false,
        hasActionTarget: true,
        hasExplicitId: true,
        hasMetaQuestion: false,
        hasTechnicalDiscussion: false,
      };
    }
    return {
      decision: 'ignore',
      score: -1,
      hasExecutionCue: false,
      hasActionVerb: false,
      hasActionTarget: false,
      hasExplicitId: false,
      hasMetaQuestion: false,
      hasTechnicalDiscussion: false,
    };
  }

  if (normalized.includes('__tool_')) {
    return {
      decision: import.meta.env.MODE === 'test' ? 'execute' : 'ignore',
      score: import.meta.env.MODE === 'test' ? 99 : -1,
      hasExecutionCue: true,
      hasActionVerb: true,
      hasActionTarget: true,
      hasExplicitId: true,
      hasMetaQuestion: false,
      hasTechnicalDiscussion: false,
    };
  }

  const cancelPattern = escapedUnicodeRegExp('^(\\u7b97\\u4e86|\\u4e0d\\u505a\\u4e86|\\u4e0d\\u7528\\u4e86|\\u53d6\\u6d88|\\u53d6\\u6d88\\u5427|\\u522b[\\u505a\\u5220\\u5efa]\\u4e86|\\u4e0d\\u8981\\u4e86|never\\s*mind|cancel|forget\\s*it|stop|nvm|\\u6ca1\\u4e8b\\u4e86|\\u4e0d\\u9700\\u8981\\u4e86|\\u8fd8\\u662f\\u7b97\\u4e86)$', 'i');
  if (cancelPattern.test(normalized)) {
    return {
      decision: 'cancel',
      score: -5,
      hasExecutionCue: false,
      hasActionVerb: false,
      hasActionTarget: false,
      hasExplicitId: false,
      hasMetaQuestion: false,
      hasTechnicalDiscussion: false,
    };
  }

  const executionCuePattern = escapedUnicodeRegExp('(\\u8bf7\\u5e2e|\\u8bf7\\u628a|\\u8bf7\\u5c06|\\u5e2e\\u6211|\\u628a|\\u5c06|\\u7ed9\\u6211|\\u6267\\u884c|run|do|please|\\u9ebb\\u70e6|\\u5e2e\\u5fd9|\\u53ef\\u5426|\\u53ef\\u4ee5\\u628a|\\u5f53\\u524d|\\u6b64)', 'i');
  const actionVerbPattern = escapedUnicodeRegExp('(\\u521b\\u5efa|\\u65b0\\u5efa|\\u65b0\\u589e|\\u5207\\u5206|\\u62c6\\u5206|\\u5408\\u5e76|\\u5220\\u9664|\\u6e05\\u7a7a|\\u79fb\\u9664|\\u5199\\u5165|\\u586b\\u5199|\\u586b\\u5165|\\u8bbe\\u7f6e|\\u8bbe\\u4e3a|\\u4fee\\u6539|\\u6539\\u6210|\\u6539\\u4e3a|\\u66f4\\u65b0|\\u8986\\u76d6|\\u66ff\\u6362|\\u5173\\u8054|\\u94fe\\u63a5|\\u89e3\\u9664|\\u65ad\\u5f00|\\u81ea\\u52a8\\u6807\\u6ce8|\\u8f6c\\u5199|\\u7ffb\\u8bd1|create|add|insert|split|merge|delete|remove|clear|set|update|replace|link|unlink|gloss)', 'i');
  const actionTargetPattern = escapedUnicodeRegExp('(\\u53e5\\u6bb5|\\u6bb5\\u843d|segment|\\u5c42|layer|\\u8f6c\\u5199|\\u7ffb\\u8bd1|\\u6587\\u672c|text|gloss|\\u8bcd\\u4e49|utterance|\\u5f53\\u524d|\\u6b64|\\u8fd9\\u4e2a|\\u90a3\\u4e2a)', 'i');
  const actionObjectPronounPattern = escapedUnicodeRegExp('(\\u4e4b|\\u5b83|\\u5176|\\u8fd9\\u6761|\\u8be5\\u6761|\\u672c\\u6761|\\u6b64\\u6761|\\u8fd9\\u4e2a|\\u90a3\\u4e2a)$', 'i');
  const explicitIdPattern = escapedUnicodeRegExp('(utteranceId|layerId|transcriptionLayerId|translationLayerId|\\bu\\d+\\b|\\blayer[-_a-z0-9]+\\b|\\u5f53\\u524d|\\u6b64|\\u8fd9\\u4e2a|\\u90a3\\u4e2a)', 'i');

  let score = 0;
  const hasExecutionCue = executionCuePattern.test(trimmed);
  const hasActionVerb = actionVerbPattern.test(trimmed);
  const hasActionTarget = actionTargetPattern.test(trimmed)
    || (actionVerbPattern.test(trimmed) && actionObjectPronounPattern.test(trimmed));
  const hasExplicitId = explicitIdPattern.test(trimmed);

  if (hasExecutionCue) score += 1;
  if (hasActionVerb) score += 2;
  if (hasActionTarget) score += 2;
  if (hasExplicitId) score += 1;

  const greetingPattern = escapedUnicodeRegExp('^(\\u4f60\\u597d|\\u60a8\\u597d|\\u55e8|hello|hi|hey)([！!，,.。?？\\s].*)?$', 'i');
  const metaQuestionPattern = escapedUnicodeRegExp('(\\u4ec0\\u4e48\\u662f|\\u662f\\u4ec0\\u4e48\\u610f\\u601d|\\u4ec0\\u4e48\\u610f\\u601d|\\u8bf7\\u89e3\\u91ca|\\u89e3\\u91ca\\u4e00\\u4e0b|\\u89e3\\u91ca|\\u8bf4\\u660e\\u4e00\\u4e0b|\\u8bf4\\u660e|\\u542b\\u4e49|\\u7528\\u6cd5|\\u533a\\u522b|\\u539f\\u7406|why|what is|what does|explain|meaning|how to use)', 'i');
  const technicalDiscussionPattern = escapedUnicodeRegExp('(tool_call|set_translation_text|set_transcription_text|delete_layer|create_translation_layer|create_transcription_layer|\\u547d\\u4ee4|\\u6307\\u4ee4|\\u51fd\\u6570|\\u63a5\\u53e3|api)', 'i');
  const endsWithQuestionPattern = /[?？]\s*$/;
  const hasMetaQuestion = metaQuestionPattern.test(trimmed);
  const hasTechnicalDiscussion = technicalDiscussionPattern.test(trimmed);
  const hasActionCore = hasActionVerb && hasActionTarget;
  const hasAnyActionSignal = hasExecutionCue || hasActionVerb || hasActionTarget || hasExplicitId;
  if (greetingPattern.test(trimmed)) score -= 4;
  if (hasMetaQuestion) score -= 3;
  if (hasMetaQuestion && hasTechnicalDiscussion) score -= 2;
  if (endsWithQuestionPattern.test(trimmed) && !hasActionVerb) score -= 1;

  if (hasMetaQuestion && !hasExecutionCue) {
    return {
      decision: 'ignore',
      score,
      hasExecutionCue,
      hasActionVerb,
      hasActionTarget,
      hasExplicitId,
      hasMetaQuestion,
      hasTechnicalDiscussion,
    };
  }

  if (hasActionCore && score >= 3) {
    return {
      decision: 'execute',
      score,
      hasExecutionCue,
      hasActionVerb,
      hasActionTarget,
      hasExplicitId,
      hasMetaQuestion,
      hasTechnicalDiscussion,
    };
  }

  if (allowDeicticExecution && hasActionTarget && score >= 3) {
    return {
      decision: 'execute',
      score,
      hasExecutionCue,
      hasActionVerb,
      hasActionTarget,
      hasExplicitId,
      hasMetaQuestion,
      hasTechnicalDiscussion,
    };
  }

  if (hasAnyActionSignal && score >= 1) {
    return {
      decision: 'clarify',
      score,
      hasExecutionCue,
      hasActionVerb,
      hasActionTarget,
      hasExplicitId,
      hasMetaQuestion,
      hasTechnicalDiscussion,
    };
  }

  return {
    decision: 'ignore',
    score,
    hasExecutionCue,
    hasActionVerb,
    hasActionTarget,
    hasExplicitId,
    hasMetaQuestion,
    hasTechnicalDiscussion,
  };
}

export function isDestructiveToolCall(name: AiChatToolName): boolean {
  return TOOL_STRATEGY_TABLE[name]?.destructive ?? false;
}

function describeToolCallImpact(call: AiChatToolCall): { riskSummary: string; impactPreview: string[] } {
  const spec = TOOL_STRATEGY_TABLE[call.name];
  if (spec?.riskSpec) {
    return {
      riskSummary: decodeEscapedUnicode(spec.riskSpec.summary(call.arguments)),
      impactPreview: spec.riskSpec.preview.map(decodeEscapedUnicode),
    };
  }
  return {
    riskSummary: decodeEscapedUnicode(`\\u8be5\\u64cd\\u4f5c\\u4f1a\\u4fee\\u6539\\u6570\\u636e：${call.name}`),
    impactPreview: [decodeEscapedUnicode('\\u8bf7\\u786e\\u8ba4\\u76ee\\u6807\\u4e0e\\u5f71\\u54cd\\u540e\\u518d\\u7ee7\\u7eed。')],
  };
}

export function buildPreviewContract(call: AiChatToolCall, context?: AiPromptContext | null): PreviewContract {
  const args = call.arguments;
  if (call.name === 'delete_transcription_segment') {
    if (hasDeleteAllSegmentsScope(args)) {
      return {
        affectedCount: getContextUtteranceCount(context),
        affectedIds: [],
        reversible: true,
        cascadeTypes: ['translation'],
      };
    }
    const targetIds = getDeleteTargetIds(args);
    return {
      affectedCount: Math.max(1, targetIds.length),
      affectedIds: targetIds.slice(0, 5),
      reversible: true,
      cascadeTypes: ['translation'],
    };
  }
  if (call.name === 'delete_layer') {
    const lid = typeof args.layerId === 'string' ? args.layerId.trim() : '';
    return {
      affectedCount: 1,
      affectedIds: lid ? [lid] : [],
      reversible: true,
      cascadeTypes: ['link', 'alignment'],
    };
  }
  return {
    affectedCount: 1,
    affectedIds: [],
    reversible: false,
  };
}

export function validateToolCallArguments(call: AiChatToolCall): string | null {
  // Zod schema is preferred; covers all argument shape + domain rules (ambiguous language, etc.)
  const zodResult = validateToolArgumentsZod(call.name, call.arguments);
  if (zodResult !== null) return zodResult;

  // Legacy validator runs second for tools that have both Zod schema + legacy domain logic.
  // Legacy result takes precedence when present (e.g. deictic split position that depends on runtime context).
  const spec = TOOL_STRATEGY_TABLE[call.name];
  return spec?.validateArgs?.(call.arguments) ?? null;
}

function toToolActionLabel(callName: AiChatToolName): string {
  return decodeEscapedUnicode(TOOL_STRATEGY_TABLE[callName]?.label ?? callName);
}

export function toNaturalToolSuccess(
  locale: Locale,
  callName: AiChatToolName,
  message: string,
  style: AiToolFeedbackStyle,
): string {
  return formatToolSuccessMessage(locale, toToolActionLabel(callName), message, style);
}

export function toNaturalToolFailure(
  locale: Locale,
  callName: AiChatToolName,
  message: string,
  style: AiToolFeedbackStyle,
): string {
  return formatToolFailureMessage(locale, callName, toToolActionLabel(callName), message, style);
}

export function toNaturalToolPending(locale: Locale, callName: AiChatToolName, style: AiToolFeedbackStyle): string {
  return formatToolPendingMessage(locale, toToolActionLabel(callName), style);
}

export function toNaturalToolGraySkipped(locale: Locale, callName: AiChatToolName, style: AiToolFeedbackStyle): string {
  return formatToolGraySkippedMessage(locale, toToolActionLabel(callName), style);
}

export function toNaturalToolRollbackSkipped(
  locale: Locale,
  callName: AiChatToolName,
  style: AiToolFeedbackStyle,
): string {
  return formatToolRollbackSkippedMessage(locale, toToolActionLabel(callName), style);
}

export function resolveAiToolDecisionMode(): AiToolDecisionMode {
  if (featureFlags.aiChatRollbackMode) return 'rollback';
  if (featureFlags.aiChatGrayMode) return 'gray';
  return 'enabled';
}

export function buildToolAuditContext(
  userText: string,
  providerId: string,
  model: string,
  toolDecisionMode: AiToolDecisionMode,
  toolFeedbackStyle: AiToolFeedbackStyle,
  planner?: ToolPlannerResult | null,
  intentAssessment?: ToolIntentAssessment,
): ToolAuditContext {
  return {
    userText,
    providerId,
    model,
    toolDecisionMode,
    toolFeedbackStyle,
    ...(planner?.decision ? { plannerDecision: planner.decision } : {}),
    ...(planner?.reason ? { plannerReason: planner.reason } : {}),
    ...(intentAssessment ? { intentAssessment } : {}),
  };
}

export function buildToolIntentAuditMetadata(
  assistantMessageId: string,
  toolCall: AiChatToolCall,
  context: ToolAuditContext,
): ToolIntentAuditMetadata {
  return {
    schemaVersion: 1,
    phase: 'intent',
    requestId: toolCall.requestId ?? buildAiToolRequestId(toolCall),
    assistantMessageId,
    toolCall,
    context,
  };
}

export function buildToolDecisionAuditMetadata(
  assistantMessageId: string,
  toolCall: AiChatToolCall,
  context: ToolAuditContext,
  source: 'human' | 'ai' | 'system',
  outcome: string,
  executed: boolean,
  message?: string,
  reason?: string,
  durationMs?: number,
): ToolDecisionAuditMetadata {
  return {
    schemaVersion: 1,
    phase: 'decision',
    requestId: toolCall.requestId ?? buildAiToolRequestId(toolCall),
    assistantMessageId,
    source,
    toolCall,
    context,
    executed,
    outcome,
    ...(message ? { message } : {}),
    ...(reason ? { reason } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
  };
}

export function toNaturalToolCancelled(locale: Locale, callName: AiChatToolName, style: AiToolFeedbackStyle): string {
  return formatToolCancelledMessage(locale, toToolActionLabel(callName), style);
}

export function toNaturalNonActionFallback(userText: string, style: AiToolFeedbackStyle): string {
  return formatNonActionFallback(userText, style);
}

export function toNaturalActionClarify(callName: AiChatToolName, style: AiToolFeedbackStyle): string {
  return formatActionClarify(toToolActionLabel(callName), style);
}

export function buildClarifyCandidates(
  callName: AiChatToolName,
  reason: ToolPlannerClarifyReason | undefined,
  context: AiPromptContext | null | undefined,
  sessionMemory?: AiSessionMemory,
): AiClarifyCandidate[] {
  const short = context?.shortTerm;
  const selectedLayerId = getFirstNonEmptyString(short?.selectedLayerId);
  const selectedLayerType = short?.selectedLayerType;
  const selectedTranslationLayerId = getFirstNonEmptyString(
    short?.selectedTranslationLayerId,
    selectedLayerType === 'translation' ? selectedLayerId : '',
  );
  const selectedTranscriptionLayerId = getFirstNonEmptyString(
    short?.selectedTranscriptionLayerId,
    selectedLayerType === 'transcription' ? selectedLayerId : '',
  );

  const candidates: AiClarifyCandidate[] = [];
  if (reason === 'missing-utterance-target') {
    const selectionTargetPatch = resolveSelectionTargetPatchForTool(callName, context);
    if (selectionTargetPatch?.segmentId) {
      candidates.push({ key: '1', label: `\\u5f53\\u524d\\u9009\\u4e2d\\u53e5\\u6bb5（${selectionTargetPatch.segmentId}）`, argsPatch: selectionTargetPatch });
    }
  }
  if (reason === 'missing-layer-target' && selectedLayerId) {
    candidates.push({ key: '1', label: `\\u5f53\\u524d\\u9009\\u4e2d\\u5c42（${selectedLayerId}）`, argsPatch: { layerId: selectedLayerId } });
  }
  if (reason === 'missing-translation-layer-target' && selectedTranslationLayerId) {
    candidates.push({ key: '1', label: `\\u5f53\\u524d\\u9009\\u4e2d\\u7ffb\\u8bd1\\u5c42（${selectedTranslationLayerId}）`, argsPatch: { layerId: selectedTranslationLayerId } });
  }
  if (reason === 'missing-layer-link-target' && selectedTranscriptionLayerId && selectedTranslationLayerId) {
    candidates.push({
      key: '1',
      label: `\\u5f53\\u524d\\u9009\\u4e2d\\u5c42\\u5bf9（${selectedTranscriptionLayerId} -> ${selectedTranslationLayerId}）`,
      argsPatch: { transcriptionLayerId: selectedTranscriptionLayerId, translationLayerId: selectedTranslationLayerId },
    });
  }
  if (reason === 'missing-language-target' && callName === 'create_transcription_layer') {
    const lastLang = sessionMemory?.lastLanguage;
    if (lastLang && lastLang !== 'zho' && lastLang !== 'eng') {
      candidates.push({ key: `${candidates.length}`, label: `\\u4e0a\\u6b21\\u4f7f\\u7528（${lastLang}）`, argsPatch: { languageId: lastLang } });
    }
    candidates.push({ key: `${candidates.length}`, label: '\\u521b\\u5efa\\u4e2d\\u6587\\u8f6c\\u5199\\u5c42（zho）', argsPatch: { languageId: 'zho' } });
    candidates.push({ key: `${candidates.length}`, label: '\\u521b\\u5efa\\u82f1\\u6587\\u8f6c\\u5199\\u5c42（eng）', argsPatch: { languageId: 'eng' } });
  }
  return candidates.map((candidate) => ({
    ...candidate,
    label: decodeEscapedUnicode(candidate.label),
  }));
}

export function toNaturalTargetClarify(
  callName: AiChatToolName,
  reason: ToolPlannerClarifyReason | undefined,
  style: AiToolFeedbackStyle,
  candidates: AiClarifyCandidate[] = [],
): string {
  return formatTargetClarify(toToolActionLabel(callName), reason, style, candidates);
}

export function normalizeUnsupportedToolCallJson(
  content: string,
  userText: string,
  style: AiToolFeedbackStyle,
): string | null {
  const rawCall = parseRawToolCallEnvelope(content);
  if (!rawCall) return null;
  if (normalizeToolCallName(rawCall.name)) return null;

  const actionLabel = inferFallbackActionLabel(userText, rawCall.name);
  if (looksLikeSegmentScopedTool(rawCall.name, rawCall.arguments)) {
    return formatTargetClarify(actionLabel, 'missing-utterance-target', style);
  }
  return formatActionClarify(actionLabel, style);
}

export function normalizeLegacyRiskNarration(content: string, style: AiToolFeedbackStyle): string {
  const legacyCall = parseLegacyNarratedToolCall(content);
  if (!legacyCall) return content;
  const normalizedName = legacyCall.name;
  if (!normalizedName) return content;
  return toNaturalActionClarify(normalizedName, style);
}

export function isAmbiguousTargetRiskSummary(summary: string): boolean {
  const normalized = summary.toLowerCase();
  return normalized.includes(decodeEscapedUnicode('\\u5339\\u914d\\u5230\\u591a\\u4e2a'))
    || normalized.includes(decodeEscapedUnicode('\\u76ee\\u6807\\u4e0d\\u552f\\u4e00'))
    || normalized.includes('multiple')
    || normalized.includes('ambiguous');
}

export function describeAndBuildPending(
  toolCall: AiChatToolCall,
  context?: AiPromptContext | null,
): { riskSummary: string; impactPreview: string[]; previewContract: PreviewContract } {
  const impact = describeToolCallImpact(toolCall);
  return {
    riskSummary: impact.riskSummary,
    impactPreview: impact.impactPreview,
    previewContract: buildPreviewContract(toolCall, context),
  };
}
