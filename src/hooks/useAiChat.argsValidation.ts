import {
  buildToolDecisionAuditMetadata,
  toNaturalToolFailure,
} from '../ai/chat/toolCallHelpers';
import { formatInvalidArgsError } from '../ai/messages';
import type { AiToolFeedbackStyle } from '../ai/providers/providerCatalog';
import type { Locale } from '../i18n';
import type { AiChatToolCall } from './useAiChat';

interface HandleInvalidToolArgumentsParams {
  assistantMessageId: string;
  toolCall: AiChatToolCall;
  argsValidationError: string;
  locale: Locale;
  toolFeedbackStyle: AiToolFeedbackStyle;
  source: 'human' | 'ai' | 'system';
  decision: 'confirm_failed' | 'auto_failed' | 'gray_failed';
  auditContext: Parameters<typeof buildToolDecisionAuditMetadata>[2];
  writeToolDecisionAuditLog: (
    assistantMessageId: string,
    oldValue: string,
    newValue: string,
    source: 'human' | 'ai' | 'system',
    requestId?: string,
    metadata?: ReturnType<typeof buildToolDecisionAuditMetadata>,
  ) => Promise<void>;
}

/**
 * 统一处理参数校验失败与审计写入 | Unified invalid-args handling and audit logging
 */
export async function handleInvalidToolArguments({
  assistantMessageId,
  toolCall,
  argsValidationError,
  locale,
  toolFeedbackStyle,
  source,
  decision,
  auditContext,
  writeToolDecisionAuditLog,
}: HandleInvalidToolArgumentsParams): Promise<{ finalContent: string; finalErrorMessage: string }> {
  const finalErrorMessage = formatInvalidArgsError(argsValidationError);
  const finalContent = toNaturalToolFailure(locale, toolCall.name, finalErrorMessage, toolFeedbackStyle);

  await writeToolDecisionAuditLog(
    assistantMessageId,
    `auto:${toolCall.name}`,
    `${decision}:${toolCall.name}:invalid_args`,
    source,
    toolCall.requestId,
    buildToolDecisionAuditMetadata(
      assistantMessageId,
      toolCall,
      auditContext,
      source,
      decision,
      false,
      finalErrorMessage,
      'invalid_args',
    ),
  );

  return {
    finalContent,
    finalErrorMessage,
  };
}
