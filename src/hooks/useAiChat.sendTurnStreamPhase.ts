/**
 * Post-opening stream consumption: chunk loop, output-cap retry, stream completion, agent loop, persistence.
 */

import { flushSync } from 'react-dom';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { ChatOrchestrator } from '../ai/ChatOrchestrator';
import { completeAgentLoopCheckpointTask, persistAgentLoopCheckpointTask } from '../ai/chat/agentLoopCheckpoint';
import { persistSessionMemory } from '../ai/chat/sessionMemory';
import { featureFlags } from '../ai/config/featureFlags';
import { createAssistantStream, type AssistantStreamChunk } from './useAiChat.streamFactory';
import type { ChatTokenUsage } from '../ai/providers/LLMProvider';
import { mergeTokenUsage } from '../ai/providers/tokenUsage';
import { genRequestId } from './useAiChat.toolAudit';
import type { ResolveAiChatStreamCompletionParams } from './useAiChat.streamCompletion';
import { finalizeAssistantStreamCompletion } from './useAiChat.streamCompletionPhase';
import { newAuditLogId, nowIso } from './useAiChat.helpers';
import { runAgentLoop } from './useAiChat.agentLoopRunner';
import { formatConnectionHealthyMessage } from '../ai/messages';
import { recordDurationMetric, type MetricTags } from '../observability/metrics';
import { notifyAiTasksUpdated } from '../ai/tasks/taskRefreshEvents';
import { resolveAiChatResponsePolicy } from './useAiChat.responsePolicy';
import {
  scheduleAndFlushBackgroundMemory,
  type AiChatBackgroundMemoryRuntime,
} from './useAiChat.backgroundMemory';
import type { VerticalWorkflowOutputEnvelopeV0, VerticalWorkflowSelectionV0 } from '../ai/vertical/verticalWorkflowSelection';
import type { ToolDecisionAuditMetadata, ToolIntentAuditMetadata } from '../ai/chat/toolCallHelpers';
import type { AiChatSettings } from '../ai/providers/providerCatalog';
import type { Locale } from '../i18n';
import type {
  AiChatToolName,
  AiConnectionTestStatus,
  AiInteractionMetrics,
  AiPromptContext,
  AiSessionMemory,
  AiTaskSession,
  AiToolDecisionMode,
  PendingAiToolCall,
  UiChatMessage,
  UseAiChatOptions,
} from './useAiChat.types';
import type { AiMessageCitation } from '../db';
import type { PersistOpeningTurnAndBuildPromptContextResult } from './useAiChat.sendPersistTurnAndBuildPromptContext';
import type { ToolIntentAssessment } from './useAiChat.sendTurn.types';

export type SendTurnStreamPhaseState = {
  assistantContent: string;
  assistantReasoningContent: string;
  reportedInputTokens: number;
  totalReportedOutputTokens: number;
  primaryStreamUsage: ChatTokenUsage | undefined;
  usageObservedThisTurn: boolean;
  streamFinalized: boolean;
  assistantThinking: boolean;
  firstChunkArrived: boolean;
  connectionMarkedSuccess: boolean;
  firstTokenMetricRecorded: boolean;
  primaryUsageCommitted: boolean;
};

export function createInitialSendTurnStreamPhaseState(): SendTurnStreamPhaseState {
  return {
    assistantContent: '',
    assistantReasoningContent: '',
    reportedInputTokens: 0,
    totalReportedOutputTokens: 0,
    primaryStreamUsage: undefined,
    usageObservedThisTurn: false,
    streamFinalized: false,
    assistantThinking: false,
    firstChunkArrived: false,
    connectionMarkedSuccess: false,
    firstTokenMetricRecorded: false,
    primaryUsageCommitted: false,
  };
}

