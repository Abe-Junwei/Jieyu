import {
  assessToolActionIntent,
  buildPreviewContract,
  buildToolAuditContext,
  buildToolDecisionAuditMetadata,
  buildToolIntentAuditMetadata,
  describeAndBuildPending,
  isDestructiveToolCall,
  toNaturalToolFailure,
  toNaturalToolGraySkipped,
  toNaturalToolPending,
  toNaturalToolRollbackSkipped,
  validateToolCallArguments,
} from './toolCallHelpers';
import { resolveAiAgentRuntimeV2Enabled, featureFlags } from '../config/featureFlags';
import { resolveUserDirectivePolicyDecision } from '../policy/resolveExecutionPolicy';
import { formatToolWriteGateUserMessage } from '../messages/toolWriteGateFeedback';
import { isAiToolWritePreviewRequired } from '../policy/aiToolPolicyMatrix';
import { assertAiChatToolWriteAllowed } from '../runtime/toolWriteGate';
import {
  formatDuplicateRequestIgnoredDetail,
  formatDuplicateRequestIgnoredError,
} from '../messages';
import type { AiToolFeedbackStyle } from '../providers/providerCatalog';
import { t, type Locale } from '../../i18n';
import { buildAndAuditToolIntent } from '../../hooks/ai/useAiChat.toolIntent';
import { resolveToolIntentOutcome } from '../../hooks/ai/useAiChat.intentResolution';
import { handleInvalidToolArguments } from '../../hooks/ai/useAiChat.argsValidation';
import { resolveDestructiveGate } from '../../hooks/ai/useAiChat.destructiveGate';
import { executeAutoToolCall } from '../../hooks/ai/useAiChat.autoExecute';
import {
  publishAgentWriteBlocked,
  publishAgentWritePreviewPending,
} from '../runtime/agentUiEvents';
import type {
  AiChatToolCall,
  AiInteractionMetrics,
  AiMemoryRecallShapeTelemetry,
  AiPromptContext,
  AiSessionMemory,
  AiTaskSession,
  AiToolDecisionMode,
  AiToolRiskCheckResult,
  PendingAiToolCall,
  UiChatMessage,
} from '../../hooks/ai/useAiChat.types';

export interface ResolveToolDecisionPipelineParams {
  assistantMessageId: string;
  toolCall: AiChatToolCall;
  userText: string;
  aiContext: AiPromptContext | null;
  messageHistory: UiChatMessage[];
  providerId: string;
  model: string;
  locale: Locale;
  toolDecisionMode: AiToolDecisionMode;
  toolFeedbackStyle: AiToolFeedbackStyle;
  planner?: Parameters<typeof buildToolAuditContext>[5];
  memoryRecallShape?: AiMemoryRecallShapeTelemetry;
  allowDestructiveToolCalls: boolean;
  /**
   * v2 SDK 原生审批：request=只出确认卡片与 pending 审计，绝不执行；approved=用户已批准，跳过确认分支，
   * 仍过策略拦截、写入门禁、去重与决策审计。| v2 native approval: request never executes; approved skips confirm branches.
   */
  runtimeV2Approval?: 'request' | 'approved';
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
    metadata?: ReturnType<typeof buildToolDecisionAuditMetadata>,
  ) => Promise<void>;
  writeToolIntentAuditLog: (
    assistantMessageId: string,
    callName: AiChatToolCall['name'],
    assessment: ReturnType<typeof assessToolActionIntent>,
    requestId?: string,
    metadata?: ReturnType<typeof buildToolIntentAuditMetadata>,
  ) => Promise<void>;
  sessionMemory: AiSessionMemory;
  updateSessionMemory: (nextMemory: AiSessionMemory) => void;
  persistSessionMemory: (memory: AiSessionMemory) => void;
  setTaskSession: (value: AiTaskSession) => void;
  setPendingToolCall: (value: PendingAiToolCall | null) => void;
  taskSessionId: string;
  markExecutedRequestId: (requestId: string) => void;
  bumpMetric: (key: keyof AiInteractionMetrics) => void;
  shouldBumpRecovery: boolean;
  shouldApplyTurnSideEffects?: () => boolean;
  turnConversationId?: string | null;
  agentRunId?: string;
}

export interface ResolveToolDecisionPipelineResult {
  finalContent: string;
  finalStatus: 'done' | 'error';
  finalErrorMessage?: string;
}

