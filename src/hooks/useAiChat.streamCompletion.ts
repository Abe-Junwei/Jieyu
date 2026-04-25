import { normalizeJsonishAssistantReply, normalizeLegacyRiskNarration, normalizeUnsupportedToolCallJson, parseLegacyNarratedToolCall, parseToolCallFromText, planToolCallTargets } from '../ai/chat/toolCallHelpers';
import { executeLocalContextToolCall, formatLocalContextToolBatchResultMessage, formatLocalContextToolResultMessage, type LocalContextToolCall, type LocalContextToolResult, type LocalToolExecutionTraceOptions, parseLocalContextToolCallsFromText } from '../ai/chat/localContextTools';
import { buildLocalToolStatePatchFromCallResult, detectLocalToolClarificationNeed, resolveLocalToolCalls } from '../ai/chat/localToolSlotResolver';
import { formatEmptyModelReply, formatEmptyModelResponseError } from '../ai/messages';
import { generateTraceId } from '../observability/aiTrace';
import { createMetricTags, recordMetric } from '../observability/metrics';
import type { AiToolFeedbackStyle } from '../ai/providers/providerCatalog';
import type { Locale } from '../i18n';
import { resolveToolDecisionPipeline } from './useAiChat.toolDecisionPipeline';
import type { AiChatToolCall, AiInteractionMetrics, AiMemoryRecallShapeTelemetry, AiPromptContext, AiSessionMemory, AiTaskSession, AiTaskTraceEntry, AiToolDecisionMode, AiToolRiskCheckResult, PendingAiToolCall, ToolAuditContext, UiChatMessage } from './useAiChat.types';

