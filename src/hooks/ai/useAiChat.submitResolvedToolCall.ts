/**
 * 已解析的工具调用进入与文字相同的决策管线。不再让模型理解第二次。
 * A resolved tool call enters the same decision pipeline as typed chat.
 */
import { normalizeToolCallName } from '../../ai/chat/toolCallNameNormalize';
import { applyAssistantMessageResult } from '../../ai/chat/applyAssistantMessageResult';
import { persistSessionMemoryAsync } from '../../ai/chat/sessionMemory';
import { getDb } from '../../db';
import { resolveToolDecisionPipeline } from './useAiChat.toolDecisionPipeline';
import { genRequestId } from './useAiChat.toolAudit';
import { newMessageId, nowIso } from './useAiChat.helpers';
import { persistAssistantPlaceholder, persistUserMessage } from './useAiChat.sendTurnPersistPhase';
import type { ConversationGenerationRef } from '../../ai/chat/conversationGeneration';
import type { AiToolFeedbackStyle } from '../../ai/providers/providerCatalog';
import type { Locale } from '../../i18n';
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
import type {
  ToolDecisionAuditMetadata,
  ToolIntentAuditMetadata,
} from '../../ai/chat/toolCallHelpers';

export type SubmitResolvedToolCallInput = {
  name: string;
  arguments: Record<string, unknown>;
  userText: string;
};

export type SubmitResolvedToolCallResult = {
  status: 'pending' | 'done' | 'error';
  content: string;
};

export type SubmitResolvedToolCallDeps = {
  ensureConversation: () => Promise<string>;
  providerId: string;
  model: string;
  locale: Locale;
  toolDecisionMode: AiToolDecisionMode;
  toolFeedbackStyle: AiToolFeedbackStyle;
  allowDestructiveToolCalls: boolean;
  messages: readonly UiChatMessage[];
  setMessages: (updater: (prev: UiChatMessage[]) => UiChatMessage[]) => void;
  getContext: () => AiPromptContext | null;
  onToolRiskCheck?:
    | ((
        call: AiChatToolCall,
      ) =>
        | Promise<AiToolRiskCheckResult | null | undefined>
        | AiToolRiskCheckResult
        | null
        | undefined)
    | null
    | undefined;
  preparePendingToolCall?:
    | ((
        call: AiChatToolCall,
      ) => Promise<AiChatToolCall | null | undefined> | AiChatToolCall | null | undefined)
    | null
    | undefined;
  onToolCall?:
    | ((
        call: AiChatToolCall,
      ) => Promise<{ ok: boolean; message: string }> | { ok: boolean; message: string })
    | null
    | undefined;
  hasPersistedExecutionForRequest: (requestId: string) => Promise<boolean>;
  writeToolDecisionAuditLog: (
    assistantMessageId: string,
    oldValue: string,
    newValue: string,
    source: 'human' | 'ai' | 'system',
    requestId?: string,
    metadata?: ToolDecisionAuditMetadata,
  ) => Promise<void>;
  writeToolIntentAuditLog: (
    assistantMessageId: string,
    callName: AiChatToolCall['name'],
    assessment: NonNullable<ToolAuditContext['intentAssessment']>,
    requestId?: string,
    metadata?: ToolIntentAuditMetadata,
  ) => Promise<void>;
  sessionMemory: AiSessionMemory;
  updateSessionMemory: (nextMemory: AiSessionMemory) => void;
  setTaskSession: (value: AiTaskSession) => void;
  setPendingToolCall: (value: PendingAiToolCall | null) => void;
  taskSessionId: string;
  markExecutedRequestId: (requestId: string) => void;
  bumpMetric: (key: keyof AiInteractionMetrics) => void;
  conversationGeneration: ConversationGenerationRef;
};

export async function submitResolvedToolCall(
  deps: SubmitResolvedToolCallDeps,
  input: SubmitResolvedToolCallInput,
): Promise<SubmitResolvedToolCallResult> {
  const name = normalizeToolCallName(input.name);
  if (!name) return { status: 'error', content: '' };

  const conversationId = await deps.ensureConversation();
  const timestamp = nowIso();
  const userId = newMessageId('user');
  const assistantId = newMessageId('assistant');
  const db = await getDb();
  await persistUserMessage(db, {
    id: userId,
    conversationId,
    content: input.userText,
    timestamp,
  });
  await persistAssistantPlaceholder(db, {
    id: assistantId,
    conversationId,
    generationSource: 'local',
    generationModel: deps.model,
    timestamp,
  });
  const userMessage: UiChatMessage = {
    id: userId,
    role: 'user',
    content: input.userText,
    status: 'done',
  };
  const assistantMessage: UiChatMessage = {
    id: assistantId,
    role: 'assistant',
    content: '',
    status: 'streaming',
    generationSource: 'local',
    generationModel: deps.model,
  };
  deps.setMessages((prev) => [...prev, userMessage, assistantMessage]);

  const toolCall: AiChatToolCall = {
    name,
    arguments: input.arguments,
    requestId: genRequestId({ name, arguments: input.arguments }, assistantId),
  };
  let sawPending = false;
  const startedGeneration = deps.conversationGeneration.current;
  const stillCurrent = () => deps.conversationGeneration.current === startedGeneration;
  const result = await resolveToolDecisionPipeline({
    assistantMessageId: assistantId,
    toolCall,
    userText: input.userText,
    aiContext: deps.getContext(),
    messageHistory: [...deps.messages, userMessage],
    providerId: deps.providerId,
    model: deps.model,
    locale: deps.locale,
    toolDecisionMode: deps.toolDecisionMode,
    toolFeedbackStyle: deps.toolFeedbackStyle,
    allowDestructiveToolCalls: deps.allowDestructiveToolCalls,
    ...(deps.onToolRiskCheck ? { onToolRiskCheck: deps.onToolRiskCheck } : {}),
    ...(deps.preparePendingToolCall ? { preparePendingToolCall: deps.preparePendingToolCall } : {}),
    ...(deps.onToolCall ? { onToolCall: deps.onToolCall } : {}),
    hasPersistedExecutionForRequest: deps.hasPersistedExecutionForRequest,
    writeToolDecisionAuditLog: deps.writeToolDecisionAuditLog,
    writeToolIntentAuditLog: deps.writeToolIntentAuditLog,
    sessionMemory: deps.sessionMemory,
    updateSessionMemory: (nextMemory) => {
      if (!stillCurrent()) return;
      deps.updateSessionMemory(nextMemory);
    },
    persistSessionMemory: (memory) => {
      if (!stillCurrent()) return;
      void persistSessionMemoryAsync(conversationId, memory);
    },
    setTaskSession: deps.setTaskSession,
    setPendingToolCall: (value) => {
      if (value) sawPending = true;
      deps.setPendingToolCall(value);
    },
    taskSessionId: deps.taskSessionId,
    markExecutedRequestId: deps.markExecutedRequestId,
    bumpMetric: deps.bumpMetric,
    shouldBumpRecovery: false,
    resolvedToolIntent: true,
    shouldApplyTurnSideEffects: stillCurrent,
    turnConversationId: conversationId,
  });

  if (!stillCurrent()) return { status: 'error', content: result.finalContent };

  await applyAssistantMessageResult({
    messageId: assistantId,
    content: result.finalContent,
    status: result.finalStatus === 'error' ? 'error' : 'done',
    errorMessage: result.finalErrorMessage,
    setMessages: deps.setMessages,
  });

  if (sawPending) return { status: 'pending', content: result.finalContent };
  if (result.finalStatus === 'error') return { status: 'error', content: result.finalContent };
  return { status: 'done', content: result.finalContent };
}
