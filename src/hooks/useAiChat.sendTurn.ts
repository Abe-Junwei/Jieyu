import { tf } from '../i18n';
import { runAiChatSendTurnStreamPhase } from './useAiChat.sendTurnStreamPhase';
import { runAiChatSendTurnPreflight } from './useAiChat.sendTurnPreflight';
import { runAiChatSendTurnPersistAndPrimaryStream } from './useAiChat.sendTurnPersistAndPrimaryStream';
import { finalizeSendTurnStream, handleSendTurnStreamCatch } from './useAiChat.sendTurnCompletion';
import type { SendTurnCompletionBundle } from './useAiChat.sendTurnCompletion';
import { logSendTurnPhase } from './useAiChat.sendTurnCorrelation';
import type { RunAiChatSendTurnArgs } from './useAiChat.sendTurn.types';

export type { RunAiChatSendTurnArgs, ToolIntentAssessment } from './useAiChat.sendTurn.types';

/** Full send-turn pipeline: guards, persistence opening, streaming, agent loop, metrics. */
export async function runAiChatSendTurn(args: RunAiChatSendTurnArgs): Promise<void> {
  const {
    featureFlags: flags,
    provider,
    orchestrator,
    setLastError,
    setMessages,
    setIsStreaming,
    setConnectionTestStatus,
    setConnectionTestMessage,
    setMetrics,
    setTaskSession,
    setPendingToolCall,
    messagesRef,
    metricsRef,
    sessionMemoryRef,
    settingsRef,
    toolFeedbackLocaleRef,
    getContextRef,
    toolDecisionModeRef,
    onToolRiskCheckRef,
    preparePendingToolCallRef,
    onToolCallRef,
    taskSessionRef,
    onMessageCompleteRef,
    abortRef,
    outputTokenCap,
    outputTokenRetryCap,
    backgroundMemoryRuntimeRef,
    allowDestructiveToolCalls,
    hasPersistedExecutionForRequest,
    writeToolDecisionAuditLog,
    writeToolIntentAuditLog,
    markExecutedRequestId,
    bumpMetric,
    localToolCallCountRef,
    clearPendingAgentLoopCheckpoint,
  } = args;

  const preflight = await runAiChatSendTurnPreflight(args);
  if (!preflight) return;

  const {
    resumeCheckpoint,
    shouldTrackRemoteStatus,
    userMsg,
    assistantId,
    controller,
    dbConversation,
    phaseState,
    timedOutBeforeFirstChunk,
    sendStartedAtMs,
    aiMetricTags,
    recordCompletionSuccessMetric,
    timeoutHandle,
    queueFlushAssistantDraft,
    awaitQueuedPersistence,
    finalizeAssistantMessage,
    commitPrimaryStreamUsage,
    agentLoopSourceUserText,
    effectiveUserText,
    verticalWorkflowSelection,
    correlationId,
  } = preflight;

  logSendTurnPhase(correlationId, 'preflight_ok', {
    assistantId,
    ...(verticalWorkflowSelection ? { verticalWorkflowId: verticalWorkflowSelection.workflowId } : {}),
  });

  const completionBundle = {
    provider,
    setLastError,
    setIsStreaming,
    setConnectionTestStatus,
    setConnectionTestMessage,
    setMetrics,
    messagesRef,
    onMessageCompleteRef,
    abortRef,
    assistantId,
    controller,
    phaseState,
    timedOutBeforeFirstChunk,
    shouldTrackRemoteStatus,
    timeoutHandle,
    awaitQueuedPersistence,
    finalizeAssistantMessage,
    commitPrimaryStreamUsage,
  } satisfies SendTurnCompletionBundle;

  try {
    logSendTurnPhase(correlationId, 'persist_primary_stream_start');
    const {
      opening,
      sendTurnConversationId,
      stream,
      generationSource,
    } = await runAiChatSendTurnPersistAndPrimaryStream(args, preflight, dbConversation);

    logSendTurnPhase(correlationId, 'persist_primary_stream_ready', {
      conversationId: sendTurnConversationId,
    });
    logSendTurnPhase(correlationId, 'stream_phase_start');

    await runAiChatSendTurnStreamPhase({
      phaseState,
      commitPrimaryStreamUsage,
      recordCompletionSuccessMetric,
      opening,
      sendTurnConversationId,
      stream,
      generationSource,
      controller,
      effectiveUserText,
      agentLoopSourceUserText,
      resumeCheckpoint,
      verticalWorkflowSelection,
      verticalOutputEnvelopeSeed: opening.verticalOutputEnvelopeSeed ?? preflight.verticalOutputEnvelopeSeed,
      userMsg,
      assistantId,
      shouldTrackRemoteStatus,
      timeoutHandle,
      sendStartedAtMs,
      aiMetricTags,
      queueFlushAssistantDraft,
      awaitQueuedPersistence,
      finalizeAssistantMessage,
      provider,
      flags,
      orchestrator,
      outputTokenCap,
      outputTokenRetryCap,
      clearPendingAgentLoopCheckpoint,
      setLastError,
      setMessages,
      setConnectionTestStatus,
      setConnectionTestMessage,
      setTaskSession,
      setMetrics,
      setPendingToolCall,
      messagesRef,
      metricsRef,
      sessionMemoryRef,
      settingsRef,
      toolFeedbackLocaleRef,
      getContextRef,
      toolDecisionModeRef,
      onToolRiskCheckRef,
      preparePendingToolCallRef,
      onToolCallRef,
      taskSessionRef,
      backgroundMemoryRuntimeRef,
      allowDestructiveToolCalls,
      hasPersistedExecutionForRequest,
      writeToolDecisionAuditLog,
      writeToolIntentAuditLog,
      markExecutedRequestId,
      bumpMetric,
      localToolCallCountRef,
    });
  } catch (error) {
    logSendTurnPhase(correlationId, 'stream_catch', {
      name: error instanceof Error ? error.name : typeof error,
    });
    await handleSendTurnStreamCatch(completionBundle, error);
    if (error instanceof Error && (
      error.message.includes('db generation metadata failed')
      || error.message.includes('persist failed')
    )) {
      setLastError(tf(toolFeedbackLocaleRef.current, 'ai.chat.persistLayerRecoveryHint', {
        providerLabel: provider.label,
      }));
    }
  } finally {
    logSendTurnPhase(correlationId, 'finally');
    finalizeSendTurnStream(completionBundle);
  }
}
