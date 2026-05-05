import { featureFlags } from '../ai/config/featureFlags';
import { dryRunToolCallForConfirm } from '../ai/chat/toolCallDryRun';
import { shouldRetryToolCallExecutorThrow } from '../ai/chat/toolDecisionFailureReason';
import { buildToolDecisionAuditMetadata, isDestructiveToolCall, toNaturalToolFailure, toNaturalToolSuccess } from '../ai/chat/toolCallHelpers';
import { formatDuplicateRequestIgnoredDetail, formatDuplicateRequestIgnoredError, formatInvalidArgsError, formatNoExecutorInternalError, formatNoExecutorToolFailureDetail, formatToolExecutionFallbackError } from '../ai/messages';
import { buildPostExecSessionMemory } from './useAiChat.postExecSessionPatch';
import { nowIso } from './useAiChat.helpers';
import { genRequestId } from './useAiChat.toolAudit';
import type { Locale } from '../i18n';
import type { AiChatToolCall, AiChatToolResult, AiInteractionMetrics, AiSessionMemory, AiTaskSession } from './useAiChat.types';
import type { AiToolFeedbackStyle } from '../ai/providers/providerCatalog';

/** Promise.race 超时支路在胜出后清除 timer，避免未处理的 rejection。 */
export async function raceWithTimeout<T>(primary: T | Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(primary),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Tool execution timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

interface ExecuteConfirmedToolCallParams {
  assistantMessageId: string;
  call: AiChatToolCall & { requestId: string };
  auditContext: Parameters<typeof buildToolDecisionAuditMetadata>[2];
  locale: Locale;
  toolFeedbackStyle: AiToolFeedbackStyle;
  hasPersistedExecutionForRequest: (requestId: string) => Promise<boolean>;
  applyAssistantMessageResult: (
    id: string,
    content: string,
    status?: 'done' | 'error',
    error?: string,
  ) => Promise<void>;
  onToolCall?: ((call: AiChatToolCall) => Promise<AiChatToolResult> | AiChatToolResult) | null | undefined;
  writeToolDecisionAuditLog: (
    assistantMessageId: string,
    oldValue: string,
    newValue: string,
    source: 'human' | 'ai' | 'system',
    requestId?: string,
    metadata?: ReturnType<typeof buildToolDecisionAuditMetadata>,
  ) => Promise<void>;
  setTaskSession: (value: AiTaskSession) => void;
  taskSessionId: string;
  markExecutedRequestId: (requestId: string) => void;
  sessionMemory: AiSessionMemory;
  updateSessionMemory: (nextMemory: AiSessionMemory) => void;
  persistSessionMemory: (memory: AiSessionMemory) => void;
  bumpMetric: (key: keyof AiInteractionMetrics) => void;
}

interface FinalizeHumanToolCallConfirmOutcomeParams {
  assistantMessageId: string;
  call: AiChatToolCall & { requestId: string };
  auditContext: Parameters<typeof buildToolDecisionAuditMetadata>[2];
  locale: Locale;
  toolFeedbackStyle: AiToolFeedbackStyle;
  ok: boolean;
  message: string;
  execDurationMs: number;
  applyAssistantMessageResult: ExecuteConfirmedToolCallParams['applyAssistantMessageResult'];
  writeToolDecisionAuditLog: ExecuteConfirmedToolCallParams['writeToolDecisionAuditLog'];
  markExecutedRequestId: ExecuteConfirmedToolCallParams['markExecutedRequestId'];
}

/**
 * T3-c / idempotency: single-tool human confirm always persists UI + decision audit before `markExecutedRequestId`
 * (only when `ok`). See `docs/architecture/ai-chat-tool-confirm-idempotency.md`.
 */
async function finalizeHumanToolCallConfirmOutcome(params: FinalizeHumanToolCallConfirmOutcomeParams): Promise<void> {
  const {
    assistantMessageId,
    call,
    auditContext,
    locale,
    toolFeedbackStyle,
    ok,
    message,
    execDurationMs,
    applyAssistantMessageResult,
    writeToolDecisionAuditLog,
    markExecutedRequestId,
  } = params;
  await applyAssistantMessageResult(
    assistantMessageId,
    ok
      ? toNaturalToolSuccess(locale, call.name, message, toolFeedbackStyle)
      : toNaturalToolFailure(locale, call.name, message, toolFeedbackStyle),
    ok ? 'done' : 'error',
    ok ? undefined : message,
  );
  await writeToolDecisionAuditLog(
    assistantMessageId,
    `pending:${call.name}`,
    `${ok ? 'confirmed' : 'confirm_failed'}:${call.name}`,
    'human',
    call.requestId,
    buildToolDecisionAuditMetadata(
      assistantMessageId,
      call,
      auditContext,
      'human',
      ok ? 'confirmed' : 'confirm_failed',
      ok,
      message,
      undefined,
      execDurationMs,
    ),
  );
  if (ok) {
    markExecutedRequestId(call.requestId);
  }
}

interface FinalizeHumanProposeChangesParentSuccessParams {
  assistantMessageId: string;
  parentCall: AiChatToolCall & { requestId: string };
  auditContext: Parameters<typeof buildToolDecisionAuditMetadata>[2];
  locale: Locale;
  toolFeedbackStyle: AiToolFeedbackStyle;
  childCallsLength: number;
  execStartMs: number;
  applyAssistantMessageResult: ExecuteConfirmedToolCallParams['applyAssistantMessageResult'];
  writeToolDecisionAuditLog: ExecuteConfirmedToolCallParams['writeToolDecisionAuditLog'];
  markExecutedRequestId: ExecuteConfirmedToolCallParams['markExecutedRequestId'];
}

/**
 * T3-c / idempotency: parent `propose_changes` is marked executed only after the `confirmed` audit row
 * with `executed: true`. See `docs/architecture/ai-chat-tool-confirm-idempotency.md`.
 */
async function finalizeHumanProposeChangesParentConfirmSuccess(
  params: FinalizeHumanProposeChangesParentSuccessParams,
): Promise<void> {
  const {
    assistantMessageId,
    parentCall,
    auditContext,
    locale,
    toolFeedbackStyle,
    childCallsLength,
    execStartMs,
    applyAssistantMessageResult,
    writeToolDecisionAuditLog,
    markExecutedRequestId,
  } = params;
  const successMessage = locale === 'zh-CN'
    ? `已应用 ${childCallsLength} 项变更`
    : `Applied ${childCallsLength} change(s)`;
  const execDurationMs = Math.round(performance.now() - execStartMs);
  await applyAssistantMessageResult(
    assistantMessageId,
    toNaturalToolSuccess(locale, parentCall.name, successMessage, toolFeedbackStyle),
    'done',
  );
  await writeToolDecisionAuditLog(
    assistantMessageId,
    `pending:${parentCall.name}`,
    `confirmed:${parentCall.name}`,
    'human',
    parentCall.requestId,
    buildToolDecisionAuditMetadata(
      assistantMessageId,
      parentCall,
      auditContext,
      'human',
      'confirmed',
      true,
      successMessage,
      undefined,
      execDurationMs,
    ),
  );
  markExecutedRequestId(parentCall.requestId);
}

/**
 * 执行已确认的工具调用（人工确认路径） | Execute confirmed tool call in human-confirmed path
 */
export async function executeConfirmedToolCall({
  assistantMessageId,
  call,
  auditContext,
  locale,
  toolFeedbackStyle,
  hasPersistedExecutionForRequest,
  applyAssistantMessageResult,
  onToolCall,
  writeToolDecisionAuditLog,
  setTaskSession,
  taskSessionId,
  markExecutedRequestId,
  sessionMemory,
  updateSessionMemory,
  persistSessionMemory,
  bumpMetric,
}: ExecuteConfirmedToolCallParams): Promise<void> {
  if (await hasPersistedExecutionForRequest(call.requestId)) {
    await applyAssistantMessageResult(
      assistantMessageId,
      toNaturalToolFailure(locale, call.name, formatDuplicateRequestIgnoredDetail(), toolFeedbackStyle),
      'error',
      formatDuplicateRequestIgnoredError(),
    );
    await writeToolDecisionAuditLog(
      assistantMessageId,
      `pending:${call.name}`,
      `confirm_failed:${call.name}:duplicate_requestId`,
      'human',
      call.requestId,
      buildToolDecisionAuditMetadata(
        assistantMessageId,
        call,
        auditContext,
        'human',
        'confirm_failed',
        false,
        formatDuplicateRequestIgnoredError(),
        'duplicate_requestId',
      ),
    );
    setTaskSession({
      id: taskSessionId,
      status: 'idle',
      updatedAt: nowIso(),
    });
    return;
  }

  const dryRun = dryRunToolCallForConfirm(call);
  if (!dryRun.ok) {
    const invalidArgsText = formatInvalidArgsError(dryRun.message);
    await applyAssistantMessageResult(
      assistantMessageId,
      toNaturalToolFailure(locale, call.name, invalidArgsText, toolFeedbackStyle),
      'error',
      invalidArgsText,
    );
    await writeToolDecisionAuditLog(
      assistantMessageId,
      `pending:${call.name}`,
      `confirm_failed:${call.name}:invalid_args`,
      'human',
      call.requestId,
      buildToolDecisionAuditMetadata(
        assistantMessageId,
        call,
        auditContext,
        'human',
        'confirm_failed',
        false,
        invalidArgsText,
        'invalid_args',
      ),
    );
    setTaskSession({
      id: taskSessionId,
      status: 'idle',
      updatedAt: nowIso(),
    });
    return;
  }

  const blockedByDirective = sessionMemory.toolPreferences?.autoExecute === 'never'
    || (sessionMemory.safetyPreferences?.denyDestructive === true && isDestructiveToolCall(call.name));
  if (blockedByDirective) {
    const reason = sessionMemory.toolPreferences?.autoExecute === 'never'
      ? 'user_directive_never_execute'
      : 'user_directive_deny_destructive';
    const message = reason === 'user_directive_never_execute'
      ? 'Blocked by user directive: do not execute tools.'
      : 'Blocked by user directive: destructive actions are disabled.';
    await applyAssistantMessageResult(
      assistantMessageId,
      toNaturalToolFailure(locale, call.name, message, toolFeedbackStyle),
      'error',
      message,
    );
    await writeToolDecisionAuditLog(
      assistantMessageId,
      `pending:${call.name}`,
      `confirm_failed:${call.name}:${reason}`,
      'system',
      call.requestId,
      buildToolDecisionAuditMetadata(
        assistantMessageId,
        call,
        auditContext,
        'system',
        'confirm_failed',
        false,
        message,
        reason,
      ),
    );
    setTaskSession({
      id: taskSessionId,
      status: 'idle',
      updatedAt: nowIso(),
    });
    return;
  }

  if (!onToolCall) {
    const noExecutorMessage = formatNoExecutorInternalError();
    await applyAssistantMessageResult(
      assistantMessageId,
      toNaturalToolFailure(locale, call.name, formatNoExecutorToolFailureDetail(), toolFeedbackStyle),
      'error',
      noExecutorMessage,
    );
    await writeToolDecisionAuditLog(
      assistantMessageId,
      `pending:${call.name}`,
      `confirm_failed:${call.name}:no_executor`,
      'human',
      call.requestId,
      buildToolDecisionAuditMetadata(
        assistantMessageId,
        call,
        auditContext,
        'human',
        'confirm_failed',
        false,
        noExecutorMessage,
        'no_executor',
      ),
    );
    setTaskSession({
      id: taskSessionId,
      status: 'idle',
      updatedAt: nowIso(),
    });
    return;
  }

  const TOOL_EXEC_TIMEOUT_MS = 30_000;
  const execStart = performance.now();
  let lastThrow: unknown;
  for (let attempt = 0; ; attempt += 1) {
    try {
      const result = await raceWithTimeout(onToolCall(call), TOOL_EXEC_TIMEOUT_MS);
      const execDurationMs = Math.round(performance.now() - execStart);

      if (result.ok) {
        bumpMetric('successCount');
        const nextSessionMemory = buildPostExecSessionMemory({
          sessionMemory,
          toolName: call.name,
          language: typeof call.arguments.language === 'string' ? call.arguments.language : undefined,
          layerId: undefined,
        });
        updateSessionMemory(nextSessionMemory);
        persistSessionMemory(nextSessionMemory);
      } else {
        bumpMetric('failureCount');
      }

      await finalizeHumanToolCallConfirmOutcome({
        assistantMessageId,
        call,
        auditContext,
        locale,
        toolFeedbackStyle,
        ok: result.ok,
        message: result.message,
        execDurationMs,
        applyAssistantMessageResult,
        writeToolDecisionAuditLog,
        markExecutedRequestId,
      });

      setTaskSession({
        id: taskSessionId,
        status: 'idle',
        updatedAt: nowIso(),
      });
      return;
    } catch (error) {
      lastThrow = error;
      const mayRetry = shouldRetryToolCallExecutorThrow({
        enabled: featureFlags.aiToolCallExecutorAutoRetryEnabled,
        attemptIndex: attempt,
        toolName: call.name,
        isDestructive: (name) => isDestructiveToolCall(name as (typeof call)['name']),
      });
      if (mayRetry) {
        continue;
      }
      const execDurationMsErr = Math.round(performance.now() - execStart);
      const toolErrorText = lastThrow instanceof Error
        ? lastThrow.message
        : formatToolExecutionFallbackError();
      await applyAssistantMessageResult(
        assistantMessageId,
        toNaturalToolFailure(locale, call.name, toolErrorText, toolFeedbackStyle),
        'error',
        toolErrorText,
      );
      await writeToolDecisionAuditLog(
        assistantMessageId,
        `pending:${call.name}`,
        `confirm_failed:${call.name}:exception`,
        'human',
        call.requestId,
        buildToolDecisionAuditMetadata(
          assistantMessageId,
          call,
          auditContext,
          'human',
          'confirm_failed',
          false,
          toolErrorText,
          'exception',
          execDurationMsErr,
        ),
      );
      setTaskSession({
        id: taskSessionId,
        status: 'idle',
        updatedAt: nowIso(),
      });
      return;
    }
  }
}

/**
 * Confirm path for `propose_changes`: run validated child tool calls in order with one assistant summary.
 */
function buildProposeChangesFailureDetail(
  locale: Locale,
  failedChildName: string,
  reasonDetail: string,
  appliedChildCount: number,
  totalChildCount: number,
): string {
  const progress = locale === 'zh-CN'
    ? `已执行 ${appliedChildCount}/${totalChildCount} 项`
    : `applied ${appliedChildCount}/${totalChildCount} change(s)`;
  if (locale === 'zh-CN') {
    return `propose_changes 在子步骤 ${failedChildName} 失败：${reasonDetail}（${progress}）`;
  }
  return `propose_changes failed at child step ${failedChildName}: ${reasonDetail} (${progress})`;
}

async function runProposeChangeRollbacks(
  rollbacks: ReadonlyArray<() => Promise<void>>,
): Promise<{ attempted: boolean; ok: boolean; errors: string[] }> {
  if (rollbacks.length === 0) {
    return { attempted: false, ok: true, errors: [] };
  }
  const errors: string[] = [];
  for (let i = rollbacks.length - 1; i >= 0; i -= 1) {
    try {
      await rollbacks[i]!();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { attempted: true, ok: errors.length === 0, errors };
}

function appendProposeRollbackStatus(
  locale: Locale,
  detail: string,
  rb: { attempted: boolean; ok: boolean; errors: readonly string[] },
): string {
  if (!rb.attempted) {
    return locale === 'zh-CN' ? `${detail}（无可自动回滚快照）` : `${detail} (no rollback snapshot available)`;
  }
  if (rb.ok) {
    return locale === 'zh-CN' ? `${detail}（已回滚已应用的修改）` : `${detail} (rolled back applied changes)`;
  }
  const joined = rb.errors.join('; ');
  return locale === 'zh-CN' ? `${detail}（回滚失败：${joined}）` : `${detail} (rollback failed: ${joined})`;
}

function buildProposeChangesExecutionProgress(
  appliedChildCount: number,
  totalChildCount: number,
): {
  appliedCount: number;
  totalCount: number;
  partial: boolean;
} {
  return {
    appliedCount: Math.max(0, appliedChildCount),
    totalCount: Math.max(0, totalChildCount),
    partial: appliedChildCount > 0 && appliedChildCount < totalChildCount,
  };
}

export async function executeConfirmedProposedChangeBatch({
  assistantMessageId,
  parentCall,
  childCalls,
  auditContext,
  locale,
  toolFeedbackStyle,
  hasPersistedExecutionForRequest,
  applyAssistantMessageResult,
  onToolCall,
  writeToolDecisionAuditLog,
  setTaskSession,
  taskSessionId,
  markExecutedRequestId,
  sessionMemory,
  updateSessionMemory,
  persistSessionMemory,
  bumpMetric,
}: {
  assistantMessageId: string;
  parentCall: AiChatToolCall & { requestId: string };
  childCalls: readonly AiChatToolCall[];
  auditContext: Parameters<typeof buildToolDecisionAuditMetadata>[2];
  locale: Locale;
  toolFeedbackStyle: AiToolFeedbackStyle;
  hasPersistedExecutionForRequest: (requestId: string) => Promise<boolean>;
  applyAssistantMessageResult: (
    id: string,
    content: string,
    status?: 'done' | 'error',
    error?: string,
  ) => Promise<void>;
  onToolCall?: ((call: AiChatToolCall) => Promise<AiChatToolResult> | AiChatToolResult) | null | undefined;
  writeToolDecisionAuditLog: (
    assistantMessageId: string,
    oldValue: string,
    newValue: string,
    source: 'human' | 'ai' | 'system',
    requestId?: string,
    metadata?: ReturnType<typeof buildToolDecisionAuditMetadata>,
  ) => Promise<void>;
  setTaskSession: (value: AiTaskSession) => void;
  taskSessionId: string;
  markExecutedRequestId: (requestId: string) => void;
  sessionMemory: AiSessionMemory;
  updateSessionMemory: (nextMemory: AiSessionMemory) => void;
  persistSessionMemory: (memory: AiSessionMemory) => void;
  bumpMetric: (key: keyof AiInteractionMetrics) => void;
}): Promise<void> {
  const finishIdle = () => {
    setTaskSession({
      id: taskSessionId,
      status: 'idle',
      updatedAt: nowIso(),
    });
  };

  if (childCalls.length === 0) {
    const emptyMessage = locale === 'zh-CN' ? '变更列表为空' : 'Proposed changes list is empty';
    bumpMetric('failureCount');
    await applyAssistantMessageResult(
      assistantMessageId,
      toNaturalToolFailure(locale, parentCall.name, emptyMessage, toolFeedbackStyle),
      'error',
      emptyMessage,
    );
    finishIdle();
    return;
  }

  if (await hasPersistedExecutionForRequest(parentCall.requestId)) {
    await applyAssistantMessageResult(
      assistantMessageId,
      toNaturalToolFailure(locale, parentCall.name, formatDuplicateRequestIgnoredDetail(), toolFeedbackStyle),
      'error',
      formatDuplicateRequestIgnoredError(),
    );
    await writeToolDecisionAuditLog(
      assistantMessageId,
      `pending:${parentCall.name}`,
      `confirm_failed:${parentCall.name}:duplicate_requestId`,
      'human',
      parentCall.requestId,
      buildToolDecisionAuditMetadata(
        assistantMessageId,
        parentCall,
        auditContext,
        'human',
        'confirm_failed',
        false,
        formatDuplicateRequestIgnoredError(),
        'duplicate_requestId',
      ),
    );
    finishIdle();
    return;
  }

  const blockedByDirective = sessionMemory.toolPreferences?.autoExecute === 'never'
    || (sessionMemory.safetyPreferences?.denyBatch === true && childCalls.length > 1)
    || (sessionMemory.safetyPreferences?.denyDestructive === true && childCalls.some((call) => isDestructiveToolCall(call.name)));
  if (blockedByDirective) {
    const reason = sessionMemory.toolPreferences?.autoExecute === 'never'
      ? 'user_directive_never_execute'
      : sessionMemory.safetyPreferences?.denyBatch === true && childCalls.length > 1
        ? 'user_directive_deny_batch'
        : 'user_directive_deny_destructive';
    const message = reason === 'user_directive_never_execute'
      ? 'Blocked by user directive: do not execute tools.'
      : reason === 'user_directive_deny_batch'
        ? 'Blocked by user directive: batch actions are disabled.'
        : 'Blocked by user directive: destructive actions are disabled.';
    bumpMetric('failureCount');
    await applyAssistantMessageResult(
      assistantMessageId,
      toNaturalToolFailure(locale, parentCall.name, message, toolFeedbackStyle),
      'error',
      message,
    );
    await writeToolDecisionAuditLog(
      assistantMessageId,
      `pending:${parentCall.name}`,
      `confirm_failed:${parentCall.name}:${reason}`,
      'system',
      parentCall.requestId,
      buildToolDecisionAuditMetadata(
        assistantMessageId,
        parentCall,
        auditContext,
        'system',
        'confirm_failed',
        false,
        message,
        reason,
      ),
    );
    finishIdle();
    return;
  }

  if (!onToolCall) {
    const noExecutorMessage = formatNoExecutorInternalError();
    await applyAssistantMessageResult(
      assistantMessageId,
      toNaturalToolFailure(locale, parentCall.name, formatNoExecutorToolFailureDetail(), toolFeedbackStyle),
      'error',
      noExecutorMessage,
    );
    await writeToolDecisionAuditLog(
      assistantMessageId,
      `pending:${parentCall.name}`,
      `confirm_failed:${parentCall.name}:no_executor`,
      'human',
      parentCall.requestId,
      buildToolDecisionAuditMetadata(
        assistantMessageId,
        parentCall,
        auditContext,
        'human',
        'confirm_failed',
        false,
        noExecutorMessage,
        'no_executor',
      ),
    );
    finishIdle();
    return;
  }

  const TOOL_EXEC_TIMEOUT_MS = 30_000;
  const execStart = performance.now();
  const rollbacks: Array<() => Promise<void>> = [];

  let appliedChildCount = 0;
  let currentChildName = parentCall.name;
  try {
    let lastOkChildName = parentCall.name;

    for (let i = 0; i < childCalls.length; i += 1) {
      const child = childCalls[i]!;
      currentChildName = child.name;
      const childDryRun = dryRunToolCallForConfirm(child);
      if (!childDryRun.ok) {
        const invalidArgsText = formatInvalidArgsError(childDryRun.message);
        const rb = await runProposeChangeRollbacks(rollbacks);
        const detail = appendProposeRollbackStatus(
          locale,
          buildProposeChangesFailureDetail(
            locale,
            child.name,
            invalidArgsText,
            appliedChildCount,
            childCalls.length,
          ),
          rb,
        );
        bumpMetric('failureCount');
        await applyAssistantMessageResult(
          assistantMessageId,
          toNaturalToolFailure(locale, parentCall.name, detail, toolFeedbackStyle),
          'error',
          detail,
        );
        await writeToolDecisionAuditLog(
          assistantMessageId,
          `pending:${parentCall.name}`,
          `confirm_failed:${parentCall.name}:invalid_child_args`,
          'human',
          parentCall.requestId,
          buildToolDecisionAuditMetadata(
            assistantMessageId,
            parentCall,
            auditContext,
            'human',
            'confirm_failed',
            false,
            detail,
            'invalid_child_args',
            Math.round(performance.now() - execStart),
            buildProposeChangesExecutionProgress(appliedChildCount, childCalls.length),
            {
              attempted: rb.attempted,
              ok: rb.ok,
              errorCount: rb.errors.length,
            },
          ),
        );
        finishIdle();
        return;
      }

      const childWithRequestId: AiChatToolCall & { requestId: string } = {
        ...child,
        requestId: genRequestId(child, `${assistantMessageId}:propose:${i}`),
      };

      const result = await raceWithTimeout(onToolCall(childWithRequestId), TOOL_EXEC_TIMEOUT_MS);

      if (!result.ok) {
        const rb = await runProposeChangeRollbacks(rollbacks);
        const detail = appendProposeRollbackStatus(
          locale,
          buildProposeChangesFailureDetail(
            locale,
            child.name,
            result.message,
            appliedChildCount,
            childCalls.length,
          ),
          rb,
        );
        bumpMetric('failureCount');
        await applyAssistantMessageResult(
          assistantMessageId,
          toNaturalToolFailure(locale, parentCall.name, detail, toolFeedbackStyle),
          'error',
          detail,
        );
        await writeToolDecisionAuditLog(
          assistantMessageId,
          `pending:${parentCall.name}`,
          `confirm_failed:${parentCall.name}:child_failed`,
          'human',
          parentCall.requestId,
          buildToolDecisionAuditMetadata(
            assistantMessageId,
            parentCall,
            auditContext,
            'human',
            'confirm_failed',
            false,
            detail,
            'child_failed',
            Math.round(performance.now() - execStart),
            buildProposeChangesExecutionProgress(appliedChildCount, childCalls.length),
            {
              attempted: rb.attempted,
              ok: rb.ok,
              errorCount: rb.errors.length,
            },
          ),
        );
        finishIdle();
        return;
      }

      if (typeof result.rollback === 'function') {
        rollbacks.push(result.rollback);
      }
      lastOkChildName = child.name;
      appliedChildCount += 1;
    }

    bumpMetric('successCount');
    const nextSessionMemory = buildPostExecSessionMemory({
      sessionMemory,
      toolName: lastOkChildName,
      language: undefined,
      layerId: undefined,
    });
    updateSessionMemory(nextSessionMemory);
    persistSessionMemory(nextSessionMemory);

    await finalizeHumanProposeChangesParentConfirmSuccess({
      assistantMessageId,
      parentCall,
      auditContext,
      locale,
      toolFeedbackStyle,
      childCallsLength: childCalls.length,
      execStartMs: execStart,
      applyAssistantMessageResult,
      writeToolDecisionAuditLog,
      markExecutedRequestId,
    });

    finishIdle();
  } catch (error) {
    const execDurationMsErr = Math.round(performance.now() - execStart);
    const toolErrorText = error instanceof Error ? error.message : formatToolExecutionFallbackError();
    const rb = await runProposeChangeRollbacks(rollbacks);
    const detail = appendProposeRollbackStatus(
      locale,
      buildProposeChangesFailureDetail(
        locale,
        currentChildName,
        toolErrorText,
        appliedChildCount,
        childCalls.length,
      ),
      rb,
    );
    bumpMetric('failureCount');
    await applyAssistantMessageResult(
      assistantMessageId,
      toNaturalToolFailure(locale, parentCall.name, detail, toolFeedbackStyle),
      'error',
      detail,
    );
    await writeToolDecisionAuditLog(
      assistantMessageId,
      `pending:${parentCall.name}`,
      `confirm_failed:${parentCall.name}:exception`,
      'human',
      parentCall.requestId,
      buildToolDecisionAuditMetadata(
        assistantMessageId,
        parentCall,
        auditContext,
        'human',
        'confirm_failed',
        false,
        detail,
        'exception',
        execDurationMsErr,
        buildProposeChangesExecutionProgress(appliedChildCount, childCalls.length),
        {
          attempted: rb.attempted,
          ok: rb.ok,
          errorCount: rb.errors.length,
        },
      ),
    );
    finishIdle();
  }
}
