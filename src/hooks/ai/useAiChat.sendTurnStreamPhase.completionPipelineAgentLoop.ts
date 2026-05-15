/**
 * Post-completion agent loop, checkpoint reconciliation, connection UX, and vertical stream-done audit.
 */

import {
  completeAgentLoopCheckpointTask,
  persistAgentLoopCheckpointTask,
} from '../../ai/chat/agentLoopCheckpoint';
import { persistSessionMemory } from '../../ai/chat/sessionMemory';
import { runAgentLoop } from './useAiChat.agentLoopRunner';
import { nowIso } from './useAiChat.helpers';
import { writeVerticalWorkflowAuditLogForSendTurnStreamPhase } from './useAiChat.sendTurnStreamPhase.verticalAudit';
import { notifyAiTasksUpdated } from '../../ai/tasks/taskRefreshEvents';
import { resolveAiChatResponsePolicy } from './useAiChat.responsePolicy';
import type {
  RunSendTurnStreamPostCompletionPipelineArgs,
  SendTurnStreamPostAgentResolution,
} from './useAiChat.sendTurnStreamPhase.completionPipelineShared';

export async function runSendTurnStreamAgentLoopAfterPrimaryCompletion(
  args: RunSendTurnStreamPostCompletionPipelineArgs & {
    resolution: SendTurnStreamPostAgentResolution;
  },
): Promise<void> {
  const {
    input,
    phaseState: s,
    streamCompletionResult,
    buildStreamCompletionEnv,
    resolution,
  } = args;
  const {
    opening,
    controller,
    agentLoopSourceUserText,
    resumeCheckpoint,
    assistantId,
    shouldTrackRemoteStatus,
    flags,
    orchestrator,
    clearPendingAgentLoopCheckpoint,
    setLastError,
    setConnectionTestStatus,
    setConnectionTestMessage,
    setTaskSession,
    setMetrics,
    sessionMemoryRef,
    settingsRef,
    toolFeedbackLocaleRef,
    getContextRef,
    taskSessionRef,
  } = input;

  const { db, history, historyCharBudget, aiContext, routingPlan, systemPrompt } = opening;

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
      setSessionMemory: (next) => {
        sessionMemoryRef.current = next;
      },
      getSettings: () => settingsRef.current,
      getLocaleIsZhCn: () =>
        resolveAiChatResponsePolicy(
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

  resolution.content = loopResult.resolvedContent;
  resolution.status = loopResult.resolvedStatus;
  if (loopResult.resolvedErrorMessage !== undefined) {
    resolution.errorMessage = loopResult.resolvedErrorMessage;
  } else {
    delete resolution.errorMessage;
  }
  if (loopResult.resolvedConnectionErrorMessage !== undefined) {
    resolution.connectionErrorMessage = loopResult.resolvedConnectionErrorMessage;
  } else {
    delete resolution.connectionErrorMessage;
  }
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
    !stillPendingCheckpoint ||
    (resumeCheckpoint &&
      stillPendingCheckpoint.createdAt === resumeCheckpoint.createdAt &&
      stillPendingCheckpoint.step === resumeCheckpoint.step)
  ) {
    clearPendingAgentLoopCheckpoint();
    if (resumeCheckpoint?.taskId) {
      await completeAgentLoopCheckpointTask(resumeCheckpoint.taskId);
      notifyAiTasksUpdated();
    }
  }
  if (resolution.connectionErrorMessage && shouldTrackRemoteStatus) {
    setConnectionTestStatus('error');
    setConnectionTestMessage(resolution.connectionErrorMessage);
  }
  if (resolution.errorMessage) setLastError(resolution.errorMessage);
  await writeVerticalWorkflowAuditLogForSendTurnStreamPhase({
    db,
    assistantId,
    verticalOutputEnvelopeSeed: streamCompletionResult.verticalOutputEnvelopeSeed,
    verticalWorkflowSelection: streamCompletionResult.verticalWorkflowSelection,
    completionStatus: resolution.status,
    completionPath: 'stream_done',
  });
}
