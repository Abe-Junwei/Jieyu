import { assessToolActionIntent, buildToolAuditContext, buildToolDecisionAuditMetadata, buildToolIntentAuditMetadata, isDestructiveToolCall, toNaturalToolFailure, toNaturalToolGraySkipped, toNaturalToolPending, toNaturalToolRollbackSkipped, validateToolCallArguments } from '../ai/chat/toolCallHelpers';
import { formatDuplicateRequestIgnoredDetail, formatDuplicateRequestIgnoredError } from '../ai/messages';
import type { AiToolFeedbackStyle } from '../ai/providers/providerCatalog';
import type { Locale } from '../i18n';
import { buildAndAuditToolIntent } from './useAiChat.toolIntent';
import { resolveToolIntentOutcome } from './useAiChat.intentResolution';
import { handleInvalidToolArguments } from './useAiChat.argsValidation';
import { resolveDestructiveGate } from './useAiChat.destructiveGate';
import { executeAutoToolCall } from './useAiChat.autoExecute';
import type { AiChatToolCall, AiInteractionMetrics, AiMemoryRecallShapeTelemetry, AiPromptContext, AiSessionMemory, AiTaskSession, AiToolDecisionMode, AiToolRiskCheckResult, PendingAiToolCall, UiChatMessage } from './useAiChat';

function isBatchToolCall(call: AiChatToolCall): boolean {
  return Object.values(call.arguments).some((value) => Array.isArray(value) && value.length > 1)
    || call.name === 'propose_changes'
    || call.name === 'merge_transcription_segments';
}

function isWriteLikeToolCall(call: AiChatToolCall): boolean {
  if (isDestructiveToolCall(call.name)) return true;
  return /^(create_|set_|split_|merge_|clear_|link_|unlink_|add_|remove_|switch_|auto_gloss_)/.test(call.name)
    || call.name === 'propose_changes';
}

interface ResolveToolDecisionPipelineParams {
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
  onToolRiskCheck?: ((call: AiChatToolCall) => Promise<AiToolRiskCheckResult | null | undefined> | AiToolRiskCheckResult | null | undefined) | null | undefined;
  preparePendingToolCall?: ((call: AiChatToolCall) => Promise<AiChatToolCall | null | undefined> | AiChatToolCall | null | undefined) | null | undefined;
  onToolCall?: ((call: AiChatToolCall) => Promise<{ ok: boolean; message: string }> | { ok: boolean; message: string }) | null | undefined;
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
}

interface ResolveToolDecisionPipelineResult {
  finalContent: string;
  finalStatus: 'done' | 'error';
  finalErrorMessage?: string;
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
}: ResolveToolDecisionPipelineParams): Promise<ResolveToolDecisionPipelineResult> {
  const baseAuditContext = buildToolAuditContext(
    userText,
    providerId,
    model,
    toolDecisionMode,
    toolFeedbackStyle,
    planner,
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

  const {
    intentAssessment,
    auditContext,
  } = await buildAndAuditToolIntent({
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
    writeToolIntentAuditLog,
  });

  const intentOutcome = resolveToolIntentOutcome({
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
    const finalErrorMessage = formatDuplicateRequestIgnoredError();
    const finalContent = toNaturalToolFailure(locale, toolCall.name, formatDuplicateRequestIgnoredDetail(), toolFeedbackStyle);
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

  const toolPreference = sessionMemory.toolPreferences?.autoExecute;
  const safetyPreferences = sessionMemory.safetyPreferences;
  const policyBlocksDestructive = safetyPreferences?.denyDestructive === true && isDestructiveToolCall(toolCall.name);
  const policyBlocksBatch = safetyPreferences?.denyBatch === true && isBatchToolCall(toolCall);
  const policyBlocksExecution = toolPreference === 'never' || policyBlocksDestructive || policyBlocksBatch;
  if (policyBlocksExecution) {
    const reason = toolPreference === 'never'
      ? 'user_directive_never_execute'
      : policyBlocksDestructive
        ? 'user_directive_deny_destructive'
        : 'user_directive_deny_batch';
    const message = reason === 'user_directive_never_execute'
      ? 'Blocked by user directive: do not execute tools automatically.'
      : reason === 'user_directive_deny_destructive'
        ? 'Blocked by user directive: destructive actions are disabled.'
        : 'Blocked by user directive: batch actions are disabled.';
    const finalContent = toNaturalToolFailure(locale, toolCall.name, message, toolFeedbackStyle);
    await writeToolDecisionAuditLog(
      assistantMessageId,
      `auto:${toolCall.name}`,
      `policy_blocked:${toolCall.name}:${reason}`,
      'system',
      toolCall.requestId,
      buildToolDecisionAuditMetadata(
        assistantMessageId,
        toolCall,
        auditContext,
        'system',
        'policy_blocked',
        false,
        message,
        reason,
      ),
    );
    return { finalContent, finalStatus: 'done' };
  }

  const policyRequiresConfirmation = toolPreference === 'ask_first'
    || (safetyPreferences?.requireImpactPreview === true && isWriteLikeToolCall(toolCall));
  if (policyRequiresConfirmation) {
    setTaskSession({
      id: taskSessionId,
      status: 'waiting_confirm',
      toolName: toolCall.name,
      updatedAt: new Date().toISOString(),
    });
    setPendingToolCall({
      call: toolCall,
      assistantMessageId,
      riskSummary: 'User directive requires confirmation before execution.',
      impactPreview: ['Execution is paused until you confirm this tool call.'],
      ...(toolCall.requestId ? { requestId: toolCall.requestId } : {}),
      auditContext,
    });
    await writeToolDecisionAuditLog(
      assistantMessageId,
      `auto:${toolCall.name}`,
      `policy_pending:${toolCall.name}:user_directive_confirmation_required`,
      'system',
      toolCall.requestId,
      buildToolDecisionAuditMetadata(
        assistantMessageId,
        toolCall,
        auditContext,
        'system',
        'policy_pending',
        false,
        'User directive requires confirmation before execution.',
        'user_directive_confirmation_required',
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
      setPendingToolCall(value);
    },
    taskSessionId,
    bumpFailureMetric: () => bumpMetric('failureCount'),
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
  });

  return {
    finalContent: autoExecution.finalContent,
    finalStatus: autoExecution.finalStatus,
    ...(autoExecution.finalErrorMessage ? { finalErrorMessage: autoExecution.finalErrorMessage } : {}),
  };
}