export interface ResolveAiChatStreamCompletionParams {
  assistantId: string;
  assistantContent: string;
  userText: string;
  aiContext: AiPromptContext | null;
  memoryRecallShape?: AiMemoryRecallShapeTelemetry;
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
  getTaskSession?: () => AiTaskSession | null;
  setPendingToolCall: (value: PendingAiToolCall | null) => void;
  taskSessionId: string;
  markExecutedRequestId: (requestId: string) => void;
  bumpMetric: (key: keyof AiInteractionMetrics) => void;
  shouldBumpRecovery: boolean;
  genRequestId: (call: AiChatToolCall, scopeMessageId?: string) => string;
  localToolCallCountRef: { current: number };
  localToolTraceOptions?: LocalToolExecutionTraceOptions;
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
        ? '我可以继续查询，但“多少”还不够明确。你是想看语段数、说话人数、翻译层数、未转写数量，还是缺少说话人数量？同时请告诉我是当前范围、当前音频，还是整个项目。你也可以直接回复：\u201c当前范围的说话人数\u201d。'
        : 'I can continue, but “how many” is still ambiguous. Do you mean segment count, speaker count, translation layers, untranscribed count, or missing-speaker count? Also tell me whether this is for the current scope, the current audio, or the whole project. You can reply with something direct like “speaker count in the current scope”.';
    case 'scope_ambiguous':
      return isZh
        ? '我可以继续，但你还没有说明查询范围。请告诉我是当前范围、当前音频，还是整个项目。你可以直接回复：\u201c当前范围\u201d。'
        : 'I can continue, but I still need the scope. Please tell me whether this should use the current selection, the current audio, or the whole project. A direct reply like “current scope” is enough.';
    case 'query_ambiguous':
      return isZh
        ? '我可以继续搜索，请先告诉我关键词（例如某个词、短语或术语）。你可以直接回复：\u201c搜 tone\u201d 或 \u201c搜 speaker\u201d。'
        : 'I can continue the search, but I need a keyword first, for example a word, phrase, or term. You can reply with something like “search tone”.';
    case 'target_ambiguous':
      return isZh
        ? '我可以继续查看详情，但还不知道你指的是哪条语段。请告诉我是第几个语段，或直接给语段 ID。你可以直接回复：\u201c第 2 条\u201d。'
        : 'I can continue with details, but I do not know which segment you mean. Please tell me the ordinal, for example “the 2nd one”, or provide the segment ID.';
    case 'action_ambiguous':
      return isZh
        ? '我可以继续执行批量操作，但还不清楚你要做什么动作。请明确是删除、验证完成、分配说话人，还是其他具体操作。你可以直接回复：\u201c把这些标为已校验\u201d。'
        : 'I can continue with the batch operation, but the intended action is unclear. Please specify whether you want to delete, mark verified, assign speaker, or another concrete action. A reply like “mark these verified” is enough.';
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

function buildLocalToolTraceEntry(params: {
  assistantId: string;
  stepNumber: number;
  toolName: LocalContextToolCall['name'];
  phase: 'clarify' | 'local_tool';
  outcome: 'clarify' | 'done' | 'error';
  errorTaxonomy?: string;
  durationMs?: number;
}): AiTaskTraceEntry {
  const timestamp = new Date().toISOString();
  return {
    phase: params.phase,
    stepNumber: params.stepNumber,
    toolName: params.toolName,
    requestId: `${params.assistantId}_local_${params.stepNumber}`,
    outcome: params.outcome,
    ...(params.errorTaxonomy ? { errorTaxonomy: params.errorTaxonomy } : {}),
    ...(params.durationMs !== undefined ? { durationMs: params.durationMs } : {}),
    timestamp,
  };
}

function publishLocalToolTaskTrace(params: {
  assistantId: string;
  taskSessionId: string;
  setTaskSession: (value: AiTaskSession) => void;
  getTaskSession?: () => AiTaskSession | null;
  status: AiTaskSession['status'];
  stepNumber: number;
  toolName: LocalContextToolCall['name'];
  phase: 'clarify' | 'local_tool';
  outcome: 'clarify' | 'done' | 'error';
  errorTaxonomy?: string;
  durationMs?: number;
}): void {
  const trace = buildLocalToolTraceEntry(params);
  const previousTrace = params.getTaskSession?.()?.trace ?? [];
  const nextTrace = [...previousTrace, trace].slice(-50);
  const nextSession: AiTaskSession = {
    id: params.taskSessionId,
    status: params.status,
    step: params.stepNumber,
    trace: nextTrace,
    updatedAt: trace.timestamp,
  };
  params.setTaskSession(nextSession);
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
  memoryRecallShape,
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
  getTaskSession,
  setPendingToolCall,
  taskSessionId,
  markExecutedRequestId,
  bumpMetric,
  shouldBumpRecovery,
  genRequestId,
  localToolCallCountRef,
  localToolTraceOptions,
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
  const preferredScope = sessionMemory.toolPreferences?.defaultScope;

  const localToolCallsParsed = parseLocalContextToolCallsFromText(assistantContent);
  if (localToolCallsParsed.length > 1) {
    const sharedTraceId = localToolTraceOptions?.traceId ?? generateTraceId();
    const localToolResults: LocalContextToolResult[] = [];
    let rollingMemory = sessionMemory;
    for (let index = 0; index < localToolCallsParsed.length; index += 1) {
      const rawCall = localToolCallsParsed[index]!;
      const { calls: stepCalls } = resolveLocalToolCalls([rawCall], userText, rollingMemory, rollingMemory.toolPreferences?.defaultScope ?? preferredScope);
      const stepCall = stepCalls[0]!;
      const clarificationNeed = detectLocalToolClarificationNeed([stepCall], userText, rollingMemory);
      if (clarificationNeed.needed) {
        recordLocalToolClarificationMetric(clarificationNeed.reason, clarificationNeed.callName);
        bumpMetric('clarifyCount');
        publishLocalToolTaskTrace({
          assistantId,
          taskSessionId,
          setTaskSession,
          ...(getTaskSession ? { getTaskSession } : {}),
          status: 'waiting_clarify',
          stepNumber: index + 1,
          toolName: clarificationNeed.callName,
          phase: 'clarify',
          outcome: 'clarify',
          errorTaxonomy: clarificationNeed.reason,
        });
        return {
          finalContent: buildLocalToolClarificationMessage(clarificationNeed.reason, toolFeedbackLocale),
          finalStatus: 'done',
        };
      }
      const toolContext = resolveFreshAiContext?.() ?? aiContext;
      const startedAtMs = Date.now();
      const result = await executeLocalContextToolCall(
        stepCall,
        toolContext,
        localToolCallCountRef,
        20,
        {
          traceId: sharedTraceId,
          step: localToolTraceOptions?.step ?? (index + 1),
        },
      );
      publishLocalToolTaskTrace({
        assistantId,
        taskSessionId,
        setTaskSession,
        ...(getTaskSession ? { getTaskSession } : {}),
        status: 'explaining',
        stepNumber: index + 1,
        toolName: stepCall.name,
        phase: 'local_tool',
        outcome: result.ok ? 'done' : 'error',
        ...(result.error ? { errorTaxonomy: result.error } : {}),
        durationMs: Math.max(0, Date.now() - startedAtMs),
      });
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
    const sharedTraceId = localToolTraceOptions?.traceId ?? generateTraceId();
    const { calls: singleCalls } = resolveLocalToolCalls(localToolCallsParsed, userText, sessionMemory, preferredScope);
    const resolvedCall = singleCalls[0]!;
    const clarificationNeed = detectLocalToolClarificationNeed([resolvedCall], userText, sessionMemory);
    if (clarificationNeed.needed) {
      recordLocalToolClarificationMetric(clarificationNeed.reason, clarificationNeed.callName);
      bumpMetric('clarifyCount');
      publishLocalToolTaskTrace({
        assistantId,
        taskSessionId,
        setTaskSession,
        ...(getTaskSession ? { getTaskSession } : {}),
        status: 'waiting_clarify',
        stepNumber: 1,
        toolName: clarificationNeed.callName,
        phase: 'clarify',
        outcome: 'clarify',
        errorTaxonomy: clarificationNeed.reason,
      });
      return {
        finalContent: buildLocalToolClarificationMessage(clarificationNeed.reason, toolFeedbackLocale),
        finalStatus: 'done',
      };
    }
    const toolContext = resolveFreshAiContext?.() ?? aiContext;
    const startedAtMs = Date.now();
    const localToolResult = await executeLocalContextToolCall(
      resolvedCall,
      toolContext,
      localToolCallCountRef,
      20,
      {
        traceId: sharedTraceId,
        step: localToolTraceOptions?.step ?? 1,
      },
    );
    publishLocalToolTaskTrace({
      assistantId,
      taskSessionId,
      setTaskSession,
      ...(getTaskSession ? { getTaskSession } : {}),
      status: 'explaining',
      stepNumber: 1,
      toolName: resolvedCall.name,
      phase: 'local_tool',
      outcome: localToolResult.ok ? 'done' : 'error',
      ...(localToolResult.error ? { errorTaxonomy: localToolResult.error } : {}),
      durationMs: Math.max(0, Date.now() - startedAtMs),
    });
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
      ...(memoryRecallShape ? { memoryRecallShape } : {}),
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
    context?.longTerm?.projectStats?.unitCount,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  const countClaim = content.match(/(?:\u5171\u6709|total[:\s]|a\s+total\s+of)\s*(\d+)\s*(?:\u4e2a|\u6761|\u6bb5|units?\b|units?\b|segments?\b)/i);
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
