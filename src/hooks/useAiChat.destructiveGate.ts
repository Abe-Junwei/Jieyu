import { nowIso } from './useAiChat.helpers';
import {
  buildToolDecisionAuditMetadata,
  describeAndBuildPending,
  isAmbiguousTargetRiskSummary,
  isDestructiveToolCall,
  toNaturalToolFailure,
  toNaturalToolPending,
} from '../ai/chat/toolCallHelpers';
import type { AiToolFeedbackStyle } from '../ai/providers/providerCatalog';
import type { Locale } from '../i18n';
import type { AiChatToolCall, AiTaskSession, AiToolRiskCheckResult, PendingAiToolCall } from './useAiChat';

interface ResolveDestructiveGateParams {
  assistantMessageId: string;
  toolCall: AiChatToolCall;
  auditContext: Parameters<typeof buildToolDecisionAuditMetadata>[2];
  locale: Locale;
  toolFeedbackStyle: AiToolFeedbackStyle;
  allowDestructiveToolCalls: boolean;
  onToolRiskCheck?: ((call: AiChatToolCall) => Promise<AiToolRiskCheckResult | null | undefined> | AiToolRiskCheckResult | null | undefined) | null | undefined;
  writeToolDecisionAuditLog: (
    assistantMessageId: string,
    oldValue: string,
    newValue: string,
    source: 'human' | 'ai' | 'system',
    requestId?: string,
    metadata?: ReturnType<typeof buildToolDecisionAuditMetadata>,
  ) => Promise<void>;
  setTaskSession: (value: AiTaskSession) => void;
  setPendingToolCall: (value: PendingAiToolCall) => void;
  taskSessionId: string;
  bumpFailureMetric: () => void;
}

export type DestructiveGateOutcome =
  | { kind: 'proceed' }
  | { kind: 'error'; finalContent: string; finalErrorMessage: string }
  | { kind: 'pending'; finalContent: string };

/**
 * 处理高风险工具门控（歧义目标/待确认） | Handle destructive tool gate (ambiguous target / pending confirmation)
 */
export async function resolveDestructiveGate({
  assistantMessageId,
  toolCall,
  auditContext,
  locale,
  toolFeedbackStyle,
  allowDestructiveToolCalls,
  onToolRiskCheck,
  writeToolDecisionAuditLog,
  setTaskSession,
  setPendingToolCall,
  taskSessionId,
  bumpFailureMetric,
}: ResolveDestructiveGateParams): Promise<DestructiveGateOutcome> {
  const destructiveBlocked = !allowDestructiveToolCalls && isDestructiveToolCall(toolCall.name);
  let riskCheck: AiToolRiskCheckResult | null | undefined;

  if (destructiveBlocked && onToolRiskCheck) {
    riskCheck = await onToolRiskCheck(toolCall);
  }

  if (destructiveBlocked && riskCheck?.riskSummary && isAmbiguousTargetRiskSummary(riskCheck.riskSummary)) {
    const finalErrorMessage = riskCheck.riskSummary;
    const finalContent = toNaturalToolFailure(locale, toolCall.name, finalErrorMessage, toolFeedbackStyle);
    bumpFailureMetric();
    setTaskSession({
      id: taskSessionId,
      status: 'waiting_clarify',
      toolName: toolCall.name,
      clarifyReason: 'missing-layer-target',
      candidates: [],
      updatedAt: nowIso(),
    });
    await writeToolDecisionAuditLog(
      assistantMessageId,
      `auto:${toolCall.name}`,
      `auto_failed:${toolCall.name}:ambiguous_target`,
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
        'ambiguous_target',
      ),
    );

    return { kind: 'error', finalContent, finalErrorMessage };
  }

  const shouldRequireConfirmation = destructiveBlocked && (riskCheck?.requiresConfirmation ?? true);
  if (shouldRequireConfirmation) {
    const impact = describeAndBuildPending(toolCall);
    const finalContent = toNaturalToolPending(locale, toolCall.name, toolFeedbackStyle);
    setTaskSession({
      id: taskSessionId,
      status: 'waiting_confirm',
      toolName: toolCall.name,
      updatedAt: nowIso(),
    });
    setPendingToolCall({
      call: toolCall,
      assistantMessageId,
      riskSummary: riskCheck?.riskSummary ?? impact.riskSummary,
      impactPreview: riskCheck?.impactPreview ?? impact.impactPreview,
      previewContract: impact.previewContract,
      ...(toolCall.requestId ? { requestId: toolCall.requestId } : {}),
      auditContext,
    });

    return { kind: 'pending', finalContent };
  }

  return { kind: 'proceed' };
}
