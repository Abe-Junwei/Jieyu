import {
  buildToolDecisionAuditMetadata,
  toNaturalToolFailure,
  toNaturalToolSuccess,
} from '../../ai/chat/toolCallHelpers';
import {
  formatNoExecutorInternalError,
  formatNoExecutorToolFailureDetail,
  formatToolExecutionFallbackError,
} from '../../ai/messages';
import { runWithToolCallbacks } from '../../ai/runtime/agentCallbacks';
import { commitToolEffects } from '../../ai/runtime/commitToolEffects';
import type { AiToolFeedbackStyle } from '../../ai/providers/providerCatalog';
import type { Locale } from '../../i18n';
import type {
  AiChatToolCall,
  AiChatToolResult,
  AiInteractionMetrics,
  AiSessionMemory,
  AiTaskSession,
} from './useAiChat.types';
import { nowIso } from './useAiChat.helpers';

interface ExecuteAutoToolCallParams {
  assistantMessageId: string;
  toolCall: AiChatToolCall;
  auditContext: Parameters<typeof buildToolDecisionAuditMetadata>[2];
  locale: Locale;
  toolFeedbackStyle: AiToolFeedbackStyle;
  onToolCall?:
    | ((call: AiChatToolCall) => Promise<AiChatToolResult> | AiChatToolResult)
    | null
    | undefined;
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
  sessionMemory: AiSessionMemory;
  updateSessionMemory: (nextMemory: AiSessionMemory) => void;
  persistSessionMemory: (memory: AiSessionMemory) => void;
  markExecutedRequestId: (requestId: string) => void;
  bumpMetric: (key: keyof AiInteractionMetrics) => void;
  shouldBumpRecovery: boolean;
  shouldApplyTurnSideEffects?: () => boolean;
}

interface ExecuteAutoToolCallResult {
  finalContent: string;
  finalStatus: 'done' | 'error';
  finalErrorMessage?: string;
}

/**
 * 自动执行工具调用（含审计、指标、记忆） | Execute auto tool call with audit/metrics/memory updates
 */
