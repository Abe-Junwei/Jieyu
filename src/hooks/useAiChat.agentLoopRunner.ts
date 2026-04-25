/**
 * Agent loop 执行器 — 从 useAiChat.send 中提取的纯逻辑子函数
 * Agent loop runner — pure logic extracted from useAiChat.send's while-loop.
 *
 * 将原本 ~120 行深嵌套循环提取为独立函数，减少 send 的认知复杂度。
 * Extracts the ~120-line deeply-nested loop into a standalone function,
 * reducing cognitive complexity of the send callback.
 */

import { buildAgentLoopContinuationInput, buildAgentLoopStepTraceTags, createAgentLoopTraceContext, DEFAULT_AGENT_LOOP_CONFIG, estimateRemainingLoopTokens, shouldContinueAgentLoop, shouldWarnTokenBudget } from '../ai/chat/agentLoop';
import { trimHistoryByChars, type HistoryChatMessage } from '../ai/chat/historyTrim';
import { getAiChatCardMessages } from '../i18n/messages';
import { createAssistantStream } from './useAiChat.streamFactory';
import { finalizeAssistantStreamCompletion } from './useAiChat.streamCompletionPhase';
import { newAuditLogId, nowIso } from './useAiChat.helpers';
import { startAiTraceSpan } from '../observability/aiTrace';
import { createMetricTags } from '../observability/metrics';
import type { ResolveAiChatStreamCompletionParams } from './useAiChat.streamCompletion';
import type { LocalContextToolResult } from '../ai/chat/localContextTools';
import type { AiSessionMemory } from '../ai/chat/chatDomain.types';
import type { AiTaskSession } from './useAiChat.types';
import type { LocalToolRoutingPlan } from '../ai/chat/localToolSlotResolver';
import type { AiPromptContext, AiInteractionMetrics } from '../ai/chat/chatDomain.types';
import type { AuditLogDocType } from '../db/types';
import type { ChatTokenUsage } from '../ai/providers/LLMProvider';
import { mergeTokenUsage } from '../ai/providers/tokenUsage';
import { CoordinationLiteSession, resolveCoordinationParallelPolicy, type CoordinationNotification, type CoordinationPhase } from '../ai/coordination/coordinationLite';

// ── 类型定义 | Type definitions ────────────────────────────────────────────

/** 循环入口的可变状态快照 | Mutable state snapshot at loop entry */
export interface AgentLoopInitialState {
  resolvedContent: string;
  resolvedStatus: 'done' | 'error';
  resolvedErrorMessage: string | undefined;
  resolvedConnectionErrorMessage: string | undefined;
  resolvedLocalToolResults: LocalContextToolResult[] | undefined;
  rawAssistantContentForLoop: string;
  /** 已累积的推理内容 | Accumulated reasoning content */
  assistantReasoningContent: string;
  /** 已累积的输入 token 回传值 | Accumulated provider-reported input tokens */
  reportedInputTokens: number;
  /** 已累积的输出 token 回传值 | Accumulated provider-reported output tokens */
  totalOutputTokens: number;
  /** 循环起始步数（断点续跑时 > 1） | Starting step (> 1 when resuming from checkpoint) */
  startStep: number;
}

/** 循环结束后的结果快照 | Result snapshot after loop finishes */
export interface AgentLoopRunnerResult {
  resolvedContent: string;
  resolvedStatus: 'done' | 'error';
  resolvedErrorMessage: string | undefined;
  resolvedConnectionErrorMessage: string | undefined;
  resolvedLocalToolResults: LocalContextToolResult[] | undefined;
  loopExecuted: boolean;
  assistantReasoningContent: string;
  totalOutputTokens: number;
  reportedInputTokens: number;
}

/** 只读依赖 — 循环执行期间不会被循环本身修改 | Read-only deps — not mutated by the loop itself */
export interface AgentLoopRunnerDeps {
  assistantId: string;
  agentLoopSourceUserText: string;
  history: HistoryChatMessage[];
  historyCharBudget: number;
  systemPrompt: string;
  aiContext: AiPromptContext | null;
  signal: AbortSignal;
  routingPlan: LocalToolRoutingPlan;
  aiChatAgentLoopEnabled: boolean;

  // Ref-like 读取器 | Ref-like readers
  getSessionMemory: () => AiSessionMemory;
  setSessionMemory: (next: AiSessionMemory) => void;
  getSettings: () => { model: string; explainModel?: string };
  getLocaleIsZhCn: () => boolean;
  getAiContext: () => AiPromptContext | null;
  getTaskSession: () => AiTaskSession;

