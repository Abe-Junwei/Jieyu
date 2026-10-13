/**
 * Post-opening stream consumption: chunk loop, output-cap retry, stream completion, agent loop, persistence.
 */

import { flushSync } from 'react-dom';
import { shouldApplyStreamUiUpdate } from '../../ai/chat/conversationGeneration';
import { formatConnectionHealthyMessage } from '../../ai/messages';
import { mergeTokenUsage } from '../../ai/providers/tokenUsage';
import { resolveAiAgentRuntimeV2Enabled } from '../../ai/config/featureFlags';
import { recordDurationMetric } from '../../observability/metrics';
import type { ResolveAiChatStreamCompletionParams } from './useAiChat.streamCompletion';
import { finalizeAssistantStreamCompletion } from './useAiChat.streamCompletionPhase';
import { buildSendTurnStreamCompletionEnv } from './useAiChat.sendTurnStreamPhase.completionEnv';
import { runSendTurnStreamPostCompletionPipeline } from './useAiChat.sendTurnStreamPhase.completionPipeline';
import { runSendTurnStreamOutputCapRetryIfNeeded } from './useAiChat.sendTurnStreamPhase.persistOutputCapRetry';
import type { RunAiChatSendTurnStreamPhaseInput } from './useAiChat.sendTurnStreamPhase.types';
import { writeVerticalWorkflowAuditLogForSendTurnStreamPhase } from './useAiChat.sendTurnStreamPhase.verticalAudit';
import { applyOutboundSemanticGuard } from '../../ai/security/semanticGuard';
import { planToolCallTargets } from '../../ai/chat/toolCallHelpers';
import { runToolDecisionForCall } from './useAiChat.streamCompletion';
import type { AssistantStreamChunk } from './useAiChat.streamFactory';

export type {
  RunAiChatSendTurnStreamPhaseInput,
  SendTurnStreamPhaseState,
} from './useAiChat.sendTurnStreamPhase.types';
export { createInitialSendTurnStreamPhaseState } from './useAiChat.sendTurnStreamPhase.types';

