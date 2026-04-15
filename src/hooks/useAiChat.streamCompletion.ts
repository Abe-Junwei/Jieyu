import {
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

interface ResolveAiChatStreamCompletionParams {
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
}

interface ResolveAiChatStreamCompletionResult {
  finalContent: string;
  finalStatus: 'done' | 'error';
  finalErrorMessage?: string;
  connectionErrorMessage?: string;
  localToolResults?: LocalContextToolResult[];
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
      const result = await executeLocalContextToolCall(
        stepCall,
        aiContext,
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
    finalContent = formatLocalContextToolBatchResultMessage(localToolResults);
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
    const localToolResult = await executeLocalContextToolCall(
      resolvedCall,
      aiContext,
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
    finalContent = formatLocalContextToolResultMessage(localToolResult);
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
    finalContent = normalizeUnsupportedToolCallJson(finalContent, userText, toolFeedbackStyle)
      ?? normalizeLegacyRiskNarration(finalContent, toolFeedbackStyle);
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

  const expected = context?.shortTerm?.projectUnitCount
    ?? context?.longTerm?.projectStats?.unitCount
    ?? context?.longTerm?.projectStats?.utteranceCount
    ?? context?.shortTerm?.currentMediaUnitCount;
  if (typeof expected === 'number' && expected > 0) {
    const countClaim = content.match(/(?:\u5171\u6709|total[:\s]|a\s+total\s+of)\s*(\d+)\s*(?:\u4e2a|\u6761|\u6bb5|units?\b|utterances?\b|segments?\b)/i);
    if (countClaim) {
      const claimed = parseInt(countClaim[1]!, 10);
      if (claimed !== expected) {
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
      return content;
    }
  }

  if (hasNumberedList && hasTimestampCluster) {
    return `${content}${HALLUCINATION_WARNING}`;
  }

  return content;
}