  // 状态更新器 | State updaters
  setTaskSession: (value: AiTaskSession | ((prev: AiTaskSession) => AiTaskSession)) => void;
  setMetrics: (updater: (prev: AiInteractionMetrics) => AiInteractionMetrics) => void;

  // 副作用函数 | Side-effect functions
  persistSessionMemory: (memory: AiSessionMemory) => void;
  coordinationLiteEnabled: boolean;
  buildStreamCompletionEnv: () => Omit<
    ResolveAiChatStreamCompletionParams,
    'assistantId' | 'assistantContent' | 'userText' | 'aiContext'
  >;
  orchestrator: {
    sendMessage(input: {
      history: HistoryChatMessage[];
      userText: string;
      systemPrompt: string;
      options: { signal: AbortSignal; model?: string };
    }): { stream: AsyncGenerator<{ delta?: string; done?: boolean; error?: string; reasoningContent?: string; usage?: ChatTokenUsage }> };
  };

  // DB 审计 | DB audit
  insertAuditLog: (entry: AuditLogDocType) => Promise<unknown>;
}

function inferCoordinationPhase(input: {
  finalStatus: 'done' | 'error';
  nextLocalToolCount: number;
  selectedToolCount: number;
}): CoordinationPhase {
  if (input.finalStatus === 'error') return 'verification';
  if (input.nextLocalToolCount > 0 || input.selectedToolCount > 0) return 'research';
  return 'synthesis';
}

function buildCoordinationAuditLog(input: {
  assistantId: string;
  taskSessionId: string;
  notification: CoordinationNotification;
  policy: ReturnType<typeof resolveCoordinationParallelPolicy>;
  quarantinedCount: number;
}) {
  return {
    id: newAuditLogId(),
    collection: 'ai_messages',
    documentId: input.assistantId,
    action: 'update' as const,
    field: 'ai_coordination_lite',
    oldValue: `step:${input.notification.taskId}`,
    newValue: input.notification.status,
    source: 'ai' as const,
    timestamp: nowIso(),
    requestId: input.notification.taskId,
    metadataJson: JSON.stringify({
      schemaVersion: 1,
      phase: 'coordination_lite',
      taskSessionId: input.taskSessionId,
      notification: input.notification,
      parallelPolicy: input.policy,
      quarantinedCount: input.quarantinedCount,
    }),
  };
}

// ── 核心循环 | Core loop ───────────────────────────────────────────────────

/**
 * 执行 agent loop：在首次流完成后，若工具结果仍需后续推理则循环续跑。
 * Runs the agent loop: after the first stream completes, continues iterating
 * while local tool results still require follow-up reasoning.
 */
