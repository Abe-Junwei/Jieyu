import { featureFlags } from '../config/featureFlags';
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
  AiMemoryRecallShapeTelemetry,
  AiPromptContext,
  AiSessionMemory,
  AiToolDecisionMode,
  PreviewContract,
  UiChatMessage,
} from './chatDomain.types';
import type { Locale } from '../../i18n';
import {
  extractJsonCandidates,
  parseToolCallFromTextZod,
  validateToolArgumentsZod,
} from './toolCallSchemas';
import { normalizeToolCallName } from './toolCallNameNormalize';
import { decodeEscapedUnicode, escapedUnicodeRegExp } from '../../utils/decodeEscapedUnicode';
import { resolveLanguageQuery } from '../../utils/langMapping';
import {
  getAiToolPolicy,
  getAiToolSegmentExecutionToolNames,
  isAiToolDestructive,
} from '../policy/aiToolPolicyMatrix';
import { evidenceSourceRefsFromToolCallForAudit } from '../vertical/evidenceSourceRef';
import { extractSegmentSelectorFromUserText } from './segmentTextParsers';
import {
  getFirstNonEmptyString,
  getNormalizedIdList,
  hasDeleteAllSegmentsScope,
  getDeleteTargetIds,
  hasSegmentSelector,
  segmentSelectorNeedsAnchor,
  isAmbiguousLanguageTarget,
  requiresConcreteLanguageTarget,
  validateSegmentTargetArgs,
  validateDeleteSegmentArgs,
  validateOptionalSegmentTargetArgs,
  validateSplitSegmentArgs,
  validateArgText,
  validateArgNumeric,
  validateArgLayerCreate,
  validateDeleteLayerArgs,
  validateLinkLayerArgs,
  validateArgId,
} from './toolCallValidation';

// Re-export types extracted to satellite file
import type {
  ToolPlannerClarifyReason,
  ToolPlannerResult,
  ToolIntentAssessment,
  ToolIntentAssessmentOptions,
  ToolAuditContext,
  ToolIntentAuditMetadata,
  ToolDecisionAuditMetadata,
} from './toolCallHelpers.types';
export type {
  ToolPlannerClarifyReason,
  ToolPlannerResult,
  ToolIntentDecision,
  ToolIntentAssessment,
  ToolIntentAssessmentOptions,
  ToolAuditContext,
  ToolIntentAuditMetadata,
  ToolDecisionAuditMetadata,
} from './toolCallHelpers.types';

interface RawToolCallEnvelope {
  name: string;
  arguments: Record<string, unknown>;
}

export function parseToolCallFromText(rawText: string): AiChatToolCall | null {
  const result = parseToolCallFromTextZod(rawText);
  if (!result) return null;
  return { name: result.name, arguments: result.arguments };
}

export function parseLegacyNarratedToolCall(text: string): AiChatToolCall | null {
  const patterns = [
    escapedUnicodeRegExp(
      '\\u6211\\u8bc6\\u522b\\u5230\\u4f60\\u60f3\\u6267\\u884c[“\\”]([^”\\”]+)[“\\”]',
    ),
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
    const args =
      typeof rawArgs === 'object' && rawArgs !== null && !Array.isArray(rawArgs)
        ? (rawArgs as Record<string, unknown>)
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
  if (
    normalizedName.includes('segment') ||
    normalizedName.includes('unit') ||
    normalizedName.includes('row')
  ) {
    return true;
  }
  return ['segmentId', 'segmentIds', 'segmentIndex', 'segmentPosition'].some((key) => key in args);
}

function getContextScopeOrProjectUnitCount(context: AiPromptContext | null | undefined): number {
  const candidates = [
    context?.shortTerm?.currentScopeUnitCount,
    context?.shortTerm?.currentMediaUnitCount,
    context?.shortTerm?.projectUnitCount,
    context?.longTerm?.projectStats?.unitCount,
    context?.longTerm?.projectStats?.unitCount,
  ];
  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return value;
    }
  }
  return 0;
}

function describeDeleteSegmentSelectorTarget(args: Record<string, unknown>): string | null {
  const segmentIndex = args.segmentIndex;
  if (typeof segmentIndex === 'number' && Number.isInteger(segmentIndex) && segmentIndex >= 1) {
    return decodeEscapedUnicode(`\\u7b2c ${segmentIndex} \\u4e2a\\u53e5\\u6bb5`);
  }

  if (args.segmentPosition === 'last')
    return decodeEscapedUnicode('\\u6700\\u540e\\u4e00\\u4e2a\\u53e5\\u6bb5');
  if (args.segmentPosition === 'previous')
    return decodeEscapedUnicode('\\u524d\\u4e00\\u4e2a\\u53e5\\u6bb5');
  if (args.segmentPosition === 'next')
    return decodeEscapedUnicode('\\u540e\\u4e00\\u4e2a\\u53e5\\u6bb5');
  if (args.segmentPosition === 'penultimate')
    return decodeEscapedUnicode('\\u5012\\u6570\\u7b2c\\u4e8c\\u4e2a\\u53e5\\u6bb5');
  if (args.segmentPosition === 'middle')
    return decodeEscapedUnicode('\\u4e2d\\u95f4\\u90a3\\u4e2a\\u53e5\\u6bb5');
  return null;
}