export async function runAiChatSendTurnStreamPhase(
  input: RunAiChatSendTurnStreamPhaseInput,
): Promise<void> {
  const {
    phaseState: s,
    opening,
    assistantId,
    effectiveUserText,
    shouldTrackRemoteStatus,
    timeoutHandle,
    sendStartedAtMs,
    aiMetricTags,
    queueFlushAssistantDraft,
    awaitQueuedPersistence,
    finalizeAssistantMessage,
    provider,
    setLastError,
    setMessages,
    setConnectionTestStatus,
    setConnectionTestMessage,
    commitPrimaryStreamUsage,
    recordCompletionSuccessMetric,
    controller,
    verticalWorkflowSelection,
    verticalOutputEnvelopeSeed,
    conversationGenerationRef,
    streamGenerationAtStart,
    toolFeedbackLocaleRef,
  } = input;

  const canUpdateStreamUi = () =>
    shouldApplyStreamUiUpdate(conversationGenerationRef, streamGenerationAtStart);

  const { aiContext, memoryRecallShape, ragCitations, db } = opening;

  const buildStreamCompletionEnv = (): Omit<
    ResolveAiChatStreamCompletionParams,
    'assistantId' | 'assistantContent' | 'userText' | 'aiContext'
  > => buildSendTurnStreamCompletionEnv(input);

  const maybeRetryAfterOutputCap = (): Promise<void> =>
    runSendTurnStreamOutputCapRetryIfNeeded({ input, phaseState: s });

  // R1：flag 开且 provider 支持时，本回合由 ToolLoopAgent 运行；flag 关时完全走旧路径（懒加载，不进主包）
  let stream: AsyncGenerator<AssistantStreamChunk> = input.stream;
  let runtimeV2 = false;
  if (
    (input.flags.aiAgentRuntimeV2Enabled || resolveAiAgentRuntimeV2Enabled()) &&
    !opening.clarifyFastPathCall
  ) {
    const v2 = await import('../../ai/runtime/aiRuntimeV2Turn');
    const settings = input.settingsRef.current;
    const model = v2.isNoToolsThisSession(provider.id, settings.model)
      ? null
      : v2.createAiSdkModelFromSettings(settings);
    if (model) {
      runtimeV2 = true;
      stream = v2.withLegacyFallback(
        v2.runAiRuntimeV2Turn({
          model,
          providerId: provider.id,
          modelId: settings.model,
          conversationId: input.sendTurnConversationId,
          history: opening.history,
          systemPrompt: opening.systemPrompt,
          userText: effectiveUserText,
          signal: controller.signal,
          genRequestId: (call) => buildStreamCompletionEnv().genRequestId(call, assistantId),
          hasPersistedExecutionForRequest: input.hasPersistedExecutionForRequest,
          onExpired: (requestId, toolName) =>
            input.writeToolDecisionAuditLog(
              assistantId,
              `pending:${toolName}`,
              `expired:${toolName}`,
              'system',
              requestId,
            ),
          decide: async (call) => {
            const env = buildStreamCompletionEnv();
            let pending = false;
            const planner = planToolCallTargets(call, effectiveUserText, aiContext);
            const result = await runToolDecisionForCall(
              {
                ...env,
                assistantId,
                userText: effectiveUserText,
                aiContext,
                ...(memoryRecallShape ? { memoryRecallShape } : {}),
                setPendingToolCall: (value) => {
                  if (value) pending = true;
                  env.setPendingToolCall(value);
                },
              },
              planner?.call ?? call,
              effectiveUserText,
              planner ?? undefined,
            );
            return { finalContent: result.finalContent, finalStatus: result.finalStatus, pending };
          },
        }),
        input.stream,
      ) as AsyncGenerator<AssistantStreamChunk>;
    }
  }

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
        setConnectionTestMessage(
          formatConnectionHealthyMessage(provider.label, toolFeedbackLocaleRef.current),
        );
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
      await finalizeAssistantMessage(
        'error',
        s.assistantContent,
        errorText,
        ragCitations,
        s.assistantReasoningContent,
      );
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
      if (canUpdateStreamUi()) {
        flushSync(() => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId
                ? {
                    ...msg,
                    content: msg.content + delta,
                    ...(s.assistantThinking ? { thinking: false } : {}),
                  }
                : msg,
            ),
          );
        });
        queueFlushAssistantDraft(s.assistantContent);
      }
    }

    if (chunk.thinking && !chunk.delta) {
      s.assistantThinking = true;
      if (canUpdateStreamUi()) {
        setMessages((prev) =>
          prev.map((msg) => (msg.id === assistantId ? { ...msg, thinking: true } : msg)),
        );
      }
    }

    if (chunk.reasoningContent && chunk.reasoningContent.length > 0) {
      s.assistantReasoningContent += chunk.reasoningContent;
      if (canUpdateStreamUi()) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  reasoningContent: (msg.reasoningContent ?? '') + chunk.reasoningContent,
                }
              : msg,
          ),
        );
      }
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
      // v2 回合的工具已在循环内经决策管线处理，不再从文本解析 | v2 tools already ran in the loop
      const {
        finalContent,
        finalStatus,
        finalErrorMessage,
        connectionErrorMessage,
        localToolResults,
      } = runtimeV2
        ? {
            finalContent: s.assistantContent,
            finalStatus: 'done' as const,
            finalErrorMessage: undefined,
            connectionErrorMessage: undefined,
            localToolResults: undefined,
          }
        : await finalizeAssistantStreamCompletion(
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
        ...(finalErrorMessage !== undefined ? { finalErrorMessage } : {}),
        ...(connectionErrorMessage !== undefined ? { connectionErrorMessage } : {}),
        ...(localToolResults !== undefined ? { localToolResults } : {}),
        verticalWorkflowSelection,
        verticalOutputEnvelopeSeed,
      };

      await runSendTurnStreamPostCompletionPipeline({
        // v2 回合不产生 localToolResults，旧 agent loop 不会续跑（agentLoopRunner.ts:217）
        input,
        phaseState: s,
        streamCompletionResult,
        buildStreamCompletionEnv,
      });
      break;
    }
  }

  if (!s.streamFinalized && !controller.signal.aborted) {
    commitPrimaryStreamUsage();
    recordCompletionSuccessMetric();
    await awaitQueuedPersistence();
    await writeVerticalWorkflowAuditLogForSendTurnStreamPhase({
      db,
      assistantId,
      verticalOutputEnvelopeSeed,
      verticalWorkflowSelection,
      completionStatus: 'done',
      completionPath: 'stream_fallback',
    });
    const fallbackContent = await applyOutboundSemanticGuard({
      text: s.assistantContent,
      ...(input.agentRunId ? { agentRunId: input.agentRunId } : {}),
    });
    await finalizeAssistantMessage(
      'done',
      fallbackContent,
      undefined,
      ragCitations,
      s.assistantReasoningContent,
    );
  }
}
