import {
  normalizeJsonishAssistantReply,
  normalizeLegacyRiskNarration,
  normalizeUnsupportedToolCallJson,
  parseLegacyNarratedToolCall,
  parseToolCallFromText,
  planToolCallTargets,
} from '../ai/chat/toolCallHelpers';
import {
  executeLocalContextToolCall,
  formatLocalContextToolBatchResultMessage,
  formatLocalContextToolResultMessage,
  type LocalContextToolCall,
  type LocalContextToolResult,
  parseLocalContextToolCallsFromText,
} from '../ai/chat/localContextTools';
import {
  buildLocalToolStatePatchFromCallResult,
  detectLocalToolClarificationNeed,
  resolveLocalToolCalls,
} from '../ai/chat/localToolSlotResolver';
import {
  formatEmptyModelReply,
  formatEmptyModelResponseError,
} from '../ai/messages';
import { createMetricTags, recordMetric } from '../observability/metrics';
import type { AiToolFeedbackStyle } from '../ai/providers/providerCatalog';
import type { Locale } from '../i18n';
import { resolveToolDecisionPipeline } from './useAiChat.toolDecisionPipeline';
import type {
  AiChatToolCall,
  AiInteractionMetrics,
  AiPromptContext,
  AiSessionMemory,
  AiTaskSession,
  AiToolDecisionMode,
  AiToolRiskCheckResult,
  PendingAiToolCall,
  ToolAuditContext,
  UiChatMessage,
} from './useAiChat.types';

export interface ResolveAiChatStreamCompletionParams {
  assistantId: string;
  assistantContent: string;
  userText: string;
  aiContext: AiPromptContext | null;
  messages: UiChatMessage[];
  providerId: string;
  model: string;
  toolFeedbackLocale: Locale;
  toolDecisionMode: AiToolDecisionMode;
  toolFeedbackStyle: AiToolFeedbackStyle;
  allowDestructiveToolCalls: boolean;
  onToolRiskCheck?: ((call: AiChatToolCall) => Promise<AiToolRiskCheckResult | null | undefined> | AiToolRiskCheckResult | null | undefined) | null | undefined;
  preparePendingToolCall?: ((call: AiChatToolCall) => Promise<AiChatToolCall | null | undefined> | AiChatToolCall | null | undefined) | null | undefined;
  onToolCall?: ((call: AiChatToolCall) => Promise<{ ok: boolean; message: string }> | { ok: boolean; message: string }) | null | undefined;
  hasPersistedExecutionForRequest: (requestId: string) => Promise<boolean>;
  writeToolDecisionAuditLog: (
    assistantMessageId: string,
    oldValue: string,
    newValue: string,
    source: 'human' | 'ai' | 'system',
    requestId?: string,
    metadata?: any,
  ) => Promise<void>;
  writeToolIntentAuditLog: (
    assistantMessageId: string,
    callName: AiChatToolCall['name'],
    assessment: NonNullable<ToolAuditContext['intentAssessment']>,
    requestId?: string,
    metadata?: any,
  ) => Promise<void>;
  sessionMemory: AiSessionMemory;
  updateSessionMemory: (nextMemory: AiSessionMemory) => void;
  persistSessionMemory: (memory: AiSessionMemory) => void;
  setTaskSession: (value: AiTaskSession) => void;
  setPendingToolCall: (value: PendingAiToolCall | null) => void;
  taskSessionId: string;
  markExecutedRequestId: (requestId: string) => void;
  bumpMetric: (key: keyof AiInteractionMetrics) => void;
  shouldBumpRecovery: boolean;
  genRequestId: (call: AiChatToolCall, scopeMessageId?: string) => string;
  localToolCallCountRef: { current: number };
  /**
   * Fresh prompt/read-model snapshot for **local** context tools (`list_units`, `get_project_stats`, …).
   * Invoked at each tool execution (including each step of a multi-tool batch) so tools see current UI state,
   * not only the `aiContext` captured when the user message was sent.
   */
  resolveFreshAiContext?: () => AiPromptContext | null;
}

export interface ResolveAiChatStreamCompletionResult {
  finalContent: string;
  finalStatus: 'done' | 'error';
  finalErrorMessage?: string;
  connectionErrorMessage?: string;
  localToolResults?: LocalContextToolResult[];
}

