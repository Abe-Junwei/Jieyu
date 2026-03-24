import {
  buildToolDecisionAuditMetadata,
  toNaturalToolFailure,
  toNaturalToolSuccess,
} from '../ai/chat/toolCallHelpers';
import {
  formatNoExecutorInternalError,
  formatNoExecutorToolFailureDetail,
  formatToolExecutionFallbackError,
} from '../ai/messages';
import type { AiToolFeedbackStyle } from '../ai/providers/providerCatalog';
import type {
  AiChatToolCall,
  AiChatToolResult,
  AiInteractionMetrics,
  AiSessionMemory,
  AiTaskSession,
} from './useAiChat';
import { nowIso } from './useAiChat.helpers';

interface ExecuteAutoToolCallParams {
  assistantMessageId: string;
  toolCall: AiChatToolCall;
  auditContext: Parameters<typeof buildToolDecisionAuditMetadata>[2];
  toolFeedbackStyle: AiToolFeedbackStyle;
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
  sessionMemory: AiSessionMemory;
  updateSessionMemory: (nextMemory: AiSessionMemory) => void;
  persistSessionMemory: (memory: AiSessionMemory) => void;
  markExecutedRequestId: (requestId: string) => void;
  bumpMetric: (key: keyof AiInteractionMetrics) => void;
  shouldBumpRecovery: boolean;
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
}: ExecuteAutoToolCallParams): Promise<ExecuteAutoToolCallResult> {
  if (!onToolCall) {
    const finalErrorMessage = formatNoExecutorInternalError();
    const finalContent = toNaturalToolFailure(toolCall.name, formatNoExecutorToolFailureDetail(), toolFeedbackStyle);
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
    if (toolCall.requestId) {
      markExecutedRequestId(toolCall.requestId);
    }
    const result = await onToolCall(toolCall);
    const autoExecDurationMs = Math.round(performance.now() - autoExecStart);
    const finalContent = result.ok
      ? toNaturalToolSuccess(toolCall.name, result.message, toolFeedbackStyle)
      : toNaturalToolFailure(toolCall.name, result.message, toolFeedbackStyle);

    if (result.ok) {
      bumpMetric('successCount');
      const nextSessionMemory: AiSessionMemory = {
        ...sessionMemory,
        lastToolName: toolCall.name,
      };
      const lang = typeof toolCall.arguments.language === 'string' ? toolCall.arguments.language : undefined;
      if (lang) nextSessionMemory.lastLanguage = lang;
      const layerId = typeof toolCall.arguments.layerId === 'string' ? toolCall.arguments.layerId : undefined;
      if (layerId) nextSessionMemory.lastLayerId = layerId;
      updateSessionMemory(nextSessionMemory);
      persistSessionMemory(nextSessionMemory);
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
        true,
        result.message,
        undefined,
        autoExecDurationMs,
      ),
    );

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
    const toolErrorText = error instanceof Error ? error.message : formatToolExecutionFallbackError();
    const finalContent = toNaturalToolFailure(toolCall.name, toolErrorText, toolFeedbackStyle);

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
        true,
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
