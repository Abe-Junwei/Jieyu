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
import { isAiToolDestructive } from '../policy/aiToolPolicyMatrix';
import { evidenceSourceRefsFromToolCallForAudit } from '../vertical/evidenceSourceRef';
import { getDeleteTargetIds, hasDeleteAllSegmentsScope } from './toolCallValidation';
import type {
  ToolAuditContext,
  ToolDecisionAuditMetadata,
  ToolIntentAssessment,
  ToolIntentAssessmentOptions,
  ToolIntentAuditMetadata,
  ToolPlannerClarifyReason,
  ToolPlannerResult,
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
import { hasResolvableSelectionTargetForTool } from './toolCallPlanner';
export {
  planToolCallTargets,
  resolveSelectionTargetPatchForTool,
  extractClarifyLanguagePatch,
  extractClarifySplitPositionPatch,
  buildClarifyCandidates,
} from './toolCallPlanner';
import { TOOL_STRATEGY_TABLE, toolSupportsSegmentSelectionTarget } from './toolCallStrategy';
export { TOOL_STRATEGY_TABLE, toolSupportsSegmentSelectionTarget };

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

function isDeicticConfirmationMessage(userText: string): boolean {
  const normalized = userText.trim();
  return escapedUnicodeRegExp(
    '^(\\u8fd9\\u4e2a|\\u8fd9\\u4e2a\\u5427|\\u5c31\\u8fd9\\u4e2a|\\u5b83|\\u5b83\\u5427|\\u5c31\\u5b83|\\u8fd9\\u6761|\\u8be5\\u6761|\\u8fd9\\u4e00\\u6761|\\u8fd9\\u4e2a\\u53e5\\u6bb5|\\u8be5\\u53e5\\u6bb5|\\u8fd9\\u4e2a\\u5b57\\u6bb5|\\u8be5\\u5b57\\u6bb5|\\u8fd9\\u91cc|\\u6b64\\u5904|\\u5728\\u8fd9\\u91cc|\\u5728\\u6b64\\u5904|\\u5c31\\u8fd9\\u91cc|\\u5c31\\u6b64\\u5904)$',
    'i',
  ).test(normalized);
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