function buildLocalToolClarificationMessage(
  reason: 'metric_ambiguous' | 'scope_ambiguous' | 'query_ambiguous' | 'target_ambiguous' | 'action_ambiguous',
  locale: Locale,
): string {
  const isZh = locale === 'zh-CN';
  switch (reason) {
    case 'metric_ambiguous':
      return isZh
        ? '我可以继续查询，但“多少”还不够明确。你是想看语段数、说话人数、翻译层数、未转写数量，还是缺少说话人数量？同时请告诉我是当前范围、当前音频，还是整个项目。'
        : 'I can continue, but “how many” is still ambiguous. Do you mean segment count, speaker count, translation layers, untranscribed count, or missing-speaker count? Also tell me whether this is for current scope, current audio, or the whole project.';
    case 'scope_ambiguous':
      return isZh
        ? '我可以继续，但你还没有说明查询范围。请告诉我是当前范围、当前音频，还是整个项目。'
        : 'I can continue, but I still need the scope. Please tell me whether this should use the current selection, the current audio, or the whole project.';
    case 'query_ambiguous':
      return isZh
        ? '我可以继续搜索，请先告诉我关键词（例如某个词、短语或术语）。'
        : 'I can continue the search, but I need a keyword first (for example a word, phrase, or term).';
    case 'target_ambiguous':
      return isZh
        ? '我可以继续查看详情，但还不知道你指的是哪条语段。请告诉我是第几个语段，或直接给语段 ID。'
        : 'I can continue with details, but I do not know which segment you mean. Please tell me the ordinal (for example “the 2nd one”) or provide the segment ID.';
    case 'action_ambiguous':
      return isZh
        ? '我可以继续执行批量操作，但还不清楚你要做什么动作。请明确是删除、验证完成、分配说话人，还是其他具体操作。'
        : 'I can continue with the batch operation, but the intended action is unclear. Please specify whether you want to delete, mark verified, assign speaker, or another concrete action.';
    default:
      return isZh ? '请补充更具体的信息后我再继续。' : 'Please provide a bit more detail and I will continue.';
  }
}

function recordLocalToolClarificationMetric(
  reason: 'metric_ambiguous' | 'scope_ambiguous' | 'query_ambiguous' | 'target_ambiguous' | 'action_ambiguous',
  toolName: LocalContextToolCall['name'],
): void {
  recordMetric({
    id: 'ai.local_tool_clarification_needed',
    value: 1,
    tags: createMetricTags('useAiChat.streamCompletion', {
      reason,
      toolName,
    }),
  });
}

function mergeLocalToolSessionState(
  sessionMemory: AiSessionMemory,
  callResults: Array<{ call: LocalContextToolCall; ok: boolean; result: unknown }>,
): AiSessionMemory {
  const base = sessionMemory.localToolState ?? {
    updatedAt: new Date().toISOString(),
  };
  const merged = { ...base };
  for (const item of callResults) {
    const patch = buildLocalToolStatePatchFromCallResult(
      item.call,
      { ok: item.ok, result: item.result },
    );
    if (patch.lastIntent) merged.lastIntent = patch.lastIntent;
    if (patch.lastQuery) merged.lastQuery = patch.lastQuery;
    if (patch.clearLastQuery) delete merged.lastQuery;
    if (patch.lastScope) merged.lastScope = patch.lastScope;
    if (patch.lastFrame) merged.lastFrame = patch.lastFrame;
    if (patch.lastResultUnitIds !== undefined) {
      merged.lastResultUnitIds = patch.lastResultUnitIds;
    }
  }
  merged.updatedAt = new Date().toISOString();
  return {
    ...sessionMemory,
    localToolState: merged,
  };
}