export async function executeAutoToolCall({
  assistantMessageId,
  toolCall,
  auditContext,
  locale,
  toolFeedbackStyle,
  onToolCall,
  writeToolDecisionAuditLog,
  setTaskSession,
  taskSessionId,
  sessionMemory,
  updateSessionMemory,
  persistSessionMemory,
  markExecutedRequestId,
  bumpMetric,
  shouldBumpRecovery,
  shouldApplyTurnSideEffects,
}: ExecuteAutoToolCallParams): Promise<ExecuteAutoToolCallResult> {
  if (shouldApplyTurnSideEffects && !shouldApplyTurnSideEffects()) {
    setTaskSession({
      id: taskSessionId,
      status: 'idle',
      updatedAt: nowIso(),
    });
    return {
      finalContent: toNaturalToolFailure(
        locale,
        toolCall.name,
        formatToolExecutionFallbackError(locale),
        toolFeedbackStyle,
      ),
      finalStatus: 'error',
      finalErrorMessage: 'turn_superseded',
    };
  }

  if (!onToolCall) {
    const finalErrorMessage = formatNoExecutorInternalError(locale);
    const finalContent = toNaturalToolFailure(
      locale,
      toolCall.name,
      formatNoExecutorToolFailureDetail(locale),
      toolFeedbackStyle,
    );
    await writeToolDecisionAuditLog(
      assistantMessageId,
      `auto:${toolCall.name}`,
      `auto_failed:${toolCall.name}:no_executor`,
      'ai',
      toolCall.requestId,
      buildToolDecisionAuditMetadata(
        assistantMessageId,
        toolCall,
        auditContext,
        'ai',
        'auto_failed',
        false,
        finalErrorMessage,
        'no_executor',
      ),
    );
    return {
      finalContent,
      finalStatus: 'error',
      finalErrorMessage,
    };
  }

  const autoExecStart = performance.now();
  try {
    setTaskSession({
      id: taskSessionId,
      status: 'executing',
      toolName: toolCall.name,
      updatedAt: nowIso(),
    });
    const result = await runWithToolCallbacks(
      toolCall.name,
      () => Promise.resolve(onToolCall(toolCall)),
      {
        ...(auditContext.agentRunId ? { agentRunId: auditContext.agentRunId } : {}),
        resultOk: (item) => item.ok,
      },
    );
    const autoExecDurationMs = Math.round(performance.now() - autoExecStart);

    if (shouldApplyTurnSideEffects && !shouldApplyTurnSideEffects()) {
      setTaskSession({
        id: taskSessionId,
        status: 'idle',
        updatedAt: nowIso(),
      });
      return {
        finalContent: toNaturalToolFailure(
          locale,
          toolCall.name,
          formatToolExecutionFallbackError(locale),
          toolFeedbackStyle,
        ),
        finalStatus: 'error',
        finalErrorMessage: 'turn_superseded',
      };
    }

    const finalContent = result.ok
      ? toNaturalToolSuccess(locale, toolCall.name, result.message, toolFeedbackStyle)
      : toNaturalToolFailure(locale, toolCall.name, result.message, toolFeedbackStyle);

    if (result.ok) {
      bumpMetric('successCount');
      commitToolEffects(
        { sessionMemory, updateSessionMemory, persistSessionMemory },
        {
          kind: 'chat_tool',
          toolName: toolCall.name,
          ...(typeof toolCall.arguments.language === 'string'
            ? { language: toolCall.arguments.language }
            : {}),
          ...(typeof toolCall.arguments.layerId === 'string'
            ? { layerId: toolCall.arguments.layerId }
            : {}),
        },
      );
      if (shouldBumpRecovery) {
        bumpMetric('recoveryCount');
      }
    } else {
      bumpMetric('failureCount');
    }

    await writeToolDecisionAuditLog(
      assistantMessageId,
      `auto:${toolCall.name}`,
      `${result.ok ? 'auto_confirmed' : 'auto_failed'}:${toolCall.name}`,
      'ai',
      toolCall.requestId,
      buildToolDecisionAuditMetadata(
        assistantMessageId,
        toolCall,
        auditContext,
        'ai',
        result.ok ? 'auto_confirmed' : 'auto_failed',
        result.ok,
        result.message,
        undefined,
        autoExecDurationMs,
      ),
    );

    if (result.ok && toolCall.requestId) {
      markExecutedRequestId(toolCall.requestId);
    }

    setTaskSession({
      id: taskSessionId,
      status: 'idle',
      updatedAt: nowIso(),
    });

    return result.ok
      ? { finalContent, finalStatus: 'done' }
      : { finalContent, finalStatus: 'error', finalErrorMessage: result.message };
  } catch (error) {
    const autoExecDurationMsErr = Math.round(performance.now() - autoExecStart);
    const toolErrorText =
      error instanceof Error ? error.message : formatToolExecutionFallbackError(locale);
    const finalContent = toNaturalToolFailure(
      locale,
      toolCall.name,
      toolErrorText,
      toolFeedbackStyle,
    );

    await writeToolDecisionAuditLog(
      assistantMessageId,
      `auto:${toolCall.name}`,
      `auto_failed:${toolCall.name}:exception`,
      'ai',
      toolCall.requestId,
      buildToolDecisionAuditMetadata(
        assistantMessageId,
        toolCall,
        auditContext,
        'ai',
        'auto_failed',
        false,
        toolErrorText,
        'exception',
        autoExecDurationMsErr,
      ),
    );

    setTaskSession({
      id: taskSessionId,
      status: 'idle',
      updatedAt: nowIso(),
    });

    return {
      finalContent,
      finalStatus: 'error',
      finalErrorMessage: toolErrorText,
    };
  }
}
