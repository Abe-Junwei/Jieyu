import { nowIso } from './useAiChat.helpers';
import {
  buildPreviewContract,
  buildToolDecisionAuditMetadata,
  describeAndBuildPending,
  isAmbiguousTargetRiskSummary,
  isDestructiveToolCall,
  toNaturalToolFailure,
  toNaturalToolPending,
} from '../ai/chat/toolCallHelpers';
import { parseProposedChildCallsFromArguments } from '../ai/chat/proposeChangesHelpers';
import type { AiToolFeedbackStyle } from '../ai/providers/providerCatalog';
import { t, type Locale } from '../i18n';
import type { AiChatToolCall, AiPromptContext, AiTaskSession, AiToolRiskCheckResult, PendingAiToolCall } from './useAiChat';

function getMaterializedDeleteBatchIds(call?: AiChatToolCall | null): string[] {
  if (!call) return [];
  const collect = (value: unknown): string[] => Array.isArray(value)
    ? value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
    : [];
  return Array.from(new Set([
    ...collect(call.arguments.segmentIds),
    ...collect(call.arguments.utteranceIds),
  ]));
}

function getMaterializedDeleteSingleId(call?: AiChatToolCall | null): string {
  if (!call) return '';
  const segmentId = typeof call.arguments.segmentId === 'string' ? call.arguments.segmentId.trim() : '';
  if (segmentId.length > 0) return segmentId;
  return typeof call.arguments.utteranceId === 'string' ? call.arguments.utteranceId.trim() : '';
}

function hasSemanticDeleteSegmentSelector(call: AiChatToolCall): boolean {
  const segmentIndex = call.arguments.segmentIndex;
  if (typeof segmentIndex === 'number' && Number.isInteger(segmentIndex) && segmentIndex >= 1) {
    return true;
  }
  return typeof call.arguments.segmentPosition === 'string' && call.arguments.segmentPosition.length > 0;
}

function requiresDeleteSegmentMaterialization(call: AiChatToolCall): boolean {
  return call.name === 'delete_transcription_segment'
    && (call.arguments.allSegments === true || hasSemanticDeleteSegmentSelector(call));
}

function hasConcreteDeleteSegmentTarget(call?: AiChatToolCall | null): boolean {
  return getMaterializedDeleteBatchIds(call).length > 0 || getMaterializedDeleteSingleId(call).length > 0;
}