export async function resolveAiChatStreamCompletion({
  assistantId,
  assistantContent,
  userText,
  aiContext,
  messages,
  providerId,
  model,
  toolFeedbackLocale,
  toolDecisionMode,
  toolFeedbackStyle,
  allowDestructiveToolCalls,
  onToolRiskCheck,
  preparePendingToolCall,
  onToolCall,
  hasPersistedExecutionForRequest,
  writeToolDecisionAuditLog,
  writeToolIntentAuditLog,
  sessionMemory,
  updateSessionMemory,
  persistSessionMemory,
  setTaskSession,
  setPendingToolCall,
  taskSessionId,
  markExecutedRequestId,
  bumpMetric,
  shouldBumpRecovery,
  genRequestId,
  localToolCallCountRef,
  resolveFreshAiContext,
}: ResolveAiChatStreamCompletionParams): Promise<ResolveAiChatStreamCompletionResult> {
  if (assistantContent.trim().length === 0) {
    const finalErrorMessage = formatEmptyModelResponseError();
    return {
      finalContent: formatEmptyModelReply(),
      finalStatus: 'error',
      finalErrorMessage,
      connectionErrorMessage: finalErrorMessage,
    };
  }

  let finalContent = assistantContent;
  let finalStatus: 'done' | 'error' = 'done';
  let finalErrorMessage: string | undefined;

  const localToolCallsParsed = parseLocalContextToolCallsFromText(assistantContent);
  if (localToolCallsParsed.length > 1) {
    const localToolResults: LocalContextToolResult[] = [];
    let rollingMemory = sessionMemory;
    for (let index = 0; index < localToolCallsParsed.length; index += 1) {
      const rawCall = localToolCallsParsed[index]!;
      const { calls: stepCalls } = resolveLocalToolCalls([rawCall], userText, rollingMemory);
      const stepCall = stepCalls[0]!;
      const clarificationNeed = detectLocalToolClarificationNeed([stepCall], userText, rollingMemory);
      if (clarificationNeed.needed) {
        recordLocalToolClarificationMetric(clarificationNeed.reason, clarificationNeed.callName);
        bumpMetric('clarifyCount');
        setTaskSession({
          id: taskSessionId,
          status: 'waiting_clarify',
          updatedAt: new Date().toISOString(),
        });
        return {
          finalContent: buildLocalToolClarificationMessage(clarificationNeed.reason, toolFeedbackLocale),
          finalStatus: 'done',
        };
      }
      const toolContext = resolveFreshAiContext?.() ?? aiContext;
      const result = await executeLocalContextToolCall(
        stepCall,
        toolContext,
        localToolCallCountRef,
      );
      localToolResults.push(result);
      rollingMemory = mergeLocalToolSessionState(rollingMemory, [
        {
          call: { name: stepCall.name, arguments: stepCall.arguments },
          ok: result.ok,
          result: result.result,
        },
      ]);
    }
    const mergedMemory = rollingMemory;
    updateSessionMemory(mergedMemory);
    persistSessionMemory(mergedMemory);
    finalContent = formatLocalContextToolBatchResultMessage(localToolResults, toolFeedbackLocale, userText);
    finalStatus = localToolResults.some((item) => !item.ok) ? 'error' : 'done';
    finalErrorMessage = finalStatus === 'error' ? 'local context tool batch failed' : undefined;
    return {
      finalContent,
      finalStatus,
      ...(finalErrorMessage ? { finalErrorMessage } : {}),
      localToolResults,
    };
  }

  if (localToolCallsParsed.length === 1) {
    const { calls: singleCalls } = resolveLocalToolCalls(localToolCallsParsed, userText, sessionMemory);
    const resolvedCall = singleCalls[0]!;
    const clarificationNeed = detectLocalToolClarificationNeed([resolvedCall], userText, sessionMemory);
    if (clarificationNeed.needed) {
      recordLocalToolClarificationMetric(clarificationNeed.reason, clarificationNeed.callName);
      bumpMetric('clarifyCount');
      setTaskSession({
        id: taskSessionId,
        status: 'waiting_clarify',
        updatedAt: new Date().toISOString(),
      });
      return {
        finalContent: buildLocalToolClarificationMessage(clarificationNeed.reason, toolFeedbackLocale),
        finalStatus: 'done',
      };
    }
    const toolContext = resolveFreshAiContext?.() ?? aiContext;
    const localToolResult = await executeLocalContextToolCall(
      resolvedCall,
      toolContext,
      localToolCallCountRef,
    );
    const mergedMemory = mergeLocalToolSessionState(
      sessionMemory,
      [{
        call: {
          name: resolvedCall.name,
          arguments: resolvedCall.arguments,
        },
        ok: localToolResult.ok,
        result: localToolResult.result,
      }],
    );
    updateSessionMemory(mergedMemory);
    persistSessionMemory(mergedMemory);
    finalContent = formatLocalContextToolResultMessage(localToolResult, toolFeedbackLocale, userText);
    finalStatus = localToolResult.ok ? 'done' : 'error';
    finalErrorMessage = localToolResult.ok ? undefined : (localToolResult.error ?? 'local context tool failed');
    return {
      finalContent,
      finalStatus,
      ...(finalErrorMessage ? { finalErrorMessage } : {}),
      localToolResults: [localToolResult],
    };
  }

  const parsedToolCall = parseToolCallFromText(assistantContent) ?? parseLegacyNarratedToolCall(assistantContent);
  const planner = parsedToolCall ? planToolCallTargets(parsedToolCall, userText, aiContext) : null;
  const toolCall = planner?.call ?? null;
  if (toolCall) {
    if (!toolCall.requestId) {
      toolCall.requestId = genRequestId(toolCall, assistantId);
    }

    const toolDecisionResult = await resolveToolDecisionPipeline({
      assistantMessageId: assistantId,
      toolCall,
      userText,
      aiContext,
      messageHistory: messages,
      providerId,
      model,
      locale: toolFeedbackLocale,
      toolDecisionMode,
      toolFeedbackStyle,
      planner,
      allowDestructiveToolCalls,
      ...(onToolRiskCheck ? { onToolRiskCheck } : {}),
      ...(preparePendingToolCall ? { preparePendingToolCall } : {}),
      ...(onToolCall ? { onToolCall } : {}),
      hasPersistedExecutionForRequest,
      writeToolDecisionAuditLog,
      writeToolIntentAuditLog,
      sessionMemory,
      updateSessionMemory,
      persistSessionMemory,
      setTaskSession,
      setPendingToolCall,
      taskSessionId,
      markExecutedRequestId,
      bumpMetric,
      shouldBumpRecovery,
    });
    finalContent = toolDecisionResult.finalContent;
    finalStatus = toolDecisionResult.finalStatus;
    finalErrorMessage = toolDecisionResult.finalErrorMessage;
  } else {
    const normalizedUnsupported = normalizeUnsupportedToolCallJson(finalContent, userText, toolFeedbackStyle);
    if (normalizedUnsupported) {
      finalContent = normalizedUnsupported;
    } else {
      const normalizedLegacy = normalizeLegacyRiskNarration(finalContent, toolFeedbackStyle);
      finalContent = normalizedLegacy !== finalContent
        ? normalizedLegacy
        : (normalizeJsonishAssistantReply(finalContent, userText, toolFeedbackStyle) ?? normalizedLegacy);
    }
  }

  finalContent = appendHallucinationWarningIfSuspicious(finalContent, aiContext);

  return {
    finalContent,
    finalStatus,
    ...(finalErrorMessage ? { finalErrorMessage } : {}),
  };
}

