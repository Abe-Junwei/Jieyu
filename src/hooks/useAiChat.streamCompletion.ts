import {
  normalizeLegacyRiskNarration,
  normalizeUnsupportedToolCallJson,
  parseLegacyNarratedToolCall,
  parseToolCallFromText,
  planToolCallTargets,
} from '../ai/chat/toolCallHelpers';
import {
  formatEmptyModelReply,
  formatEmptyModelResponseError,
} from '../ai/messages';
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
}

interface ResolveAiChatStreamCompletionResult {
  finalContent: string;
  finalStatus: 'done' | 'error';
  finalErrorMessage?: string;
  connectionErrorMessage?: string;
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

  return {
    finalContent,
    finalStatus,
    ...(finalErrorMessage ? { finalErrorMessage } : {}),
  };
}
