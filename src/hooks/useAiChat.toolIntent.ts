import type { AiToolFeedbackStyle } from '../ai/providers/providerCatalog';
import { assessToolActionIntent, buildToolAuditContext, buildToolIntentAuditMetadata, shouldAllowDeicticExecutionIntent } from '../ai/chat/toolCallHelpers';
import { resolveIntentConfidenceGate } from '../ai/chat/intentConfidenceGate';
import { featureFlags } from '../ai/config/featureFlags';
import type { AiChatToolCall, AiMemoryRecallShapeTelemetry, AiPromptContext, AiToolDecisionMode, UiChatMessage } from './useAiChat';

interface BuildAndAuditToolIntentParams {
  assistantMessageId: string;
  toolCall: AiChatToolCall;
  userText: string;
  aiContext: AiPromptContext | null;
  messageHistory: UiChatMessage[];
  providerId: string;
  model: string;
  toolDecisionMode: AiToolDecisionMode;
  toolFeedbackStyle: AiToolFeedbackStyle;
  planner?: Parameters<typeof buildToolAuditContext>[5];
  memoryRecallShape?: AiMemoryRecallShapeTelemetry;
  writeToolIntentAuditLog: (
    assistantMessageId: string,
    callName: AiChatToolCall['name'],
    assessment: ReturnType<typeof assessToolActionIntent>,
    requestId?: string,
    metadata?: ReturnType<typeof buildToolIntentAuditMetadata>,
  ) => Promise<void>;
}

/**
 * 统一执行意图评估与审计写入 | Unified intent assessment and audit logging
 */
export async function buildAndAuditToolIntent({
  assistantMessageId,
  toolCall,
  userText,
  aiContext,
  messageHistory,
  providerId,
  model,
  toolDecisionMode,
  toolFeedbackStyle,
  planner,
  memoryRecallShape,
  writeToolIntentAuditLog,
}: BuildAndAuditToolIntentParams): Promise<{
  intentAssessment: ReturnType<typeof assessToolActionIntent>;
  auditContext: ReturnType<typeof buildToolAuditContext>;
}> {
  const allowDeicticExecution = shouldAllowDeicticExecutionIntent(
    userText,
    toolCall.name,
    aiContext,
    messageHistory,
  );
  const intentAssessment = resolveIntentConfidenceGate({
    enabled: featureFlags.aiIntentConfidenceGateEnabled,
    assessment: assessToolActionIntent(userText, { allowDeicticExecution }),
  });
  const auditContext = buildToolAuditContext(
    userText,
    providerId,
    model,
    toolDecisionMode,
    toolFeedbackStyle,
    planner,
    intentAssessment,
    memoryRecallShape,
  );

  // 审计写入为副作用，不应阻塞主逻辑 | Audit write is a side-effect, should not block main logic
  writeToolIntentAuditLog(
    assistantMessageId,
    toolCall.name,
    intentAssessment,
    toolCall.requestId,
    buildToolIntentAuditMetadata(assistantMessageId, toolCall, auditContext),
  ).catch((error) => {
    // eslint-disable-next-line no-console
    console.warn('[toolIntent] audit log write failed', error instanceof Error ? error.message : error);
  });

  return {
    intentAssessment,
    auditContext,
  };
}