export type RunAiChatSendTurnStreamPhaseInput = Readonly<{
  phaseState: SendTurnStreamPhaseState;
  commitPrimaryStreamUsage: () => void;
  recordCompletionSuccessMetric: () => void;
  opening: PersistOpeningTurnAndBuildPromptContextResult;
  sendTurnConversationId: string;
  stream: AsyncGenerator<AssistantStreamChunk>;
  generationSource: NonNullable<UiChatMessage['generationSource']>;
  controller: AbortController;
  effectiveUserText: string;
  agentLoopSourceUserText: string;
  resumeCheckpoint: NonNullable<AiSessionMemory['pendingAgentLoopCheckpoint']> | null;
  verticalWorkflowSelection: VerticalWorkflowSelectionV0 | null;
  verticalOutputEnvelopeSeed: VerticalWorkflowOutputEnvelopeV0 | null;
  userMsg: UiChatMessage;
  assistantId: string;
  shouldTrackRemoteStatus: boolean;
  /** Browser `window.setTimeout` id or Node timer handle. */
  timeoutHandle: number | NodeJS.Timeout | null;
  sendStartedAtMs: number;
  aiMetricTags: MetricTags;
  queueFlushAssistantDraft: (content: string, force?: boolean) => void;
  awaitQueuedPersistence: () => Promise<void>;
  finalizeAssistantMessage: (
    status: 'done' | 'error' | 'aborted',
    content: string,
    errorMessage?: string,
    citations?: AiMessageCitation[],
    reasoningContent?: string,
  ) => Promise<void>;
  provider: { id: string; label: string };
  flags: typeof featureFlags;
  orchestrator: ChatOrchestrator;
  outputTokenCap: number;
  outputTokenRetryCap: number;
  clearPendingAgentLoopCheckpoint: () => void;
  setLastError: Dispatch<SetStateAction<string | null>>;
  setMessages: Dispatch<SetStateAction<UiChatMessage[]>>;
  setConnectionTestStatus: Dispatch<SetStateAction<AiConnectionTestStatus>>;
  setConnectionTestMessage: Dispatch<SetStateAction<string | null>>;
  setTaskSession: Dispatch<SetStateAction<AiTaskSession>>;
  setMetrics: Dispatch<SetStateAction<AiInteractionMetrics>>;
  setPendingToolCall: Dispatch<SetStateAction<PendingAiToolCall | null>>;
  messagesRef: MutableRefObject<UiChatMessage[]>;
  metricsRef: MutableRefObject<AiInteractionMetrics>;
  sessionMemoryRef: MutableRefObject<AiSessionMemory>;
  settingsRef: MutableRefObject<AiChatSettings>;
  toolFeedbackLocaleRef: MutableRefObject<Locale>;
  getContextRef: MutableRefObject<(() => AiPromptContext | null) | undefined>;
  toolDecisionModeRef: MutableRefObject<AiToolDecisionMode>;
  onToolRiskCheckRef: MutableRefObject<UseAiChatOptions['onToolRiskCheck']>;
  preparePendingToolCallRef: MutableRefObject<UseAiChatOptions['preparePendingToolCall']>;
  onToolCallRef: MutableRefObject<UseAiChatOptions['onToolCall']>;
  taskSessionRef: MutableRefObject<AiTaskSession>;
  backgroundMemoryRuntimeRef: MutableRefObject<AiChatBackgroundMemoryRuntime | null>;
  allowDestructiveToolCalls: boolean;
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
    callName: AiChatToolName,
    assessment: ToolIntentAssessment,
    requestId?: string,
    metadata?: ToolIntentAuditMetadata,
  ) => Promise<void>;
  markExecutedRequestId: (requestId: string) => void;
  bumpMetric: (key: keyof AiInteractionMetrics, delta?: number) => void;
  localToolCallCountRef: MutableRefObject<number>;
}>;

