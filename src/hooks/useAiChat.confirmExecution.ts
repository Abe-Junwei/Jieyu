import { buildToolDecisionAuditMetadata, isDestructiveToolCall, toNaturalToolFailure, toNaturalToolSuccess, validateToolCallArguments } from '../ai/chat/toolCallHelpers';
import { formatDuplicateRequestIgnoredDetail, formatDuplicateRequestIgnoredError, formatInvalidArgsError, formatNoExecutorInternalError, formatNoExecutorToolFailureDetail, formatToolExecutionFallbackError } from '../ai/messages';
import { buildPostExecSessionMemory } from './useAiChat.postExecSessionPatch';
import { nowIso } from './useAiChat.helpers';
import { genRequestId } from './useAiChat.toolAudit';
import type { Locale } from '../i18n';
import type { AiChatToolCall, AiChatToolResult, AiInteractionMetrics, AiSessionMemory, AiTaskSession } from './useAiChat';
import type { AiToolFeedbackStyle } from '../ai/providers/providerCatalog';

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

  const argsValidationError = validateToolCallArguments(call);
  if (argsValidationError) {
    const invalidArgsText = formatInvalidArgsError(argsValidationError);
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
  try {
    const result = await Promise.race([
      onToolCall(call),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Tool execution timed out after ${TOOL_EXEC_TIMEOUT_MS}ms`)), TOOL_EXEC_TIMEOUT_MS),
      ),
    ]);
    const execDurationMs = Math.round(performance.now() - execStart);

    if (result.ok) {
      markExecutedRequestId(call.requestId);
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

    await applyAssistantMessageResult(
      assistantMessageId,
      result.ok
        ? toNaturalToolSuccess(locale, call.name, result.message, toolFeedbackStyle)
        : toNaturalToolFailure(locale, call.name, result.message, toolFeedbackStyle),
      result.ok ? 'done' : 'error',
      result.ok ? undefined : result.message,
    );

    await writeToolDecisionAuditLog(
      assistantMessageId,
      `pending:${call.name}`,
      `${result.ok ? 'confirmed' : 'confirm_failed'}:${call.name}`,
      'human',
      call.requestId,
      buildToolDecisionAuditMetadata(
        assistantMessageId,
        call,
        auditContext,
        'human',
        result.ok ? 'confirmed' : 'confirm_failed',
        result.ok,
        result.message,
        undefined,
        execDurationMs,
      ),
    );

    setTaskSession({
      id: taskSessionId,
      status: 'idle',
      updatedAt: nowIso(),
    });
  } catch (error) {
    const execDurationMsErr = Math.round(performance.now() - execStart);
    const toolErrorText = error instanceof Error ? error.message : formatToolExecutionFallbackError();
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
  }
}

/**
 * Confirm path for `propose_changes`: run validated child tool calls in order with one assistant summary.
 */
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

  let appliedChildCount = 0;
  try {
    let lastOkChildName = parentCall.name;

    for (let i = 0; i < childCalls.length; i += 1) {
      const child = childCalls[i]!;
      const argsValidationError = validateToolCallArguments(child);
      if (argsValidationError) {
        const invalidArgsText = formatInvalidArgsError(argsValidationError);
        const detail = `${child.name}: ${invalidArgsText}`;
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
            appliedChildCount > 0,
            detail,
            'invalid_child_args',
            Math.round(performance.now() - execStart),
          ),
        );
        finishIdle();
        return;
      }

      const childWithRequestId: AiChatToolCall & { requestId: string } = {
        ...child,
        requestId: genRequestId(child, `${assistantMessageId}:propose:${i}`),
      };

      const result = await Promise.race([
        onToolCall(childWithRequestId),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Tool execution timed out after ${TOOL_EXEC_TIMEOUT_MS}ms`)), TOOL_EXEC_TIMEOUT_MS),
        ),
      ]);

      if (!result.ok) {
        const detail = `${child.name}: ${result.message}`;
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
            appliedChildCount > 0,
            detail,
            'child_failed',
            Math.round(performance.now() - execStart),
          ),
        );
        finishIdle();
        return;
      }

      lastOkChildName = child.name;
      appliedChildCount += 1;
      markExecutedRequestId(parentCall.requestId);
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

    const successMessage = locale === 'zh-CN'
      ? `已应用 ${childCalls.length} 项变更`
      : `Applied ${childCalls.length} change(s)`;

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
        Math.round(performance.now() - execStart),
      ),
    );

    finishIdle();
  } catch (error) {
    const execDurationMsErr = Math.round(performance.now() - execStart);
    const toolErrorText = error instanceof Error ? error.message : formatToolExecutionFallbackError();
    bumpMetric('failureCount');
    await applyAssistantMessageResult(
      assistantMessageId,
      toNaturalToolFailure(locale, parentCall.name, toolErrorText, toolFeedbackStyle),
      'error',
      toolErrorText,
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
        appliedChildCount > 0,
        toolErrorText,
        'exception',
        execDurationMsErr,
      ),
    );
    finishIdle();
  }
}