export async function runAgentLoop(
  deps: AgentLoopRunnerDeps,
  initial: AgentLoopInitialState,
): Promise<AgentLoopRunnerResult> {
  let {
    resolvedContent,
    resolvedStatus,
    resolvedErrorMessage,
    resolvedConnectionErrorMessage,
    resolvedLocalToolResults,
    rawAssistantContentForLoop,
    assistantReasoningContent,
    reportedInputTokens,
    totalOutputTokens,
  } = initial;

  let loopStep = initial.startStep;
  let loopExecuted = false;
  const agentLoopTraceContext = createAgentLoopTraceContext();
  const coordinationSession = deps.coordinationLiteEnabled ? new CoordinationLiteSession() : null;

  const getLoopStepTaskState = () => {
    const mem = deps.getSessionMemory();
    const loopRequestedMetric = deps.routingPlan.requestedMetric ?? mem.localToolState?.lastFrame?.metric;
    const loopTaskStateBase = {
      queryFamily: deps.routingPlan.queryFamily,
      scope: deps.routingPlan.scope,
      selectedTools: deps.routingPlan.selectedTools,
      answerReady: resolvedStatus === 'done' && (!resolvedLocalToolResults || resolvedLocalToolResults.length === 0),
      executionState: resolvedStatus === 'error' ? 'error' as const : 'running' as const,
    };
    return loopRequestedMetric
      ? { ...loopTaskStateBase, requestedMetric: loopRequestedMetric }
      : loopTaskStateBase;
  };

  // ── 循环守卫 | Loop guard ──
  const shouldContinueWithTaskState = (): boolean => {
    const loopTaskState = getLoopStepTaskState();
    return deps.aiChatAgentLoopEnabled
      && shouldContinueAgentLoop(loopStep, DEFAULT_AGENT_LOOP_CONFIG, resolvedLocalToolResults, loopTaskState)
      && !deps.signal.aborted;
  };

  // ── 主循环 | Main loop ──
  while (shouldContinueWithTaskState()) {
    loopExecuted = true;
    const stepTaskState = getLoopStepTaskState();
    const stepSpan = startAiTraceSpan({
      kind: 'agent-loop-step',
      traceId: agentLoopTraceContext.traceId,
      tags: createMetricTags(
        'useAiChat.agentLoopRunner',
        buildAgentLoopStepTraceTags(loopStep, stepTaskState),
      ),
    });

    try {
    const loopAiContext = deps.getAiContext() ?? deps.aiContext;
    deps.setTaskSession({
      id: deps.getTaskSession().id,
      status: 'executing',
      updatedAt: nowIso(),
      step: loopStep,
      maxSteps: DEFAULT_AGENT_LOOP_CONFIG.maxSteps,
    });

    const continuationUserText = buildAgentLoopContinuationInput(
      deps.agentLoopSourceUserText,
      resolvedLocalToolResults!,
      loopStep,
    );
    const continuationHistory = trimHistoryByChars(
      [...deps.history, { role: 'assistant' as const, content: rawAssistantContentForLoop }],
      deps.historyCharBudget,
      3,
      deps.getSessionMemory().conversationSummary,
    );
    const fallbackPerStepInputTokens = Math.max(
      1,
      Math.ceil(Math.max(continuationUserText.length, deps.agentLoopSourceUserText.length) / 4),
    );
    const observedPerStepInputTokens = reportedInputTokens > 0
      ? Math.max(1, Math.ceil(reportedInputTokens / Math.max(1, loopStep - initial.startStep + 1)))
      : fallbackPerStepInputTokens;
    const estimatedRemainingTokens = estimateRemainingLoopTokens(
      observedPerStepInputTokens,
      loopStep,
      DEFAULT_AGENT_LOOP_CONFIG,
    );

    // ── Token 预算警告 | Token budget warning ──
    if (shouldWarnTokenBudget(estimatedRemainingTokens, DEFAULT_AGENT_LOOP_CONFIG)) {
      const mem = deps.getSessionMemory();
      const nextMem: AiSessionMemory = {
        ...mem,
        pendingAgentLoopCheckpoint: {
          kind: 'token_budget_warning',
          originalUserText: deps.agentLoopSourceUserText,
          continuationInput: continuationUserText,
          step: loopStep,
          estimatedRemainingTokens,
          createdAt: nowIso(),
        },
      };
      deps.setSessionMemory(nextMem);
      deps.persistSessionMemory(nextMem);
      const budgetHint = getAiChatCardMessages(deps.getLocaleIsZhCn()).tokenBudgetWarning(estimatedRemainingTokens);
      resolvedContent = `${resolvedContent}${budgetHint}`;
      resolvedStatus = 'done';
      resolvedLocalToolResults = undefined;
      stepSpan.end();
      break;
    }

    const { stream: continuationStream } = createAssistantStream({
      userText: continuationUserText,
      clarifyFastPathCall: null,
      history: continuationHistory,
      orchestrator: deps.orchestrator,
      systemPrompt: deps.systemPrompt,
      signal: deps.signal,
      taskSessionStatus: 'executing',
      model: deps.getSettings().model,
      ...(deps.getSettings().explainModel
        ? { explainModel: deps.getSettings().explainModel }
        : {}),
    });

    let continuationAssistantContent = '';
    let continuationReasoningContent = '';
    let continuationStreamError: string | null = null;
    let continuationUsage: ChatTokenUsage | undefined;
    const loopStepStartedAt = Date.now();

    for await (const chunk of continuationStream) {
      if ((chunk.delta ?? '').length > 0) {
        continuationAssistantContent += chunk.delta ?? '';
      }
      if ((chunk.reasoningContent ?? '').length > 0) {
        continuationReasoningContent += chunk.reasoningContent ?? '';
      }
      if (chunk.usage) {
        continuationUsage = mergeTokenUsage(continuationUsage, chunk.usage);
      }
      if (chunk.error) {
        continuationStreamError = chunk.error;
        break;
      }
      if (chunk.done) {
        break;
      }
    }

    assistantReasoningContent += continuationReasoningContent;
    reportedInputTokens += continuationUsage?.inputTokens ?? 0;
    totalOutputTokens += continuationUsage?.outputTokens ?? 0;

    if (continuationStreamError) {
      resolvedStatus = 'error';
      resolvedErrorMessage = continuationStreamError;
      resolvedConnectionErrorMessage = continuationStreamError;
      resolvedContent = continuationAssistantContent;
      stepSpan.endWithError(continuationStreamError);
      break;
    }

    const continuationResult = await finalizeAssistantStreamCompletion(
      {
        assistantId: deps.assistantId,
        assistantContent: continuationAssistantContent,
        userText: continuationUserText,
        aiContext: loopAiContext,
      },
      {
        ...deps.buildStreamCompletionEnv(),
        localToolTraceOptions: {
          traceId: agentLoopTraceContext.traceId,
          step: loopStep,
        },
      },
    );

    // ── 审计日志 | Audit log ──
    const loopStepDurationMs = Date.now() - loopStepStartedAt;
    const loopStepTokenCount = continuationUsage?.totalTokens
      ?? ((continuationUsage?.inputTokens ?? 0) + (continuationUsage?.outputTokens ?? 0));
    await deps.insertAuditLog({
      id: newAuditLogId(),
      collection: 'ai_messages',
      documentId: deps.assistantId,
      action: 'update',
      field: 'ai_agent_loop_step',
      oldValue: `step:${loopStep}`,
      newValue: continuationResult.finalStatus,
      source: 'ai',
      timestamp: nowIso(),
      requestId: `${deps.assistantId}_loop_${loopStep}`,
      metadataJson: JSON.stringify({
        schemaVersion: 1,
        phase: 'agent_loop_step',
        requestId: `${deps.assistantId}_loop_${loopStep}`,
        step: loopStep,
        maxSteps: DEFAULT_AGENT_LOOP_CONFIG.maxSteps,
        inputSummary: continuationUserText.slice(0, 500),
        outputSummary: continuationAssistantContent.slice(0, 500),
        durationMs: loopStepDurationMs,
        reportedTokens: loopStepTokenCount,
      }),
    });

    if (coordinationSession) {
      const phase = inferCoordinationPhase({
        finalStatus: continuationResult.finalStatus,
        nextLocalToolCount: continuationResult.localToolResults?.length ?? 0,
        selectedToolCount: deps.routingPlan.selectedTools.length,
      });
      const notification: CoordinationNotification = {
        taskId: `${deps.assistantId}_loop_${loopStep}`,
        status: continuationResult.finalStatus === 'done' ? 'completed' : 'failed',
        summary: continuationAssistantContent.slice(0, 240) || continuationUserText.slice(0, 240),
        phase,
        usage: {
          durationMs: loopStepDurationMs,
          ...(continuationUsage?.inputTokens !== undefined ? { inputTokens: continuationUsage.inputTokens } : {}),
          ...(continuationUsage?.outputTokens !== undefined ? { outputTokens: continuationUsage.outputTokens } : {}),
        },
      };
      coordinationSession.ingest(notification);
      const policy = resolveCoordinationParallelPolicy({ phase, includesWrite: false });
      await deps.insertAuditLog(buildCoordinationAuditLog({
        assistantId: deps.assistantId,
        taskSessionId: deps.getTaskSession().id,
        notification,
        policy,
        quarantinedCount: coordinationSession.listQuarantined().length,
      }));
    }

    resolvedContent = continuationResult.finalContent;
    resolvedStatus = continuationResult.finalStatus;
    resolvedErrorMessage = continuationResult.finalErrorMessage;
    resolvedConnectionErrorMessage = continuationResult.connectionErrorMessage ?? resolvedConnectionErrorMessage;
    resolvedLocalToolResults = continuationResult.localToolResults;
    rawAssistantContentForLoop = continuationAssistantContent;

    if (continuationResult.finalStatus === 'error') {
      stepSpan.endWithError(continuationResult.finalErrorMessage ?? 'agent loop continuation failed');
    } else {
      stepSpan.end();
    }

    loopStep += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      stepSpan.endWithError(message);
      throw error;
    }
  }

  return {
    resolvedContent,
    resolvedStatus,
    resolvedErrorMessage,
    resolvedConnectionErrorMessage,
    resolvedLocalToolResults,
    loopExecuted,
    assistantReasoningContent,
    totalOutputTokens,
    reportedInputTokens,
  };
}
