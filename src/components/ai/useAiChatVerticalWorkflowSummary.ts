import { useMemo } from 'react';
import type { ParsedVerticalWorkflowAuditEntry } from '../../ai/vertical/verticalWorkflowAudit';
import type { UiChatMessage } from '../../hooks/useAiChat';
import type { getAiChatCardMessages } from '../../i18n/messages';

type AiChatCardMessages = ReturnType<typeof getAiChatCardMessages>;

export function useAiChatVerticalWorkflowSummary(input: {
  latestAssistantMessage: UiChatMessage | null;
  aiVerticalWorkflowAuditEntries: ParsedVerticalWorkflowAuditEntry[];
  cardMessages: AiChatCardMessages;
}) {
  const { latestAssistantMessage, aiVerticalWorkflowAuditEntries, cardMessages } = input;

  const latestVerticalWorkflowEntry = useMemo(() => {
    const assistantId = latestAssistantMessage?.id;
    const assistantStatus = latestAssistantMessage?.status;
    if (!assistantId || (assistantStatus !== 'done' && assistantStatus !== 'error')) {
      return null;
    }
    const latestEntry = aiVerticalWorkflowAuditEntries.find((entry) => entry.assistantMessageId === assistantId);
    return latestEntry ?? null;
  }, [aiVerticalWorkflowAuditEntries, latestAssistantMessage?.id, latestAssistantMessage?.status]);

  const latestVerticalWorkflowSummary = useMemo(() => {
    if (!latestVerticalWorkflowEntry) return null;
    return `vertical · ${latestVerticalWorkflowEntry.metadata.workflowId} · ${latestVerticalWorkflowEntry.metadata.outputKind} · ${latestVerticalWorkflowEntry.metadata.completionStatus}`;
  }, [latestVerticalWorkflowEntry]);

  const latestVerticalWorkflowRequestId = useMemo(() => {
    const normalizedRequestId = latestVerticalWorkflowEntry?.requestId?.trim();
    return normalizedRequestId && normalizedRequestId.length > 0 ? normalizedRequestId : null;
  }, [latestVerticalWorkflowEntry?.requestId]);

  const latestVerticalWorkflowSelectionSummary = useMemo(() => {
    const selection = latestVerticalWorkflowEntry?.metadata.selection;
    if (!selection) return null;
    return cardMessages.verticalWorkflowSelectionLabel(selection.source, selection.reasonCode);
  }, [cardMessages, latestVerticalWorkflowEntry?.metadata.selection]);

  const latestVerticalWorkflowSelectionKeywordSummary = useMemo(() => {
    const matchedKeyword = latestVerticalWorkflowEntry?.metadata.selection?.matchedKeyword?.trim();
    if (!matchedKeyword) return null;
    return cardMessages.verticalWorkflowKeywordLabel(matchedKeyword);
  }, [cardMessages, latestVerticalWorkflowEntry?.metadata.selection?.matchedKeyword]);

  const latestVerticalWorkflowSelectionConfidenceSummary = useMemo(() => {
    const confidence = latestVerticalWorkflowEntry?.metadata.selection?.confidence;
    if (typeof confidence !== 'number' || Number.isNaN(confidence)) return null;
    const confidencePercent = `${Math.round(confidence * 100)}%`;
    return cardMessages.verticalWorkflowConfidenceLabel(confidencePercent);
  }, [cardMessages, latestVerticalWorkflowEntry?.metadata.selection?.confidence]);

  return {
    latestVerticalWorkflowEntry,
    latestVerticalWorkflowSummary,
    latestVerticalWorkflowRequestId,
    latestVerticalWorkflowSelectionSummary,
    latestVerticalWorkflowSelectionKeywordSummary,
    latestVerticalWorkflowSelectionConfidenceSummary,
  };
}