const NUMBERED_LIST_RE = /(?:^|\n)\s*(?:\d+\.\s+\*{0,2}\d{2}:\d{2}|\d+\.\s+\*{0,2}#?\d+\s)/g;
const TIMESTAMP_RE = /\d{2}:\d{2}[.:]\d/g;
const HALLUCINATION_WARNING = '\n\n> \u26a0\ufe0f \u4ee5\u4e0a\u5217\u8868\u53ef\u80fd\u5305\u542b\u4e0d\u51c6\u786e\u7684\u4fe1\u606f\u3002\u5efa\u8bae\u4f7f\u7528\u201c\u5217\u51fa\u6240\u6709\u8bed\u6bb5\u201d\u6307\u4ee4\u83b7\u53d6\u51c6\u786e\u6570\u636e\u3002';

function appendHallucinationWarningIfSuspicious(
  content: string,
  context: AiPromptContext | null,
): string {
  if (!content || content.length < 50) return content;

  const numberedMatches = content.match(NUMBERED_LIST_RE);
  const timestampMatches = content.match(TIMESTAMP_RE);
  const hasNumberedList = numberedMatches !== null && numberedMatches.length >= 4;
  const hasTimestampCluster = timestampMatches !== null && new Set(timestampMatches).size >= 4;

  if (!hasNumberedList && !hasTimestampCluster) return content;

  const expectedCandidates = [
    context?.shortTerm?.currentScopeUnitCount,
    context?.shortTerm?.currentMediaUnitCount,
    context?.shortTerm?.projectUnitCount,
    context?.longTerm?.projectStats?.unitCount,
    context?.longTerm?.projectStats?.utteranceCount,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  const countClaim = content.match(/(?:\u5171\u6709|total[:\s]|a\s+total\s+of)\s*(\d+)\s*(?:\u4e2a|\u6761|\u6bb5|units?\b|utterances?\b|segments?\b)/i);
  if (countClaim) {
    const claimed = parseInt(countClaim[1]!, 10);
    if (expectedCandidates.length > 0) {
      const expected = expectedCandidates[0];
      if (expected === undefined) {
        return content;
      }
      if (expectedCandidates.includes(claimed)) {
        return content;
      }
      recordMetric({
        id: 'ai.count_claim_mismatch',
        value: 1,
        tags: createMetricTags('useAiChat.streamCompletion', {
          claimed,
          expected,
        }),
      });
      return `${content}${HALLUCINATION_WARNING}`;
    }
  }

  if (hasNumberedList && hasTimestampCluster) {
    return `${content}${HALLUCINATION_WARNING}`;
  }

  return content;
}
