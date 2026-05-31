import type { ParsedVerticalWorkflowAuditEntry } from '../../ai/vertical/verticalWorkflowAudit';

export type AiChatRunTimelineKind = 'tool_decision' | 'vertical_workflow';

export type AiChatRunTimelineItem = Readonly<{
  id: string;
  timestamp: string;
  kind: AiChatRunTimelineKind;
  title: string;
  detail?: string;
  requestId?: string | null;
}>;

type DecisionLogLike = Readonly<{
  id: string;
  timestamp: string;
  toolName?: string;
  decision: string;
  reason?: string;
  requestId?: string | null;
}>;

export function buildAiChatRunTimelineItems(
  decisions: readonly DecisionLogLike[],
  verticalEntries: readonly ParsedVerticalWorkflowAuditEntry[],
): AiChatRunTimelineItem[] {
  const items: AiChatRunTimelineItem[] = [];

  for (const row of decisions) {
    const toolLabel = row.toolName?.trim() || 'tool';
    items.push({
      id: `decision:${row.id}`,
      timestamp: row.timestamp,
      kind: 'tool_decision',
      title: `${toolLabel} · ${row.decision}`,
      ...(row.reason?.trim() ? { detail: row.reason.trim() } : {}),
      requestId: row.requestId ?? null,
    });
  }

  for (const row of verticalEntries) {
    const path = row.metadata.completionPath;
    const status = row.metadata.completionStatus;
    items.push({
      id: `vertical:${row.assistantMessageId}:${row.recordedAt}`,
      timestamp: row.recordedAt,
      kind: 'vertical_workflow',
      title: `${row.metadata.workflowId} · ${path}`,
      detail: `status=${status}; evidence=${row.metadata.envelope.evidencePacketCount}`,
      requestId: row.requestId,
    });
  }

  return items.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