export async function runAiChatSendTurnStreamPhase(input: RunAiChatSendTurnStreamPhaseInput): Promise<void> {
  const {
    phaseState: s,
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
    verticalOutputEnvelopeSeed,
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
  } = input;

  const {
    db,
    history,
    historyCharBudget,
    aiContext,
    responsePolicy,
    routingPlan,
    ragCitations,
    memoryRecallShape,
    clarifyFastPathCall,
    systemPrompt,
  } = opening;

  const buildStreamCompletionEnv = (): Omit<
    ResolveAiChatStreamCompletionParams,
    'assistantId' | 'assistantContent' | 'userText' | 'aiContext'
  > => ({
    messages: messagesRef.current,
    resolveFreshAiContext: () => getContextRef.current?.() ?? null,
    providerId: provider.id,
    model: settingsRef.current.model,
    toolFeedbackLocale: responsePolicy.locale,
    toolDecisionMode: toolDecisionModeRef.current,
    toolFeedbackStyle: responsePolicy.style,
    allowDestructiveToolCalls,
    ...(onToolRiskCheckRef.current ? { onToolRiskCheck: onToolRiskCheckRef.current } : {}),
    ...(preparePendingToolCallRef.current ? { preparePendingToolCall: preparePendingToolCallRef.current } : {}),
    ...(onToolCallRef.current ? { onToolCall: onToolCallRef.current } : {}),
    hasPersistedExecutionForRequest,
    writeToolDecisionAuditLog,
    writeToolIntentAuditLog,
    sessionMemory: sessionMemoryRef.current,
    updateSessionMemory: (nextMemory) => {
      sessionMemoryRef.current = nextMemory;
    },
    persistSessionMemory,
    setTaskSession,
    getTaskSession: () => taskSessionRef.current,
    setPendingToolCall,
    taskSessionId: taskSessionRef.current.id,
    markExecutedRequestId,
    bumpMetric,
    shouldBumpRecovery: metricsRef.current.failureCount > 0 && taskSessionRef.current.status === 'executing',
    genRequestId,
    localToolCallCountRef,
    verticalWorkflowSelection,
    verticalOutputEnvelopeSeed,
  });

  const writeVerticalWorkflowAudit = async (
    completionStatus: 'done' | 'error',
    completionPath: 'stream_done' | 'stream_fallback',
  ): Promise<void> => {
    if (!verticalOutputEnvelopeSeed) return;
    try {
      await db.collections.audit_logs.insert({
        id: newAuditLogId(),
        collection: 'ai_messages',
        documentId: assistantId,
        action: 'update',
        field: 'ai_vertical_workflow_result',
        oldValue: verticalOutputEnvelopeSeed.workflowId,
        newValue: completionStatus,
        source: 'ai',
        timestamp: nowIso(),
        requestId: `${assistantId}_vertical_${verticalOutputEnvelopeSeed.generatedAt}`,
        metadataJson: JSON.stringify({
          schemaVersion: 1,
          phase: 'stream_completion',
          completionPath,
          completionStatus,
          workflowId: verticalOutputEnvelopeSeed.workflowId,
          writeMode: verticalOutputEnvelopeSeed.writeMode,
          outputKind: verticalOutputEnvelopeSeed.outputKind,
          envelope: {
            schemaVersion: verticalOutputEnvelopeSeed.schemaVersion,
            generatedAt: verticalOutputEnvelopeSeed.generatedAt,
            evidencePacketCount: verticalOutputEnvelopeSeed.evidencePackets.length,
          },
          selection: verticalWorkflowSelection
            ? {
                confidence: verticalWorkflowSelection.confidence,
                source: verticalWorkflowSelection.source,
                reasonCode: verticalWorkflowSelection.reasonCode,
                matchedKeyword: verticalWorkflowSelection.matchedKeyword,
              }
            : null,
        }),
      });
    } catch (error) {
      console.error('[Jieyu] useAiChat.sendTurnStreamPhase: failed to write vertical workflow audit log', error);
    }
  };

  const maybeRetryAfterOutputCap = async (): Promise<void> => {
    const initialOutputTokens = s.primaryStreamUsage?.outputTokens ?? 0;
    const shouldRetry = generationSource === 'llm'
      && outputTokenRetryCap > outputTokenCap
      && initialOutputTokens >= outputTokenCap
      && !controller.signal.aborted;
    if (!shouldRetry) return;

    const costGuardRequestId = genRequestId({
      name: 'propose_changes',
      arguments: { scope: 'cost_guard_output_cap' },
    });
    await writeToolDecisionAuditLog(
      assistantId,
      'pending:cost_guard',
      'capped:cost_guard:output_token_cap_exceeded',
      'system',
      costGuardRequestId,
    );
    await writeToolDecisionAuditLog(
      assistantId,
      'capped:cost_guard:output_token_cap_exceeded',
      'retry:cost_guard:retry_after_output_cap',
      'system',
      costGuardRequestId,
    );

    const {
      stream: retryStream,
      generationSource: retryGenerationSource,
      generationModel: retryGenerationModel,
    } = createAssistantStream({
      userText: effectiveUserText,
      clarifyFastPathCall,
      history,
      orchestrator,
      systemPrompt,
      signal: controller.signal,
      taskSessionStatus: taskSessionRef.current.status,
      model: settingsRef.current.model,
      maxTokens: outputTokenRetryCap,
      ...(settingsRef.current.explainModel
        ? { explainModel: settingsRef.current.explainModel }
        : {}),
    });

    let retryContent = '';
    let retryReasoningContent = '';
    let retryUsage: ChatTokenUsage | undefined;
    let retryError: string | null = null;
    for await (const retryChunk of retryStream) {
      if (retryChunk.error) {
        retryError = retryChunk.error;
        break;
      }
      if ((retryChunk.delta ?? '').length > 0) {
        retryContent += retryChunk.delta ?? '';
      }
      if (retryChunk.reasoningContent && retryChunk.reasoningContent.length > 0) {
        retryReasoningContent += retryChunk.reasoningContent;
      }
      if (retryChunk.usage) {
        retryUsage = mergeTokenUsage(retryUsage, retryChunk.usage);
      }
      if (retryChunk.done) {
        break;
      }
    }

    if (controller.signal.aborted || retryError) {
      await writeToolDecisionAuditLog(
        assistantId,
        'retry:cost_guard:retry_after_output_cap',
        'failed:cost_guard:retry_budget_upgrade_failed',
        'system',
        costGuardRequestId,
      );
      return;
    }

    if (retryUsage) {
      s.usageObservedThisTurn = true;
      s.reportedInputTokens += retryUsage.inputTokens ?? 0;
      s.totalReportedOutputTokens += retryUsage.outputTokens ?? 0;
    }

    s.assistantContent = retryContent;
    s.assistantReasoningContent = retryReasoningContent;
    flushSync(() => {
      setMessages((prev) => prev.map((msg) => (
        msg.id === assistantId
          ? {
              ...msg,
              content: retryContent,
              reasoningContent: retryReasoningContent,
              generationSource: retryGenerationSource,
              generationModel: retryGenerationModel,
              ...(s.assistantThinking ? { thinking: false } : {}),
            }
          : msg
      )));
    });
    queueFlushAssistantDraft(s.assistantContent, true);
    await awaitQueuedPersistence();

    await db.collections.ai_messages.update(assistantId, {
      generationSource: retryGenerationSource,
      generationModel: retryGenerationModel,
      updatedAt: nowIso(),
    });

    await writeToolDecisionAuditLog(
      assistantId,
      'retry:cost_guard:retry_after_output_cap',
      'confirmed:cost_guard:retry_budget_upgrade',
      'system',
      costGuardRequestId,
    );
  };

  for await (const chunk of stream) {
    if (!s.firstChunkArrived) {
      s.firstChunkArrived = true;
      if (!s.firstTokenMetricRecorded) {
        s.firstTokenMetricRecorded = true;
        try {
          recordDurationMetric('ai.chat.first_token_latency_ms', sendStartedAtMs, aiMetricTags);
        } catch {
          // 忽略指标上报异常，避免影响主流程 | Ignore metric reporting errors to avoid affecting the main flow
        }
      }
      if (shouldTrackRemoteStatus && !s.connectionMarkedSuccess) {
        s.connectionMarkedSuccess = true;
        setConnectionTestStatus('success');
        setConnectionTestMessage(formatConnectionHealthyMessage(provider.label));
      }
      if (timeoutHandle !== null && typeof window !== 'undefined') {
        window.clearTimeout(timeoutHandle);
      }
    }

    if (chunk.error) {
      const errorText = chunk.error;
      s.streamFinalized = true;
      commitPrimaryStreamUsage();
      await awaitQueuedPersistence();
      await finalizeAssistantMessage('error', s.assistantContent, errorText, ragCitations, s.assistantReasoningContent);
      setLastError(errorText);
      if (shouldTrackRemoteStatus) {
        setConnectionTestStatus('error');
        setConnectionTestMessage(errorText);
      }
      break;
    }

    if ((chunk.delta ?? '').length > 0) {
      const delta = chunk.delta ?? '';
      s.assistantContent += delta;
      flushSync(() => {
        setMessages((prev) => prev.map((msg) => (
          msg.id === assistantId
            ? { ...msg, content: msg.content + delta, ...(s.assistantThinking ? { thinking: false } : {}) }
            : msg
        )));
      });
      queueFlushAssistantDraft(s.assistantContent);
    }

    if (chunk.thinking && !chunk.delta) {
      s.assistantThinking = true;
      setMessages((prev) => prev.map((msg) => (
        msg.id === assistantId
          ? { ...msg, thinking: true }
          : msg
      )));
    }

    if (chunk.reasoningContent && chunk.reasoningContent.length > 0) {
      s.assistantReasoningContent += chunk.reasoningContent;
      setMessages((prev) => prev.map((msg) => (
        msg.id === assistantId
          ? { ...msg, reasoningContent: (msg.reasoningContent ?? '') + chunk.reasoningContent }
          : msg
      )));
    }

    if (chunk.usage) {
      s.usageObservedThisTurn = true;
      s.primaryStreamUsage = mergeTokenUsage(s.primaryStreamUsage, chunk.usage);
    }

    if (chunk.done) {
      s.streamFinalized = true;
      await maybeRetryAfterOutputCap();
      queueFlushAssistantDraft(s.assistantContent, true);
      await awaitQueuedPersistence();
      commitPrimaryStreamUsage();
      const {
        finalContent,
        finalStatus,
        finalErrorMessage,
        connectionErrorMessage,
        localToolResults,
      } = await finalizeAssistantStreamCompletion(
        {
          assistantId,
          assistantContent: s.assistantContent,
          userText: effectiveUserText,
          aiContext,
          ...(memoryRecallShape ? { memoryRecallShape } : {}),
        },
        buildStreamCompletionEnv(),
      );

      const streamCompletionResult = {
        finalContent,
        finalStatus,
        finalErrorMessage,
        connectionErrorMessage,
        localToolResults,
        verticalWorkflowSelection,
        verticalOutputEnvelopeSeed,
      };

      let resolvedContent = streamCompletionResult.finalContent;
      let resolvedStatus = streamCompletionResult.finalStatus;
      let resolvedErrorMessage = streamCompletionResult.finalErrorMessage;
      let resolvedConnectionErrorMessage = streamCompletionResult.connectionErrorMessage;

      const loopResult = await runAgentLoop(
        {
          assistantId,
          agentLoopSourceUserText,
          history,
          historyCharBudget,
          systemPrompt,
          aiContext,
          signal: controller.signal,
          routingPlan,
          aiChatAgentLoopEnabled: flags.aiChatAgentLoopEnabled,
          getSessionMemory: () => sessionMemoryRef.current,
          setSessionMemory: (next) => { sessionMemoryRef.current = next; },
          getSettings: () => settingsRef.current,
          getLocaleIsZhCn: () => resolveAiChatResponsePolicy(
            sessionMemoryRef.current,
            toolFeedbackLocaleRef.current,
            settingsRef.current.toolFeedbackStyle,
          ).locale === 'zh-CN',
          getAiContext: () => getContextRef.current?.() ?? null,
          getTaskSession: () => taskSessionRef.current,
          setTaskSession,
          setMetrics,
          persistSessionMemory,
          persistAgentLoopCheckpoint: async (checkpoint) => {
            if (!checkpoint) return undefined;
            const taskId = await persistAgentLoopCheckpointTask({
              checkpoint,
              targetId: assistantId,
              modelId: settingsRef.current.model,
            });
            notifyAiTasksUpdated();
            return taskId;
          },
          buildStreamCompletionEnv,
          coordinationLiteEnabled: flags.aiCoordinationLiteEnabled,
          orchestrator,
          insertAuditLog: (entry) => db.collections.audit_logs.insert(entry),
        },
        {
          resolvedContent: streamCompletionResult.finalContent,
          resolvedStatus: streamCompletionResult.finalStatus,
          resolvedErrorMessage: streamCompletionResult.finalErrorMessage,
          resolvedConnectionErrorMessage: streamCompletionResult.connectionErrorMessage,
          resolvedLocalToolResults: streamCompletionResult.localToolResults,
          rawAssistantContentForLoop: s.assistantContent,
          assistantReasoningContent: s.assistantReasoningContent,
          reportedInputTokens: s.reportedInputTokens,
          totalOutputTokens: s.totalReportedOutputTokens,
          startStep: resumeCheckpoint ? Math.max(1, resumeCheckpoint.step + 1) : 1,
        },
      );

      resolvedContent = loopResult.resolvedContent;
      resolvedStatus = loopResult.resolvedStatus;
      resolvedErrorMessage = loopResult.resolvedErrorMessage;
      resolvedConnectionErrorMessage = loopResult.resolvedConnectionErrorMessage;
      s.assistantReasoningContent = loopResult.assistantReasoningContent;
      s.totalReportedOutputTokens = loopResult.totalOutputTokens;
      s.reportedInputTokens = loopResult.reportedInputTokens;

      if (loopResult.loopExecuted) {
        setTaskSession((prev) => {
          if (prev.status !== 'executing') return prev;
          return {
            id: prev.id,
            status: 'idle',
            updatedAt: nowIso(),
          };
        });
      }

      const stillPendingCheckpoint = sessionMemoryRef.current.pendingAgentLoopCheckpoint;
      if (
        !stillPendingCheckpoint
        || (
          resumeCheckpoint
          && stillPendingCheckpoint.createdAt === resumeCheckpoint.createdAt
          && stillPendingCheckpoint.step === resumeCheckpoint.step
        )
      ) {
        clearPendingAgentLoopCheckpoint();
        if (resumeCheckpoint?.taskId) {
          await completeAgentLoopCheckpointTask(resumeCheckpoint.taskId);
          notifyAiTasksUpdated();
        }
      }
      if (resolvedConnectionErrorMessage && shouldTrackRemoteStatus) {
        setConnectionTestStatus('error');
        setConnectionTestMessage(resolvedConnectionErrorMessage);
      }
      if (resolvedErrorMessage) setLastError(resolvedErrorMessage);
      await writeVerticalWorkflowAudit(resolvedStatus, 'stream_done');
      if (resolvedStatus === 'done') {
        recordCompletionSuccessMetric();
        const backgroundMemoryRuntime = backgroundMemoryRuntimeRef.current;
        if (backgroundMemoryRuntime) {
          scheduleAndFlushBackgroundMemory(backgroundMemoryRuntime, {
            conversationId: sendTurnConversationId,
            assistantMessageId: assistantId,
            userMessageId: userMsg.id,
            userText: effectiveUserText,
            assistantText: resolvedContent,
            actorId: 'ai-chat',
          }, (entry) => db.collections.audit_logs.insert(entry));
        }
      }
      await finalizeAssistantMessage(resolvedStatus, resolvedContent, resolvedErrorMessage, ragCitations, s.assistantReasoningContent);
      break;
    }
  }

  if (!s.streamFinalized && !controller.signal.aborted) {
    commitPrimaryStreamUsage();
    recordCompletionSuccessMetric();
    await awaitQueuedPersistence();
    await writeVerticalWorkflowAudit('done', 'stream_fallback');
    await finalizeAssistantMessage('done', s.assistantContent, undefined, ragCitations, s.assistantReasoningContent);
  }
}