interface ResolveDestructiveGateParams {
  assistantMessageId: string;
  toolCall: AiChatToolCall;
  aiContext: AiPromptContext | null;
  auditContext: Parameters<typeof buildToolDecisionAuditMetadata>[2];
  locale: Locale;
  toolFeedbackStyle: AiToolFeedbackStyle;
  allowDestructiveToolCalls: boolean;
  onToolRiskCheck?: ((call: AiChatToolCall) => Promise<AiToolRiskCheckResult | null | undefined> | AiToolRiskCheckResult | null | undefined) | null | undefined;
  preparePendingToolCall?: ((call: AiChatToolCall) => Promise<AiChatToolCall | null | undefined> | AiChatToolCall | null | undefined) | null | undefined;
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
  aiContext,
  auditContext,
  locale,
  toolFeedbackStyle,
  allowDestructiveToolCalls,
  onToolRiskCheck,
  preparePendingToolCall,
  writeToolDecisionAuditLog,
  setTaskSession,
  setPendingToolCall,
  taskSessionId,
  bumpFailureMetric,
}: ResolveDestructiveGateParams): Promise<DestructiveGateOutcome> {
  if (toolCall.name === 'propose_changes') {
    const parsed = parseProposedChildCallsFromArguments(toolCall.arguments);
    if (!parsed.ok) {
      const finalErrorMessage = parsed.error;
      const finalContent = toNaturalToolFailure(locale, toolCall.name, finalErrorMessage, toolFeedbackStyle);
      bumpFailureMetric();
      setTaskSession({
        id: taskSessionId,
        status: 'idle',
        updatedAt: nowIso(),
      });
      await writeToolDecisionAuditLog(
        assistantMessageId,
        `auto:${toolCall.name}`,
        `auto_failed:${toolCall.name}:invalid_proposed_changes`,
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
          'invalid_proposed_changes',
        ),
      );
      return { kind: 'error', finalContent, finalErrorMessage };
    }

    const impact = describeAndBuildPending(toolCall, aiContext);
    const readModelEpochCaptured = aiContext?.shortTerm?.timelineReadModelEpoch;
    setTaskSession({
      id: taskSessionId,
      status: 'waiting_confirm',
      toolName: toolCall.name,
      updatedAt: nowIso(),
    });
    setPendingToolCall({
      call: toolCall,
      proposedChildCalls: parsed.children,
      assistantMessageId,
      riskSummary: parsed.description && parsed.description.length > 0 ? parsed.description : impact.riskSummary,
      impactPreview: impact.impactPreview,
      previewContract: buildPreviewContract(toolCall, aiContext),
      ...(toolCall.requestId ? { requestId: toolCall.requestId } : {}),
      auditContext,
      ...(readModelEpochCaptured !== undefined ? { readModelEpochCaptured } : {}),
    });

    return { kind: 'pending', finalContent: toNaturalToolPending(locale, toolCall.name, toolFeedbackStyle) };
  }

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

  const executionCall = destructiveBlocked && preparePendingToolCall
    ? await preparePendingToolCall(toolCall)
    : undefined;

  if (destructiveBlocked && requiresDeleteSegmentMaterialization(toolCall) && !hasConcreteDeleteSegmentTarget(executionCall)) {
    const fallbackMessage = toolCall.arguments.allSegments === true
      ? t(locale, 'transcription.aiTool.segment.deleteAllNoTargets')
      : t(locale, 'transcription.aiTool.segment.deleteTargetNotResolvable');
    const finalErrorMessage = riskCheck?.riskSummary ?? fallbackMessage;
    const finalContent = toNaturalToolFailure(locale, toolCall.name, finalErrorMessage, toolFeedbackStyle);
    bumpFailureMetric();
    setTaskSession({
      id: taskSessionId,
      status: 'waiting_clarify',
      toolName: toolCall.name,
      clarifyReason: 'missing-utterance-target',
      candidates: [],
      updatedAt: nowIso(),
    });
    await writeToolDecisionAuditLog(
      assistantMessageId,
      `auto:${toolCall.name}`,
      `auto_failed:${toolCall.name}:unresolved_delete_segment_target`,
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
        'unresolved_delete_segment_target',
      ),
    );

    return { kind: 'error', finalContent, finalErrorMessage };
  }

  const shouldRequireConfirmation = destructiveBlocked && (riskCheck?.requiresConfirmation ?? true);
  if (shouldRequireConfirmation) {
    const impact = describeAndBuildPending(toolCall, aiContext);
    const finalContent = toNaturalToolPending(locale, toolCall.name, toolFeedbackStyle);
    setTaskSession({
      id: taskSessionId,
      status: 'waiting_confirm',
      toolName: toolCall.name,
      updatedAt: nowIso(),
    });
    const readModelEpochCaptured = aiContext?.shortTerm?.timelineReadModelEpoch;
    setPendingToolCall({
      call: toolCall,
      ...(executionCall ? { executionCall } : {}),
      assistantMessageId,
      riskSummary: riskCheck?.riskSummary ?? impact.riskSummary,
      impactPreview: riskCheck?.impactPreview ?? impact.impactPreview,
      previewContract: impact.previewContract,
      ...(toolCall.requestId ? { requestId: toolCall.requestId } : {}),
      auditContext,
      ...(readModelEpochCaptured !== undefined ? { readModelEpochCaptured } : {}),
    });

    return { kind: 'pending', finalContent };
  }

  return { kind: 'proceed' };
}
