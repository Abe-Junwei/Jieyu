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
import { buildToolAuditContext } from '../../ai/chat/toolCallHelpers';
import { handleInvalidToolArguments } from './useAiChat.argsValidation';
import { t } from '../../i18n';
import type { AssistantStreamChunk } from './useAiChat.streamFactory';
import type { AiChatToolCall, PendingAiToolCall } from './useAiChat.types';

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
  let legacyTookOver = false;
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
      const runV2Pipeline = async (
        call: AiChatToolCall,
        approval: 'request' | 'approved' | undefined,
        runtimeV2Card?: PendingAiToolCall['runtimeV2'],
      ) => {
        const env = buildStreamCompletionEnv();
        let card: PendingAiToolCall | undefined;
        // N1：已批准的是卡片快照，原样执行，不按当前选区重新解析 | approved = card snapshot, no re-planning
        const planner =
          approval === 'approved' ? null : planToolCallTargets(call, effectiveUserText, aiContext);
        const result = await runToolDecisionForCall(
          {
            ...env,
            assistantId,
            userText: effectiveUserText,
            aiContext,
            ...(memoryRecallShape ? { memoryRecallShape } : {}),
            setPendingToolCall: (value) => {
              const tagged =
                value && runtimeV2Card ? { ...value, runtimeV2: runtimeV2Card } : value;
              if (tagged) card = tagged;
              env.setPendingToolCall(tagged);
            },
          },
          { ...(planner?.call ?? call), ...(call.requestId ? { requestId: call.requestId } : {}) },
          effectiveUserText,
          planner ?? undefined,
          approval,
        );
        return {
          finalContent: result.finalContent,
          finalStatus: result.finalStatus,
          pending: card !== undefined,
          card,
        };
      };
      stream = v2.withLegacyFallback(
        v2.runAiRuntimeV2Turn({
          model,
          providerId: provider.id,
          modelId: settings.model,
          conversationId: input.sendTurnConversationId,
          history: opening.history,
          systemPrompt: opening.runtimeV2SystemPrompt ?? opening.systemPrompt,
          pendingHint: `\n\n${t(toolFeedbackLocaleRef.current, 'ai.runtimeV2.pendingNoAutoContinue')}`,
          userText: effectiveUserText,
          signal: controller.signal,
          genRequestId: (call) => buildStreamCompletionEnv().genRequestId(call, assistantId),
          hasPersistedExecutionForRequest: (requestId) =>
            buildStreamCompletionEnv().hasPersistedExecutionForRequest(requestId),
          onApprovalClosed: (requestId, toolName, reason) =>
            input.writeToolDecisionAuditLog(
              assistantId,
              `pending:${toolName}`,
              `${reason === 'expired' ? 'expired' : 'abandoned'}:${toolName}`,
              'system',
              requestId,
            ),
          // B2：参数不可解析 → 与旧路径同一 invalid_args 审计 + 澄清文案
          onInvalidArgs: async (call) => {
            const env = buildStreamCompletionEnv();
            const { finalContent } = await handleInvalidToolArguments({
              assistantMessageId: assistantId,
              toolCall: call,
              argsValidationError: 'arguments are not valid JSON',
              locale: env.toolFeedbackLocale,
              toolFeedbackStyle: env.toolFeedbackStyle,
              source: 'ai',
              decision: 'auto_failed',
              auditContext: buildToolAuditContext(
                effectiveUserText,
                env.providerId,
                env.model,
                env.toolDecisionMode,
                env.toolFeedbackStyle,
              ),
              writeToolDecisionAuditLog: env.writeToolDecisionAuditLog,
            });
            return finalContent;
          },
          // 执行与审批请求都走同一决策管线（策略、写入门禁、审计）| one pipeline for both
          decide: async (call, mode) =>
            runV2Pipeline(call, mode === 'approved' ? 'approved' : undefined),
          requestApproval: async (call, approvalId) => {
            const r = await runV2Pipeline(call, 'request', {
              conversationId: input.sendTurnConversationId,
              approvalId,
            });
            const snap = r.card ? (r.card.executionCall ?? r.card.call) : undefined;
            return {
              pending: r.pending,
              text: r.finalContent,
              ...(r.card ? { card: r.card } : {}),
              ...(snap ? { executionCall: { name: snap.name, arguments: snap.arguments } } : {}),
            };
          },
        }),
        input.stream,
        () => {
          legacyTookOver = true;
        },
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
      if (canUpdateStreamUi()) {
        setLastError(errorText);
        if (shouldTrackRemoteStatus) {
          setConnectionTestStatus('error');
          setConnectionTestMessage(errorText);
        }
      }
      break;
    }

    if ((chunk.delta ?? '').length > 0) {
      const delta = chunk.delta ?? '';
      s.assistantContent += delta;
      const hideUnverifiedClaims =
        verticalWorkflowSelection?.workflowId === 'corpus_analysis_report';
      if (canUpdateStreamUi() && !hideUnverifiedClaims) {
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
      // 留在 v2 的回合工具已在循环里决定。改走旧流之后，按旧流解析一次，不重复执行。
      const {
        finalContent,
        finalStatus,
        finalErrorMessage,
        connectionErrorMessage,
        localToolResults,
      } =
        runtimeV2 && !legacyTookOver
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
    if (canUpdateStreamUi()) recordCompletionSuccessMetric();
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