function inferDeleteLayerArgumentsFromText(userText: string): Partial<AiChatToolCall['arguments']> {
  const normalizedText = userText.trim();
  if (!normalizedText) return {};

  let layerType: 'translation' | 'transcription' | undefined;
  if (
    escapedUnicodeRegExp('(\\u7ffb\\u8bd1\\u5c42|\\u8bd1\\u6587\\u5c42)', 'i').test(normalizedText)
  )
    layerType = 'translation';
  if (
    escapedUnicodeRegExp(
      '(\\u8f6c\\u5199\\u5c42|\\u8f6c\\u5f55\\u5c42|\\u542c\\u5199\\u5c42)',
      'i',
    ).test(normalizedText)
  )
    layerType = 'transcription';

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

interface ToolContextFillSpec {
  unitId?: boolean;
  translationLayerId?: boolean;
  linkBothLayers?: boolean;
  layerTargetInference?: boolean;
}

interface ToolStrategy {
  label: string;
  contextFill?: ToolContextFillSpec;
  validateArgs?: (args: Record<string, unknown>) => string | null;
  riskSpec?: {
    summary: (args: Record<string, unknown>) => string;
    preview: string[];
  };
}

const SEGMENT_SELECTION_COMPATIBLE_TOOLS: ReadonlySet<AiChatToolName> = new Set([
  ...getAiToolSegmentExecutionToolNames(),
  'merge_prev',
  'merge_next',
]);

function toolSupportsSegmentSelectionTarget(callName: AiChatToolName): boolean {
  return SEGMENT_SELECTION_COMPATIBLE_TOOLS.has(callName);
}

export function resolveSelectionTargetPatchForTool(
  callName: AiChatToolName,
  context: AiPromptContext | null | undefined,
): Record<string, string> | null {
  const short = context?.shortTerm;
  const activeUnitId = getFirstNonEmptyString(short?.activeUnitId);
  const activeSegmentUnitId = getFirstNonEmptyString(short?.activeSegmentUnitId);
  const selectedUnitKind = short?.selectedUnitKind;

  if (toolSupportsSegmentSelectionTarget(callName)) {
    if (
      (selectedUnitKind === 'segment' || activeSegmentUnitId.length > 0) &&
      activeSegmentUnitId.length > 0
    ) {
      return { segmentId: activeSegmentUnitId };
    }
    return null;
  }
  if (activeUnitId.length > 0) {
    return { unitId: activeUnitId };
  }
  return null;
}

const TOOL_STRATEGY_TABLE: Record<AiChatToolName, ToolStrategy> = {
  create_transcription_segment: {
    label: '\\u521b\\u5efa\\u53e5\\u6bb5',
    contextFill: { unitId: true },
    validateArgs: validateSegmentTargetArgs,
  },
  split_transcription_segment: {
    label: '\\u5207\\u5206\\u53e5\\u6bb5',
    contextFill: { unitId: true },
    validateArgs: (args) => validateSegmentTargetArgs(args) ?? validateSplitSegmentArgs(args),
  },
  merge_transcription_segments: {
    label: '\\u5408\\u5e76\\u53e5\\u6bb5',
    contextFill: {},
    validateArgs: (args) => {
      const segmentIds = getNormalizedIdList(args.segmentIds);
      return segmentIds.length >= 2
        ? null
        : '\\u7f3a\\u5c11\\u81f3\\u5c11 2 \\u4e2a\\u76ee\\u6807\\u53e5\\u6bb5';
    },
  },
  delete_transcription_segment: {
    label: '\\u5220\\u9664\\u53e5\\u6bb5',
    contextFill: { unitId: true },
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
    contextFill: { unitId: true, translationLayerId: true },
    validateArgs: (args) => validateSegmentTargetArgs(args) ?? validateArgId(args, 'layerId', true),
  },
  set_transcription_text: {
    label: '\\u5199\\u5165\\u8f6c\\u5199',
    contextFill: { unitId: true },
    validateArgs: (args) => validateArgText(args) ?? validateSegmentTargetArgs(args),
  },
  set_translation_text: {
    label: '\\u5199\\u5165\\u7ffb\\u8bd1',
    contextFill: { unitId: true, translationLayerId: true },
    validateArgs: (args) =>
      validateArgText(args) ??
      validateSegmentTargetArgs(args) ??
      validateArgId(args, 'layerId', true),
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
    validateArgs: validateDeleteLayerArgs,
    riskSpec: {
      summary: (args) => {
        const layerId = typeof args.layerId === 'string' ? args.layerId.trim() : '';
        const layerType = typeof args.layerType === 'string' ? args.layerType.trim() : '';
        const languageQuery =
          typeof args.languageQuery === 'string' ? args.languageQuery.trim() : '';
        const typeLabel =
          layerType === 'transcription'
            ? '\\u8f6c\\u5199\\u5c42'
            : layerType === 'translation'
              ? '\\u7ffb\\u8bd1\\u5c42'
              : '\\u5c42';
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
  add_host: {
    label: 'add_host',
    contextFill: { linkBothLayers: true },
    validateArgs: validateLinkLayerArgs,
  },
  remove_host: {
    label: 'remove_host',
    contextFill: { linkBothLayers: true },
    validateArgs: validateLinkLayerArgs,
  },
  switch_preferred_host: {
    label: 'switch_preferred_host',
    contextFill: { linkBothLayers: true },
    validateArgs: validateLinkLayerArgs,
  },
  auto_gloss_unit: {
    label: '\\u81ea\\u52a8\\u8bcd\\u6c47\\u6807\\u6ce8',
    contextFill: { unitId: true },
    validateArgs: validateSegmentTargetArgs,
  },
  set_token_pos: {
    label: '\\u8bbe\\u7f6e\\u8bcd\\u6027',
    contextFill: { unitId: true },
    validateArgs: (args) => validateArgId(args, 'unitId', false),
  },
  set_token_gloss: {
    label: '\\u8bbe\\u7f6e\\u8bcd\\u6c47\\u6807\\u6ce8',
    contextFill: {},
    validateArgs: (args) => validateArgId(args, 'tokenId', true),
  },
  propose_changes: {
    label: '\\u9884\\u89c8 AI \\u53d8\\u66f4',
    contextFill: {},
    validateArgs: () => null,
    riskSpec: {
      summary: (args) => {
        const raw = args.changes;
        const n = Array.isArray(raw) ? raw.length : 0;
        return n > 0
          ? `\\u5c06\\u5e94\\u7528 ${n} \\u9879\\u7ed3\\u6784\\u5316\\u53d8\\u66f4\\uff08\\u9700\\u786e\\u8ba4\\uff09`
          : '\\u5c06\\u5e94\\u7528\\u6279\\u91cf\\u7ed3\\u6784\\u5316\\u53d8\\u66f4\\uff08\\u9700\\u786e\\u8ba4\\uff09';
      },
      preview: [
        '\\u786e\\u8ba4\\u540e\\u4f1a\\u6309\\u5e8f\\u6267\\u884c\\u5b50\\u5de5\\u5177\\u8c03\\u7528',
        '\\u6bcf\\u4e2a\\u5b50\\u64cd\\u4f5c\\u901a\\u5e38\\u4f1a\\u4ea7\\u751f\\u72ec\\u7acb\\u64a4\\u9500\\u70b9',
        '\\u82e5\\u65f6\\u8f74/\\u9009\\u533a\\u5df2\\u53d8\\uff0c\\u95e8\\u63a7\\u53ef\\u80fd\\u963b\\u6b62\\u786e\\u8ba4',
      ],
    },
  },
  play_pause: { label: '\\u64ad\\u653e/\\u6682\\u505c', contextFill: {}, validateArgs: () => null },
  undo: { label: '\\u64a4\\u9500', contextFill: {}, validateArgs: () => null },
  redo: { label: '\\u91cd\\u505a', contextFill: {}, validateArgs: () => null },
  search_segments: {
    label: '\\u641c\\u7d22\\u53e5\\u6bb5',
    contextFill: {},
    validateArgs: (args) => validateArgText({ text: args.query }),
  },
  toggle_notes: {
    label: '\\u5207\\u6362\\u5907\\u6ce8',
    contextFill: {},
    validateArgs: () => null,
  },
  mark_segment: {
    label: '\\u6807\\u8bb0\\u53e5\\u6bb5',
    contextFill: {},
    validateArgs: () => null,
  },
  delete_segment: {
    label: '\\u5220\\u9664\\u53e5\\u6bb5',
    contextFill: {},
    validateArgs: () => null,
  },
  auto_gloss_segment: {
    label: '\\u81ea\\u52a8\\u6807\\u6ce8',
    contextFill: { unitId: true },
    validateArgs: (args) =>
      validateArgId(args, 'segmentId', false) ?? validateArgId(args, 'unitId', false),
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
    contextFill: { unitId: true },
    validateArgs: validateOptionalSegmentTargetArgs,
  },
  merge_next: {
    label: '\\u5408\\u5e76\\u4e0b\\u4e00\\u4e2a',
    contextFill: { unitId: true },
    validateArgs: validateOptionalSegmentTargetArgs,
  },
  get_current_segment: {
    label: '\\u83b7\\u53d6\\u5f53\\u524d\\u53e5\\u6bb5',
    contextFill: {},
    validateArgs: () => null,
  },
  get_project_summary: {
    label: '\\u83b7\\u53d6\\u9879\\u76ee\\u6458\\u8981',
    contextFill: {},
    validateArgs: () => null,
  },
  get_recent_history: {
    label: '\\u83b7\\u53d6\\u6700\\u8fd1\\u5386\\u53f2',
    contextFill: {},
    validateArgs: () => null,
  },
};

export function planToolCallTargets(
  call: AiChatToolCall,
  userText: string,
  context: AiPromptContext | null | undefined,
): ToolPlannerResult {
  const shortTerm = context?.shortTerm;
  const currentUnitId = getFirstNonEmptyString(shortTerm?.activeUnitId);
  const currentSegmentId = getFirstNonEmptyString(shortTerm?.activeSegmentUnitId);
  const selectedUnitIds = getNormalizedIdList(shortTerm?.selectedUnitIds);
  const currentAudioTimeSec =
    typeof shortTerm?.audioTimeSec === 'number' && Number.isFinite(shortTerm.audioTimeSec)
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
    delete nextCall.arguments.unitId;
  }
  if (
    call.name === 'merge_transcription_segments' ||
    call.name === 'delete_transcription_segment'
  ) {
    delete nextCall.arguments.unitIds;
  }
  const parsedSegmentSelector = extractSegmentSelectorFromUserText(userText);
  const activeSelectionTargetPatch = resolveSelectionTargetPatchForTool(call.name, context);

  const ensureUnitId = (): string => {
    const existingSegmentId = getFirstNonEmptyString(nextCall.arguments.segmentId);
    if (existingSegmentId) {
      return existingSegmentId;
    }
    const existing = getFirstNonEmptyString(nextCall.arguments.unitId);
    if (existing) {
      if (currentUnitId && existing !== currentUnitId) {
        nextCall.arguments.unitId = currentUnitId;
        if (call.name === 'auto_gloss_segment') {
          nextCall.arguments.segmentId = currentUnitId;
        }
        return currentUnitId;
      }
      return existing;
    }
    if (currentUnitId) {
      nextCall.arguments.unitId = currentUnitId;
      if (call.name === 'auto_gloss_segment') {
        nextCall.arguments.segmentId = currentUnitId;
      }
      return currentUnitId;
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
    delete nextCall.arguments.unitId;
    return segmentId;
  };

  const cf = TOOL_STRATEGY_TABLE[call.name]?.contextFill;

  if (requiresConcreteLanguageTarget(call.name)) {
    if (
      isAmbiguousLanguageTarget(nextCall.arguments.languageId) &&
      isAmbiguousLanguageTarget(nextCall.arguments.languageQuery)
    ) {
      return { decision: 'clarify', call: nextCall, reason: 'missing-language-target' };
    }
  }

  if (call.name === 'delete_transcription_segment') {
    const hasExplicitDeleteTarget =
      getDeleteTargetIds(nextCall.arguments).length > 0 || hasSegmentSelector(nextCall.arguments);
    if (
      hasSegmentSelector(nextCall.arguments) &&
      segmentSelectorNeedsAnchor(nextCall.arguments) &&
      !currentUnitId &&
      !currentSegmentId
    ) {
      return { decision: 'clarify', call: nextCall, reason: 'missing-unit-target' };
    }
    const refersAllSelectedSegments =
      /(\u6240\u6709|\u5168\u90e8|\u5168\u4f53|all)/i.test(userText) &&
      /(\u53e5\u6bb5|\u5206\u6bb5|segment)/i.test(userText);

    if (!hasExplicitDeleteTarget && !hasDeleteAllSegmentsScope(nextCall.arguments)) {
      if (refersAllSelectedSegments && selectedUnitIds.length > 1) {
        nextCall.arguments.segmentIds = selectedUnitIds;
      } else if (refersAllSelectedSegments) {
        nextCall.arguments.allSegments = true;
      } else if (parsedSegmentSelector) {
        Object.assign(nextCall.arguments, parsedSegmentSelector);
        if (segmentSelectorNeedsAnchor(nextCall.arguments) && !currentUnitId && !currentSegmentId) {
          return { decision: 'clarify', call: nextCall, reason: 'missing-unit-target' };
        }
      } else {
        const selectedTargetPatch = resolveSelectionTargetPatchForTool(call.name, context);
        if (selectedTargetPatch?.segmentId) {
          nextCall.arguments.segmentId = selectedTargetPatch.segmentId;
        }
        const segmentId = ensureSegmentScopedTarget();
        if (!getFirstNonEmptyString(nextCall.arguments.segmentId) && !segmentId) {
          return { decision: 'clarify', call: nextCall, reason: 'missing-unit-target' };
        }
      }
    }

    if (
      !hasDeleteAllSegmentsScope(nextCall.arguments) &&
      getDeleteTargetIds(nextCall.arguments).length === 0 &&
      !hasSegmentSelector(nextCall.arguments)
    ) {
      return { decision: 'clarify', call: nextCall, reason: 'missing-unit-target' };
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
        return { decision: 'clarify', call: nextCall, reason: 'missing-unit-target' };
      }
    }
  }

  if (call.name === 'merge_prev' || call.name === 'merge_next') {
    delete nextCall.arguments.segmentIndex;
    delete nextCall.arguments.segmentPosition;
    const segmentId = ensureSegmentScopedTarget();
    if (!segmentId) {
      return { decision: 'clarify', call: nextCall, reason: 'missing-unit-target' };
    }
  }

  if (
    cf?.unitId &&
    call.name !== 'delete_transcription_segment' &&
    call.name !== 'merge_prev' &&
    call.name !== 'merge_next'
  ) {
    if (
      !getFirstNonEmptyString(nextCall.arguments.segmentId, nextCall.arguments.unitId) &&
      !hasSegmentSelector(nextCall.arguments) &&
      parsedSegmentSelector
    ) {
      Object.assign(nextCall.arguments, parsedSegmentSelector);
      if (segmentSelectorNeedsAnchor(nextCall.arguments) && !currentUnitId && !currentSegmentId) {
        return { decision: 'clarify', call: nextCall, reason: 'missing-unit-target' };
      }
    }
    if (!hasSegmentSelector(nextCall.arguments)) {
      const segmentId = ensureSegmentScopedTarget();
      if (toolSupportsSegmentSelectionTarget(call.name)) {
        if (!segmentId) {
          return { decision: 'clarify', call: nextCall, reason: 'missing-unit-target' };
        }
      } else if (!segmentId) {
        const unitId = ensureUnitId();
        if (!unitId) {
          return { decision: 'clarify', call: nextCall, reason: 'missing-unit-target' };
        }
      }
    }
  }

  if (call.name === 'split_transcription_segment') {
    const rawSplitTime = nextCall.arguments.splitTime;
    const splitTime =
      typeof rawSplitTime === 'number' && Number.isFinite(rawSplitTime)
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
    const refersCurrentLayerPair = escapedUnicodeRegExp(
      '(\\u5f53\\u524d|\\u8fd9\\u5c42|\\u8be5\\u5c42|\\u672c\\u5c42|\\u5f53\\u524d\\u5c42)',
      'i',
    ).test(userText);

    if (
      transcriptionLayerId &&
      selectedTranscriptionLayerId &&
      transcriptionLayerId !== selectedTranscriptionLayerId
    ) {
      nextCall.arguments.transcriptionLayerId = selectedTranscriptionLayerId;
      transcriptionLayerId = selectedTranscriptionLayerId;
    }
    if (
      !transcriptionLayerId &&
      !transcriptionLayerKey &&
      selectedTranscriptionLayerId &&
      refersCurrentLayerPair
    ) {
      nextCall.arguments.transcriptionLayerId = selectedTranscriptionLayerId;
    }

    let translationLayerId = getFirstNonEmptyString(
      nextCall.arguments.translationLayerId,
      nextCall.arguments.layerId,
    );
    if (
      translationLayerId &&
      selectedTranslationLayerId &&
      translationLayerId !== selectedTranslationLayerId
    ) {
      nextCall.arguments.translationLayerId = selectedTranslationLayerId;
      translationLayerId = selectedTranslationLayerId;
    }
    if (!translationLayerId && selectedTranslationLayerId && refersCurrentLayerPair) {
      nextCall.arguments.translationLayerId = selectedTranslationLayerId;
    }

    const hasTranscriptionTarget =
      getFirstNonEmptyString(
        nextCall.arguments.transcriptionLayerId,
        nextCall.arguments.transcriptionLayerKey,
      ).length > 0;
    const hasTranslationTarget =
      getFirstNonEmptyString(nextCall.arguments.translationLayerId, nextCall.arguments.layerId)
        .length > 0;
    if (!hasTranscriptionTarget || !hasTranslationTarget) {
      return { decision: 'clarify', call: nextCall, reason: 'missing-layer-link-target' };
    }
  }

  if (cf?.layerTargetInference) {
    let layerId = getFirstNonEmptyString(nextCall.arguments.layerId);

    if (layerId) {
      const knownIds = [
        selectedLayerId,
        selectedTranscriptionLayerId,
        selectedTranslationLayerId,
      ].filter(Boolean);
      if (!knownIds.includes(layerId)) {
        nextCall.arguments = { ...nextCall.arguments };
        delete nextCall.arguments.layerId;
        layerId = '';
      }
    }

    if (!layerId) {
      const inferred = inferDeleteLayerArgumentsFromText(userText);
      nextCall.arguments = { ...nextCall.arguments, ...inferred };

      const refersCurrentLayer = escapedUnicodeRegExp(
        '(\\u5f53\\u524d|\\u8fd9\\u5c42|\\u8be5\\u5c42|\\u672c\\u5c42).*(\\u5c42)|\\u5220\\u9664\\u5f53\\u524d\\u5c42|\\u5220\\u9664\\u8fd9\\u5c42',
        'i',
      ).test(userText);
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
  return escapedUnicodeRegExp(
    '^(\\u8fd9\\u4e2a|\\u8fd9\\u4e2a\\u5427|\\u5c31\\u8fd9\\u4e2a|\\u5b83|\\u5b83\\u5427|\\u5c31\\u5b83|\\u8fd9\\u6761|\\u8be5\\u6761|\\u8fd9\\u4e00\\u6761|\\u8fd9\\u4e2a\\u53e5\\u6bb5|\\u8be5\\u53e5\\u6bb5|\\u8fd9\\u4e2a\\u5b57\\u6bb5|\\u8be5\\u5b57\\u6bb5|\\u8fd9\\u91cc|\\u6b64\\u5904|\\u5728\\u8fd9\\u91cc|\\u5728\\u6b64\\u5904|\\u5c31\\u8fd9\\u91cc|\\u5c31\\u6b64\\u5904)$',
    'i',
  ).test(normalized);
}

export function extractClarifyLanguagePatch(userText: string): Record<string, string> | null {
  const trimmed = userText
    .trim()
    .replace(escapedUnicodeRegExp('[\\u7684\\u90a3\\u4e2a\\u5427]$', 'g'), '')
    .trim();
  if (!trimmed || trimmed.length > 20) return null;
  const resolved = resolveLanguageQuery(trimmed);
  if (!resolved) return null;
  return { languageId: resolved, languageQuery: trimmed };
}

export function extractClarifySplitPositionPatch(
  userText: string,
  context: AiPromptContext | null | undefined,
): Record<string, number | string> | null {
  if (
    !escapedUnicodeRegExp(
      '^(\\u8fd9\\u91cc|\\u6b64\\u5904|\\u5728\\u8fd9\\u91cc|\\u5728\\u6b64\\u5904|\\u5c31\\u8fd9\\u91cc|\\u5c31\\u6b64\\u5904)$',
      'i',
    ).test(userText.trim())
  )
    return null;
  const audioTimeSec = context?.shortTerm?.audioTimeSec;
  if (typeof audioTimeSec !== 'number' || !Number.isFinite(audioTimeSec)) return null;
  const targetPatch = resolveSelectionTargetPatchForTool('split_transcription_segment', context);
  if (!targetPatch) return null;
  return { ...targetPatch, splitTime: audioTimeSec };
}

function hasResolvableSelectionTargetForTool(
  callName: AiChatToolName,
  context: AiPromptContext | null | undefined,
): boolean {
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
  const policy = getAiToolPolicy(callName);

  if (policy.targetKind === 'segment' && policy.requiresExplicitTarget) {
    if (callName === 'merge_transcription_segments') {
      return selectedUnitIds.length > 1;
    }
    if (callName === 'set_translation_text' || callName === 'clear_translation_segment') {
      return selectionTargetPatch !== null && selectedTranslationLayerId.length > 0;
    }
    if (callName === 'delete_transcription_segment' && selectedUnitIds.length > 1) {
      return true;
    }
    return selectionTargetPatch !== null;
  }
  if (policy.targetKind === 'layer' && policy.requiresExplicitTarget) {
    return selectedLayerId.length > 0;
  }
  if (policy.targetKind === 'layer_link' && policy.requiresExplicitTarget) {
    return selectedTranscriptionLayerId.length > 0 && selectedTranslationLayerId.length > 0;
  }
  return false;
}

function wasRecentAssistantClarification(messages: UiChatMessage[]): boolean {
  const latestAssistant = messages.find(
    (item) => item.role === 'assistant' && item.content.trim().length > 0,
  );
  if (!latestAssistant) return false;
  return escapedUnicodeRegExp(
    '(\\u8fd8\\u4e0d\\u591f\\u786e\\u5b9a|\\u8fd8\\u4e0d\\u80fd\\u5b89\\u5168\\u6267\\u884c|\\u7f3a\\u5c11\\u76ee\\u6807|\\u8bf7\\u5148\\u9009\\u4e2d\\u76ee\\u6807)',
  ).test(latestAssistant.content);
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

export function assessToolActionIntent(
  userText: string,
  options?: ToolIntentAssessmentOptions,
): ToolIntentAssessment {
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

  const cancelPattern = escapedUnicodeRegExp(
    '^(\\u7b97\\u4e86|\\u4e0d\\u505a\\u4e86|\\u4e0d\\u7528\\u4e86|\\u53d6\\u6d88|\\u53d6\\u6d88\\u5427|\\u522b[\\u505a\\u5220\\u5efa]\\u4e86|\\u4e0d\\u8981\\u4e86|never\\s*mind|cancel|forget\\s*it|stop|nvm|\\u6ca1\\u4e8b\\u4e86|\\u4e0d\\u9700\\u8981\\u4e86|\\u8fd8\\u662f\\u7b97\\u4e86)$',
    'i',
  );
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

  const executionCuePattern = escapedUnicodeRegExp(
    '(\\u8bf7\\u5e2e|\\u8bf7\\u628a|\\u8bf7\\u5c06|\\u5e2e\\u6211|\\u628a|\\u5c06|\\u7ed9\\u6211|\\u6267\\u884c|run|do|please|\\u9ebb\\u70e6|\\u5e2e\\u5fd9|\\u53ef\\u5426|\\u53ef\\u4ee5\\u628a|\\u5f53\\u524d|\\u6b64)',
    'i',
  );
  const actionVerbPattern = escapedUnicodeRegExp(
    '(\\u521b\\u5efa|\\u65b0\\u5efa|\\u65b0\\u589e|\\u5207\\u5206|\\u62c6\\u5206|\\u5408\\u5e76|\\u5220\\u9664|\\u6e05\\u7a7a|\\u79fb\\u9664|\\u5199\\u5165|\\u586b\\u5199|\\u586b\\u5165|\\u8bbe\\u7f6e|\\u8bbe\\u4e3a|\\u4fee\\u6539|\\u6539\\u6210|\\u6539\\u4e3a|\\u66f4\\u65b0|\\u8986\\u76d6|\\u66ff\\u6362|\\u5173\\u8054|\\u94fe\\u63a5|\\u89e3\\u9664|\\u65ad\\u5f00|\\u81ea\\u52a8\\u6807\\u6ce8|\\u8f6c\\u5199|\\u7ffb\\u8bd1|create|add|insert|split|merge|delete|remove|clear|set|update|replace|link|unlink|gloss)',
    'i',
  );
  // 含「句段」与口语「语段」；后者常见于用户说法但与 UI 文案「句段」不同 | Colloquial 语段 vs product 句段
  const actionTargetPattern = escapedUnicodeRegExp(
    '(\\u53e5\\u6bb5|\\u8bed\\u6bb5|\\u6bb5\\u843d|segment|\\u5c42|layer|\\u8f6c\\u5199|\\u7ffb\\u8bd1|\\u6587\\u672c|text|gloss|\\u8bcd\\u4e49|unit|\\u5f53\\u524d|\\u6b64|\\u8fd9\\u4e2a|\\u90a3\\u4e2a|\\u8fd9\\u4e24\\u4e2a|\\u90a3\\u4e24\\u4e2a|\\u4e24\\u4e2a)',
    'i',
  );
  const actionObjectPronounPattern = escapedUnicodeRegExp(
    '(\\u4e4b|\\u5b83|\\u5176|\\u8fd9\\u6761|\\u8be5\\u6761|\\u672c\\u6761|\\u6b64\\u6761|\\u8fd9\\u4e2a|\\u90a3\\u4e2a|\\u8be5)$',
    'i',
  );
  const explicitIdPattern = escapedUnicodeRegExp(
    '(unitId|layerId|transcriptionLayerId|translationLayerId|\\bu\\d+\\b|\\blayer[-_a-z0-9]+\\b|\\u5f53\\u524d|\\u6b64|\\u8fd9\\u4e2a|\\u90a3\\u4e2a|\\u8be5|\\u8fd9\\u4e24\\u4e2a|\\u90a3\\u4e24\\u4e2a|\\u4e24\\u4e2a)',
    'i',
  );

  let score = 0;
  const hasExecutionCue = executionCuePattern.test(trimmed);
  const hasActionVerb = actionVerbPattern.test(trimmed);
  const hasActionTarget =
    actionTargetPattern.test(trimmed) ||
    (actionVerbPattern.test(trimmed) && actionObjectPronounPattern.test(trimmed));
  const hasExplicitId = explicitIdPattern.test(trimmed);

  if (hasExecutionCue) score += 1;
  if (hasActionVerb) score += 2;
  if (hasActionTarget) score += 2;
  if (hasExplicitId) score += 1;

  const greetingPattern = escapedUnicodeRegExp(
    '^(\\u4f60\\u597d|\\u60a8\\u597d|\\u55e8|hello|hi|hey)([！!，,.。?？\\s].*)?$',
    'i',
  );
  const metaQuestionPattern = escapedUnicodeRegExp(
    '(\\u4ec0\\u4e48\\u662f|\\u662f\\u4ec0\\u4e48\\u610f\\u601d|\\u4ec0\\u4e48\\u610f\\u601d|\\u8bf7\\u89e3\\u91ca|\\u89e3\\u91ca\\u4e00\\u4e0b|\\u89e3\\u91ca|\\u8bf4\\u660e\\u4e00\\u4e0b|\\u8bf4\\u660e|\\u542b\\u4e49|\\u7528\\u6cd5|\\u533a\\u522b|\\u539f\\u7406|why|what is|what does|explain|meaning|how to use)',
    'i',
  );
  const technicalDiscussionPattern = escapedUnicodeRegExp(
    '(tool_call|set_translation_text|set_transcription_text|delete_layer|create_translation_layer|create_transcription_layer|\\u547d\\u4ee4|\\u6307\\u4ee4|\\u51fd\\u6570|\\u63a5\\u53e3|api)',
    'i',
  );
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
  return isAiToolDestructive(name);
}

function describeToolCallImpact(call: AiChatToolCall): {
  riskSummary: string;
  impactPreview: string[];
} {
  const spec = TOOL_STRATEGY_TABLE[call.name];
  if (spec?.riskSpec) {
    return {
      riskSummary: decodeEscapedUnicode(spec.riskSpec.summary(call.arguments)),
      impactPreview: spec.riskSpec.preview.map(decodeEscapedUnicode),
    };
  }
  return {
    riskSummary: decodeEscapedUnicode(
      `\\u8be5\\u64cd\\u4f5c\\u4f1a\\u4fee\\u6539\\u6570\\u636e：${call.name}`,
    ),
    impactPreview: [
      decodeEscapedUnicode(
        '\\u8bf7\\u786e\\u8ba4\\u76ee\\u6807\\u4e0e\\u5f71\\u54cd\\u540e\\u518d\\u7ee7\\u7eed。',
      ),
    ],
  };
}

export function buildPreviewContract(
  call: AiChatToolCall,
  context?: AiPromptContext | null,
): PreviewContract {
  const args = call.arguments;
  if (call.name === 'delete_transcription_segment') {
    if (hasDeleteAllSegmentsScope(args)) {
      return {
        affectedCount: getContextScopeOrProjectUnitCount(context),
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
  if (call.name === 'propose_changes') {
    const raw = args.changes;
    const n = Array.isArray(raw) ? raw.length : 0;
    return {
      affectedCount: Math.max(1, n),
      affectedIds: [],
      reversible: true,
      cascadeTypes: ['transcription', 'translation'],
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

export function toNaturalToolPending(
  locale: Locale,
  callName: AiChatToolName,
  style: AiToolFeedbackStyle,
): string {
  return formatToolPendingMessage(locale, toToolActionLabel(callName), style);
}

export function toNaturalToolGraySkipped(
  locale: Locale,
  callName: AiChatToolName,
  style: AiToolFeedbackStyle,
): string {
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
  memoryRecallShape?: AiMemoryRecallShapeTelemetry,
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
    ...(memoryRecallShape ? { memoryRecallShape } : {}),
  };
}

export function buildToolIntentAuditMetadata(
  assistantMessageId: string,
  toolCall: AiChatToolCall,
  context: ToolAuditContext,
): ToolIntentAuditMetadata {
  const evidenceSourceRefs = evidenceSourceRefsFromToolCallForAudit(toolCall);
  return {
    schemaVersion: 1,
    phase: 'intent',
    requestId: toolCall.requestId ?? buildAiToolRequestId(toolCall),
    assistantMessageId,
    toolCall,
    context,
    ...(evidenceSourceRefs.length > 0 ? { evidenceSourceRefs } : {}),
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
  executionProgress?: ToolDecisionAuditMetadata['executionProgress'],
  proposeRollback?: ToolDecisionAuditMetadata['proposeRollback'],
): ToolDecisionAuditMetadata {
  const evidenceSourceRefs = evidenceSourceRefsFromToolCallForAudit(toolCall);
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
    ...(context.memoryRecallShape ? { memoryRecallShape: context.memoryRecallShape } : {}),
    ...(message ? { message } : {}),
    ...(reason ? { reason } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(executionProgress ? { executionProgress } : {}),
    ...(proposeRollback ? { proposeRollback } : {}),
    ...(evidenceSourceRefs.length > 0 ? { evidenceSourceRefs } : {}),
  };
}

export function toNaturalToolCancelled(
  locale: Locale,
  callName: AiChatToolName,
  style: AiToolFeedbackStyle,
): string {
  return formatToolCancelledMessage(locale, toToolActionLabel(callName), style);
}

export function toNaturalNonActionFallback(userText: string, style: AiToolFeedbackStyle): string {
  return formatNonActionFallback(userText, style);
}

export function toNaturalActionClarify(
  callName: AiChatToolName,
  style: AiToolFeedbackStyle,
): string {
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
  if (reason === 'missing-unit-target') {
    const selectionTargetPatch = resolveSelectionTargetPatchForTool(callName, context);
    if (selectionTargetPatch?.segmentId) {
      candidates.push({
        key: '1',
        label: `\\u5f53\\u524d\\u9009\\u4e2d\\u53e5\\u6bb5（${selectionTargetPatch.segmentId}）`,
        argsPatch: selectionTargetPatch,
      });
    }
  }
  if (reason === 'missing-layer-target' && selectedLayerId) {
    candidates.push({
      key: '1',
      label: `\\u5f53\\u524d\\u9009\\u4e2d\\u5c42（${selectedLayerId}）`,
      argsPatch: { layerId: selectedLayerId },
    });
  }
  if (reason === 'missing-translation-layer-target' && selectedTranslationLayerId) {
    candidates.push({
      key: '1',
      label: `\\u5f53\\u524d\\u9009\\u4e2d\\u7ffb\\u8bd1\\u5c42（${selectedTranslationLayerId}）`,
      argsPatch: { layerId: selectedTranslationLayerId },
    });
  }
  if (
    reason === 'missing-layer-link-target' &&
    selectedTranscriptionLayerId &&
    selectedTranslationLayerId
  ) {
    candidates.push({
      key: '1',
      label: `\\u5f53\\u524d\\u9009\\u4e2d\\u5c42\\u5bf9（${selectedTranscriptionLayerId} -> ${selectedTranslationLayerId}）`,
      argsPatch: {
        transcriptionLayerId: selectedTranscriptionLayerId,
        translationLayerId: selectedTranslationLayerId,
      },
    });
  }
  if (reason === 'missing-language-target' && callName === 'create_transcription_layer') {
    const lastLang = sessionMemory?.preferences?.lastLanguage ?? sessionMemory?.lastLanguage;
    if (lastLang && lastLang !== 'zho' && lastLang !== 'eng') {
      candidates.push({
        key: `${candidates.length}`,
        label: `\\u4e0a\\u6b21\\u4f7f\\u7528（${lastLang}）`,
        argsPatch: { languageId: lastLang },
      });
    }
    candidates.push({
      key: `${candidates.length}`,
      label: '\\u521b\\u5efa\\u4e2d\\u6587\\u8f6c\\u5199\\u5c42（zho）',
      argsPatch: { languageId: 'zho' },
    });
    candidates.push({
      key: `${candidates.length}`,
      label: '\\u521b\\u5efa\\u82f1\\u6587\\u8f6c\\u5199\\u5c42（eng）',
      argsPatch: { languageId: 'eng' },
    });
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
    return formatTargetClarify(actionLabel, 'missing-unit-target', style);
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

function looksLikeJsonishAssistantReply(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  if (/^```(?:json)?[\s\S]*```$/i.test(trimmed)) return true;
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    return true;
  }
  return false;
}

export function normalizeJsonishAssistantReply(
  content: string,
  userText: string,
  style: AiToolFeedbackStyle,
): string | null {
  if (!looksLikeJsonishAssistantReply(content)) return null;

  const rawCall = parseRawToolCallEnvelope(content);
  if (rawCall) {
    const actionLabel = inferFallbackActionLabel(userText, rawCall.name);
    if (looksLikeSegmentScopedTool(rawCall.name, rawCall.arguments)) {
      return formatTargetClarify(actionLabel, 'missing-unit-target', style);
    }
    return formatActionClarify(actionLabel, style);
  }

  return formatNonActionFallback(userText, style);
}

export function isAmbiguousTargetRiskSummary(summary: string): boolean {
  const normalized = summary.toLowerCase();
  return (
    normalized.includes(decodeEscapedUnicode('\\u5339\\u914d\\u5230\\u591a\\u4e2a')) ||
    normalized.includes(decodeEscapedUnicode('\\u76ee\\u6807\\u4e0d\\u552f\\u4e00')) ||
    normalized.includes('multiple') ||
    normalized.includes('ambiguous')
  );
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
