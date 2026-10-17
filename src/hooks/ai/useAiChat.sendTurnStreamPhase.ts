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
import { hidesUnverifiedDraft } from '../../ai/vertical/corpusAnalysisReport';
import { executeLocalContextToolCall } from '../../ai/chat/localContextToolExecutors';
import {
  batchApplyApprovalLines,
  corpusToolMessage,
  externalMcpToolSpecs,
  isRuntimeV2BatchApply,
  isRuntimeV2CorpusAnalysisTool,
  isRuntimeV2LocalReadTool,
} from '../../ai/runtime/runtimeV2CorpusTools';
import {
  executeExternalMcpCall,
  externalMcpModelMessage,
  listRuntimeV2ExternalMcpTools,
} from '../../ai/mcp/client/externalMcpTurnBridge';
import type { EvidencePacketV0 } from '../../ai/vertical/evidencePacket';
import type { LocalContextToolResult } from '../../ai/chat/localContextToolTypes';
import { detectLocalToolClarificationNeed } from '../../ai/chat/resolvers/clarification';
import { planToolCallTargets } from '../../ai/chat/toolCallHelpers';
import {
  buildLocalToolClarificationMessage,
  runToolDecisionForCall,
} from './useAiChat.streamCompletion';
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
  rawInput: RunAiChatSendTurnStreamPhaseInput,
): Promise<void> {
  const hideUnverifiedClaims = hidesUnverifiedDraft(rawInput.verticalWorkflowSelection?.workflowId);
  const input: RunAiChatSendTurnStreamPhaseInput = hideUnverifiedClaims
    ? { ...rawInput, queueFlushAssistantDraft: () => {} }
    : rawInput;
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
  const v2CorpusResults: LocalContextToolResult[] = [];
  const v2EvidencePackets: EvidencePacketV0[] = [];
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
      const externalMcpTools =
        input.flags.aiExternalMcpSendTurnEnabled && input.flags.aiExternalMcpTrustEnabled
          ? await listRuntimeV2ExternalMcpTools()
          : [];
      const externalMcpByName = new Map(externalMcpTools.map((tool) => [tool.name, tool]));
      stream = v2.withLegacyFallback(
        v2.runAiRuntimeV2Turn({
          model,
          providerId: provider.id,
          modelId: settings.model,
          conversationId: input.sendTurnConversationId,
          history: opening.history,
          systemPrompt: opening.runtimeV2SystemPrompt ?? opening.systemPrompt,
          pendingHint: `\n\n${t(toolFeedbackLocaleRef.current, 'ai.runtimeV2.pendingNoAutoContinue')}`,
          corpusAnalysisTools: input.flags.corpusAnalysisQueryToolsEnabled,
          extraTools: externalMcpToolSpecs(externalMcpTools),
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
          decide: async (call, mode) => {
            const externalTool = externalMcpByName.get(call.name);
            if (externalTool) {
              const payload = await executeExternalMcpCall(
                {
                  name: call.name,
                  origin: externalTool.origin,
                  toolName: externalTool.toolName,
                  arguments: call.arguments,
                },
                input.agentRunId,
              );
              v2EvidencePackets.push(...(payload.evidencePackets ?? []));
              if (payload.form) {
                const snapshot = {
                  name: call.name,
                  arguments: call.arguments,
                  ...(call.requestId ? { requestId: call.requestId } : {}),
                } as PendingAiToolCall['call'];
                const prompt = payload.form.requests[0]?.message;
                input.setPendingToolCall({
                  call: snapshot,
                  assistantMessageId: assistantId,
                  ...(prompt ? { riskSummary: prompt } : {}),
                  approvalMode: 'user_preference',
                  policyReasonCode: 'input_required',
                  mcpInput: payload.form,
                  ...(call.requestId ? { requestId: call.requestId } : {}),
                });
              }
              return {
                finalContent: externalMcpModelMessage(payload),
                finalStatus: payload.ok ? 'done' : 'error',
                pending: false,
              };
            }
            if (isRuntimeV2BatchApply(call.name)) {
              if (mode !== 'approved') {
                return {
                  finalContent: 'batch_apply needs approval',
                  finalStatus: 'error',
                  pending: false,
                };
              }
              const toolResult = await executeLocalContextToolCall(
                { name: 'batch_apply', arguments: call.arguments },
                aiContext,
                input.localToolCallCountRef,
              );
              return {
                finalContent: toolResult.ok
                  ? corpusToolMessage(toolResult.result)
                  : (toolResult.error ?? 'batch_apply preview failed'),
                finalStatus: toolResult.ok ? 'done' : 'error',
                pending: false,
              };
            }
            if (isRuntimeV2CorpusAnalysisTool(call.name) || isRuntimeV2LocalReadTool(call.name)) {
              const toolResult = await executeLocalContextToolCall(
                { name: call.name, arguments: call.arguments },
                aiContext,
                input.localToolCallCountRef,
              );
              if (isRuntimeV2CorpusAnalysisTool(call.name)) v2CorpusResults.push(toolResult);
              return {
                finalContent: toolResult.ok
                  ? corpusToolMessage(toolResult.result)
                  : (toolResult.error ?? 'corpus query failed'),
                finalStatus: toolResult.ok ? 'done' : 'error',
                pending: false,
              };
            }
            return runV2Pipeline(call, mode === 'approved' ? 'approved' : undefined);
          },
          requestApproval: async (call, approvalId) => {
            if (isRuntimeV2BatchApply(call.name)) {
              const need = detectLocalToolClarificationNeed(
                [{ name: 'batch_apply', arguments: call.arguments }],
                effectiveUserText,
                input.sessionMemoryRef.current,
              );
              if (need.needed) {
                return {
                  pending: false,
                  text: buildLocalToolClarificationMessage(
                    need.reason,
                    toolFeedbackLocaleRef.current,
                  ),
                };
              }
              const pendingText = t(
                toolFeedbackLocaleRef.current,
                'ai.toolWriteGate.previewConfirmationRequired',
              );
              const lines = batchApplyApprovalLines(call.arguments);
              const snapshot = {
                name: call.name,
                arguments: call.arguments,
                ...(call.requestId ? { requestId: call.requestId } : {}),
              } as PendingAiToolCall['call'];
              const card: PendingAiToolCall = {
                call: snapshot,
                executionCall: snapshot,
                assistantMessageId: assistantId,
                impactPreview: lines,
                riskSummary: lines[0] ?? pendingText,
                approvalMode: 'safety_gate',
                policyReasonCode: 'write_gate_preview_required',
                policyReasonLabel: pendingText,
                riskTier: 'medium',
                ...(call.requestId ? { requestId: call.requestId } : {}),
                runtimeV2: {
                  conversationId: input.sendTurnConversationId,
                  approvalId,
                },
              };
              input.setPendingToolCall(card);
              await input.writeToolDecisionAuditLog(
                assistantId,
                'pending:batch_apply',
                'policy_pending:batch_apply:write_gate_preview_required',
                'system',
                call.requestId,
              );
              return {
                pending: true,
                text: pendingText,
                card,
                executionCall: { name: call.name, arguments: call.arguments },
              };
            }
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
        hideUnverifiedClaims ? '' : s.assistantContent,
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
        evidencePackets,
        corpusToolResults,
      } =
        runtimeV2 && !legacyTookOver
          ? {
              finalContent: s.assistantContent,
              finalStatus: 'done' as const,
              finalErrorMessage: undefined,
              connectionErrorMessage: undefined,
              localToolResults: undefined,
              ...(v2EvidencePackets.length > 0 ? { evidencePackets: v2EvidencePackets } : {}),
              ...(v2CorpusResults.length > 0 ? { corpusToolResults: v2CorpusResults } : {}),
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
        ...(evidencePackets !== undefined ? { evidencePackets } : {}),
        ...(corpusToolResults !== undefined ? { corpusToolResults } : {}),
        verticalWorkflowSelection,
        verticalOutputEnvelopeSeed,
      };

      await runSendTurnStreamPostCompletionPipeline({
        // v2 的语料查询放在 corpusToolResults，不放 localToolResults，旧循环不会续跑
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
      text: hideUnverifiedClaims ? '' : s.assistantContent,
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