function turnSideEffectsStillValid(shouldApplyTurnSideEffects?: () => boolean): boolean {
  return shouldApplyTurnSideEffects === undefined || shouldApplyTurnSideEffects();
}

function staleTurnSupersededResult(assistantContent: string): ResolveToolDecisionPipelineResult {
  return { finalContent: assistantContent, finalStatus: 'done' };
}

/**
 * 统一处理 send 完成时的工具决策分支 | Unified tool decision pipeline for send completion
 */
export async function resolveToolDecisionPipeline({
  assistantMessageId,
  toolCall,
  userText,
  aiContext,
  messageHistory,
  providerId,
  model,
  locale,
  toolDecisionMode,
  toolFeedbackStyle,
  planner,
  memoryRecallShape,
  allowDestructiveToolCalls,
  onToolRiskCheck,
  preparePendingToolCall,
  onToolCall,
  hasPersistedExecutionForRequest,
  writeToolDecisionAuditLog,
  writeToolIntentAuditLog,
  sessionMemory,
  updateSessionMemory,
  persistSessionMemory,
  setTaskSession,
  setPendingToolCall,
  taskSessionId,
  markExecutedRequestId,
  bumpMetric,
  shouldBumpRecovery,
  shouldApplyTurnSideEffects,
  turnConversationId,
  agentRunId,
  runtimeV2Approval,
}: ResolveToolDecisionPipelineParams): Promise<ResolveToolDecisionPipelineResult> {
  const v2Approved = runtimeV2Approval === 'approved';
  const v2Request = runtimeV2Approval === 'request';
  // 批准后才放行破坏性执行；request 模式保留原值，让风险检查与影响摘要照常运行 |
  // only an approved call bypasses the destructive gate; request mode keeps the risk check.
  if (v2Approved) allowDestructiveToolCalls = true;
  const baseAuditContext = buildToolAuditContext(
    userText,
    providerId,
    model,
    toolDecisionMode,
    toolFeedbackStyle,
    planner,
    undefined,
    undefined,
    agentRunId,
  );

  if (toolDecisionMode === 'rollback') {
    const finalContent = toNaturalToolRollbackSkipped(locale, toolCall.name, toolFeedbackStyle);
    await writeToolDecisionAuditLog(
      assistantMessageId,
      `auto:${toolCall.name}`,
      `rollback_skipped:${toolCall.name}`,
      'system',
      toolCall.requestId,
      buildToolDecisionAuditMetadata(
        assistantMessageId,
        toolCall,
        baseAuditContext,
        'system',
        'rollback_skipped',
        false,
      ),
    );
    return { finalContent, finalStatus: 'done' };
  }

  const { intentAssessment, auditContext } = await buildAndAuditToolIntent({
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
    ...(memoryRecallShape ? { memoryRecallShape } : {}),
    ...(agentRunId ? { agentRunId } : {}),
    writeToolIntentAuditLog,
  });

  const setPendingWritePreview: ResolveToolDecisionPipelineParams['setPendingToolCall'] = (
    value,
  ) => {
    setPendingToolCall(value);
    if (value) {
      publishAgentWritePreviewPending({
        pending: value,
        ...(auditContext.agentRunId ? { agentRunId: auditContext.agentRunId } : {}),
      });
    }
  };

  // v2 已批准：用户已明确决定，不再做意图澄清 | approved by the user: skip intent clarification
  const intentOutcome = v2Approved
    ? null
    : resolveToolIntentOutcome({
        intentAssessment,
        ...(planner?.decision ? { plannerDecision: planner.decision } : {}),
        ...(planner?.reason ? { plannerReason: planner.reason } : {}),
        toolCallName: toolCall.name,
        userText,
        locale,
        toolFeedbackStyle,
        aiContext,
        sessionMemory,
        taskSessionId,
        bumpMetric,
        setTaskSession,
        setPendingToolCall,
      });

  if (intentOutcome !== null) {
    return {
      finalContent: intentOutcome,
      finalStatus: 'done',
    };
  }

  if (toolDecisionMode === 'gray') {
    const argsValidationError = validateToolCallArguments(toolCall);
    if (argsValidationError) {
      const invalidArgsResult = await handleInvalidToolArguments({
        assistantMessageId,
        toolCall,
        argsValidationError,
        locale,
        toolFeedbackStyle,
        source: 'system',
        decision: 'gray_failed',
        auditContext,
        writeToolDecisionAuditLog,
      });
      bumpMetric('failureCount');
      return {
        finalContent: invalidArgsResult.finalContent,
        finalStatus: 'error',
        finalErrorMessage: invalidArgsResult.finalErrorMessage,
      };
    }

    const finalContent = toNaturalToolGraySkipped(locale, toolCall.name, toolFeedbackStyle);
    await writeToolDecisionAuditLog(
      assistantMessageId,
      `auto:${toolCall.name}`,
      `gray_skipped:${toolCall.name}`,
      'system',
      toolCall.requestId,
      buildToolDecisionAuditMetadata(
        assistantMessageId,
        toolCall,
        auditContext,
        'system',
        'gray_skipped',
        false,
      ),
    );
    return {
      finalContent,
      finalStatus: 'done',
    };
  }

  if (await hasPersistedExecutionForRequest(toolCall.requestId ?? '')) {
    const finalErrorMessage = formatDuplicateRequestIgnoredError(locale);
    const finalContent = toNaturalToolFailure(
      locale,
      toolCall.name,
      formatDuplicateRequestIgnoredDetail(locale),
      toolFeedbackStyle,
    );
    await writeToolDecisionAuditLog(
      assistantMessageId,
      `auto:${toolCall.name}`,
      `auto_failed:${toolCall.name}:duplicate_requestId`,
      'ai',
      toolCall.requestId,
      buildToolDecisionAuditMetadata(
        assistantMessageId,
        toolCall,
        baseAuditContext,
        'ai',
        'auto_failed',
        false,
        finalErrorMessage,
        'duplicate_requestId',
      ),
    );
    return {
      finalContent,
      finalStatus: 'error',
      finalErrorMessage,
    };
  }

  const argsValidationError = validateToolCallArguments(toolCall);
  if (argsValidationError) {
    const invalidArgsResult = await handleInvalidToolArguments({
      assistantMessageId,
      toolCall,
      argsValidationError,
      locale,
      toolFeedbackStyle,
      source: 'ai',
      decision: 'auto_failed',
      auditContext,
      writeToolDecisionAuditLog,
    });
    bumpMetric('failureCount');
    return {
      finalContent: invalidArgsResult.finalContent,
      finalStatus: 'error',
      finalErrorMessage: invalidArgsResult.finalErrorMessage,
    };
  }

  const policyDecision = resolveUserDirectivePolicyDecision(toolCall, sessionMemory);
  if (policyDecision.action === 'block') {
    const finalContent = toNaturalToolFailure(
      locale,
      toolCall.name,
      policyDecision.message,
      toolFeedbackStyle,
    );
    await writeToolDecisionAuditLog(
      assistantMessageId,
      `auto:${toolCall.name}`,
      `policy_blocked:${toolCall.name}:${policyDecision.reason}`,
      'system',
      toolCall.requestId,
      buildToolDecisionAuditMetadata(
        assistantMessageId,
        toolCall,
        auditContext,
        'system',
        'policy_blocked',
        false,
        policyDecision.message,
        policyDecision.reason,
      ),
    );
    publishAgentWriteBlocked({
      toolName: toolCall.name,
      reasonCode: policyDecision.reason,
      ...(auditContext.agentRunId ? { agentRunId: auditContext.agentRunId } : {}),
      ...(toolCall.requestId ? { requestId: toolCall.requestId } : {}),
    });
    return { finalContent, finalStatus: 'done' };
  }

  if (featureFlags.aiToolWriteGateEnabled || resolveAiAgentRuntimeV2Enabled()) {
    const writeGateDecision = assertAiChatToolWriteAllowed(toolCall, aiContext, {
      gateEnabled: true,
      // v2 request：用户审批即授权，写门只查作用域 | v2 request: approval is the authorization
      destructiveAllowed: allowDestructiveToolCalls || v2Request,
    });
    if (!writeGateDecision.allowed) {
      const gateMessage = formatToolWriteGateUserMessage(locale, writeGateDecision.reasonCode);
      const finalContent = toNaturalToolFailure(
        locale,
        toolCall.name,
        gateMessage,
        toolFeedbackStyle,
      );
      await writeToolDecisionAuditLog(
        assistantMessageId,
        `auto:${toolCall.name}`,
        `policy_blocked:${toolCall.name}:${writeGateDecision.reasonCode}`,
        'system',
        toolCall.requestId,
        buildToolDecisionAuditMetadata(
          assistantMessageId,
          toolCall,
          auditContext,
          'system',
          'policy_blocked',
          false,
          gateMessage,
          writeGateDecision.reasonCode,
        ),
      );
      publishAgentWriteBlocked({
        toolName: toolCall.name,
        reasonCode: writeGateDecision.reasonCode,
        ...(auditContext.agentRunId ? { agentRunId: auditContext.agentRunId } : {}),
        ...(toolCall.requestId ? { requestId: toolCall.requestId } : {}),
      });
      return { finalContent, finalStatus: 'done' };
    }
  }

  if (policyDecision.action === 'confirm' && !v2Approved) {
    const executionCall = preparePendingToolCall
      ? ((await preparePendingToolCall(toolCall)) ?? undefined)
      : undefined;
    if (!turnSideEffectsStillValid(shouldApplyTurnSideEffects)) {
      return staleTurnSupersededResult(
        toNaturalToolPending(locale, toolCall.name, toolFeedbackStyle),
      );
    }
    const previewSourceCall = executionCall ?? toolCall;
    const impact = describeAndBuildPending(previewSourceCall, aiContext);
    const readModelEpochCaptured = aiContext?.shortTerm?.timelineReadModelEpoch;
    setTaskSession({
      id: taskSessionId,
      status: 'waiting_confirm',
      toolName: toolCall.name,
      updatedAt: new Date().toISOString(),
    });
    setPendingWritePreview({
      call: toolCall,
      ...(executionCall ? { executionCall } : {}),
      assistantMessageId,
      riskSummary: impact.riskSummary,
      impactPreview: impact.impactPreview,
      approvalMode: 'user_preference',
      policyReasonCode: policyDecision.reason,
      policyReasonLabel: policyDecision.message,
      riskTier: isDestructiveToolCall(toolCall.name) ? 'high' : 'medium',
      previewContract: buildPreviewContract(previewSourceCall, aiContext),
      ...(toolCall.requestId ? { requestId: toolCall.requestId } : {}),
      auditContext,
      ...(readModelEpochCaptured !== undefined ? { readModelEpochCaptured } : {}),
      ...(turnConversationId ? { conversationIdAtCapture: turnConversationId } : {}),
    });
    await writeToolDecisionAuditLog(
      assistantMessageId,
      `auto:${toolCall.name}`,
      `policy_pending:${toolCall.name}:${policyDecision.reason}`,
      'system',
      toolCall.requestId,
      buildToolDecisionAuditMetadata(
        assistantMessageId,
        toolCall,
        auditContext,
        'system',
        'policy_pending',
        false,
        policyDecision.message,
        policyDecision.reason,
      ),
    );
    return {
      finalContent: toNaturalToolPending(locale, toolCall.name, toolFeedbackStyle),
      finalStatus: 'done',
    };
  }

  // v2 request：先过破坏性门（风险检查、歧义目标澄清、具体化目标与影响摘要），卡片即用户批准的那个调用 |
  // v2 request: run the destructive gate first so the card carries the risk check and resolved target.
  if (v2Request) {
    const v2Gate = await resolveDestructiveGate({
      assistantMessageId,
      toolCall,
      aiContext,
      auditContext,
      locale,
      toolFeedbackStyle,
      allowDestructiveToolCalls,
      ...(onToolRiskCheck ? { onToolRiskCheck } : {}),
      ...(preparePendingToolCall ? { preparePendingToolCall } : {}),
      writeToolDecisionAuditLog,
      setTaskSession,
      setPendingToolCall: (value) => {
        setPendingWritePreview(value);
      },
      taskSessionId,
      bumpFailureMetric: () => bumpMetric('failureCount'),
      ...(shouldApplyTurnSideEffects ? { shouldApplyTurnSideEffects } : {}),
      ...(turnConversationId ? { turnConversationId } : {}),
    });
    if (v2Gate.kind === 'error') {
      return {
        finalContent: v2Gate.finalContent,
        finalStatus: 'error',
        finalErrorMessage: v2Gate.finalErrorMessage,
      };
    }
    if (v2Gate.kind === 'pending') {
      await writeToolDecisionAuditLog(
        assistantMessageId,
        `auto:${toolCall.name}`,
        `policy_pending:${toolCall.name}:tool_approval`,
        'system',
        toolCall.requestId,
        buildToolDecisionAuditMetadata(
          assistantMessageId,
          toolCall,
          auditContext,
          'system',
          'policy_pending',
          false,
        ),
      );
      return { finalContent: v2Gate.finalContent, finalStatus: 'done' };
    }
  }

  if (
    v2Request ||
    (!v2Approved &&
      (featureFlags.aiToolWriteGateEnabled || resolveAiAgentRuntimeV2Enabled()) &&
      isAiToolWritePreviewRequired(toolCall.name))
  ) {
    const executionCall = preparePendingToolCall
      ? ((await preparePendingToolCall(toolCall)) ?? undefined)
      : undefined;
    if (!turnSideEffectsStillValid(shouldApplyTurnSideEffects)) {
      return staleTurnSupersededResult(
        toNaturalToolPending(locale, toolCall.name, toolFeedbackStyle),
      );
    }
    const previewSourceCall = executionCall ?? toolCall;
    const impact = describeAndBuildPending(previewSourceCall, aiContext);
    const readModelEpochCaptured = aiContext?.shortTerm?.timelineReadModelEpoch;
    const previewReasonCode = 'write_gate_preview_required' as const;
    const previewReasonLabel = t(locale, 'ai.toolWriteGate.previewConfirmationRequired');
    setTaskSession({
      id: taskSessionId,
      status: 'waiting_confirm',
      toolName: toolCall.name,
      updatedAt: new Date().toISOString(),
    });
    setPendingWritePreview({
      call: toolCall,
      ...(executionCall ? { executionCall } : {}),
      assistantMessageId,
      riskSummary: impact.riskSummary,
      impactPreview: impact.impactPreview,
      approvalMode: 'safety_gate',
      policyReasonCode: previewReasonCode,
      policyReasonLabel: previewReasonLabel,
      riskTier: isDestructiveToolCall(toolCall.name) ? 'high' : 'medium',
      previewContract: buildPreviewContract(previewSourceCall, aiContext),
      ...(toolCall.requestId ? { requestId: toolCall.requestId } : {}),
      auditContext,
      ...(readModelEpochCaptured !== undefined ? { readModelEpochCaptured } : {}),
      ...(turnConversationId ? { conversationIdAtCapture: turnConversationId } : {}),
    });
    await writeToolDecisionAuditLog(
      assistantMessageId,
      `auto:${toolCall.name}`,
      `policy_pending:${toolCall.name}:${previewReasonCode}`,
      'system',
      toolCall.requestId,
      buildToolDecisionAuditMetadata(
        assistantMessageId,
        toolCall,
        auditContext,
        'system',
        'policy_pending',
        false,
        previewReasonLabel,
        previewReasonCode,
      ),
    );
    return {
      finalContent: toNaturalToolPending(locale, toolCall.name, toolFeedbackStyle),
      finalStatus: 'done',
    };
  }

  const gateOutcome = await resolveDestructiveGate({
    assistantMessageId,
    toolCall,
    aiContext,
    auditContext,
    locale,
    toolFeedbackStyle,
    allowDestructiveToolCalls,
    ...(onToolRiskCheck ? { onToolRiskCheck } : {}),
    ...(preparePendingToolCall ? { preparePendingToolCall } : {}),
    writeToolDecisionAuditLog,
    setTaskSession,
    setPendingToolCall: (value) => {
      setPendingWritePreview(value);
    },
    taskSessionId,
    bumpFailureMetric: () => bumpMetric('failureCount'),
    ...(shouldApplyTurnSideEffects ? { shouldApplyTurnSideEffects } : {}),
    ...(turnConversationId ? { turnConversationId } : {}),
  });

  if (gateOutcome.kind === 'error') {
    return {
      finalContent: gateOutcome.finalContent,
      finalStatus: 'error',
      finalErrorMessage: gateOutcome.finalErrorMessage,
    };
  }

  if (gateOutcome.kind === 'pending') {
    return {
      finalContent: gateOutcome.finalContent,
      finalStatus: 'done',
    };
  }

  const autoExecution = await executeAutoToolCall({
    assistantMessageId,
    toolCall,
    auditContext,
    locale,
    toolFeedbackStyle,
    ...(onToolCall ? { onToolCall } : {}),
    writeToolDecisionAuditLog,
    setTaskSession,
    taskSessionId,
    sessionMemory,
    updateSessionMemory,
    persistSessionMemory,
    markExecutedRequestId,
    bumpMetric,
    shouldBumpRecovery,
    ...(shouldApplyTurnSideEffects ? { shouldApplyTurnSideEffects } : {}),
  });

  return {
    finalContent: autoExecution.finalContent,
    finalStatus: autoExecution.finalStatus,
    ...(autoExecution.finalErrorMessage
      ? { finalErrorMessage: autoExecution.finalErrorMessage }
      : {}),
  };
}
