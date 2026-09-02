/**
 * Build stream-completion environment for send-turn stream phase (shared by primary stream + agent loop).
 */

import { shouldApplyStreamUiUpdate } from '../../ai/chat/conversationGeneration';
import { persistSessionMemoryAsync } from '../../ai/chat/sessionMemory';
import { genRequestId } from './useAiChat.toolAudit';
import type { ResolveAiChatStreamCompletionParams } from './useAiChat.streamCompletion';
import type { RunAiChatSendTurnStreamPhaseInput } from './useAiChat.sendTurnStreamPhase.types';

export function buildSendTurnStreamCompletionEnv(
  input: RunAiChatSendTurnStreamPhaseInput,
): Omit<
  ResolveAiChatStreamCompletionParams,
  'assistantId' | 'assistantContent' | 'userText' | 'aiContext'
> {
  const {
    opening,
    provider,
    allowDestructiveToolCalls,
    onToolRiskCheckRef,
    preparePendingToolCallRef,
    onToolCallRef,
    hasPersistedExecutionForRequest,
    writeToolDecisionAuditLog,
    writeToolIntentAuditLog,
    sessionMemoryRef,
    setTaskSession,
    taskSessionRef,
    setPendingToolCall,
    markExecutedRequestId,
    bumpMetric,
    metricsRef,
    localToolCallCountRef,
    verticalWorkflowSelection,
    verticalOutputEnvelopeSeed,
    messagesRef,
    getContextRef,
    settingsRef,
    toolDecisionModeRef,
    conversationGenerationRef,
    streamGenerationAtStart,
    sendTurnConversationId,
  } = input;
  const { responsePolicy } = opening;

  const shouldApplyTurnSideEffects = () =>
    shouldApplyStreamUiUpdate(conversationGenerationRef, streamGenerationAtStart);

  return {
    messages: messagesRef.current,
    resolveFreshAiContext: () => getContextRef.current?.() ?? null,
    providerId: provider.id,
    model: settingsRef.current.model,
    toolFeedbackLocale: responsePolicy.locale,
    toolDecisionMode: toolDecisionModeRef.current,
    toolFeedbackStyle: responsePolicy.style,
    allowDestructiveToolCalls,
    ...(onToolRiskCheckRef.current ? { onToolRiskCheck: onToolRiskCheckRef.current } : {}),
    ...(preparePendingToolCallRef.current
      ? { preparePendingToolCall: preparePendingToolCallRef.current }
      : {}),
    ...(onToolCallRef.current ? { onToolCall: onToolCallRef.current } : {}),
    hasPersistedExecutionForRequest,
    writeToolDecisionAuditLog,
    writeToolIntentAuditLog,
    sessionMemory: sessionMemoryRef.current,
    updateSessionMemory: (nextMemory) => {
      if (!shouldApplyTurnSideEffects()) return;
      sessionMemoryRef.current = nextMemory;
    },
    persistSessionMemory: (mem) => {
      if (!shouldApplyTurnSideEffects()) return;
      void persistSessionMemoryAsync(sendTurnConversationId, mem);
    },
    setTaskSession,
    getTaskSession: () => taskSessionRef.current,
    setPendingToolCall,
    taskSessionId: taskSessionRef.current.id,
    markExecutedRequestId,
    bumpMetric,
    shouldBumpRecovery:
      metricsRef.current.failureCount > 0 && taskSessionRef.current.status === 'executing',
    genRequestId,
    localToolCallCountRef,
    verticalWorkflowSelection,
    verticalOutputEnvelopeSeed,
    shouldApplyTurnSideEffects,
    turnConversationId: sendTurnConversationId,
    ...(input.agentRunId ? { agentRunId: input.agentRunId } : {}),
  };
}
