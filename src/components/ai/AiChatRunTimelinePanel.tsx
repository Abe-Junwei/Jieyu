import { useMemo } from 'react';
import type { ParsedVerticalWorkflowAuditEntry } from '../../ai/vertical/verticalWorkflowAudit';
import type { getAiChatCardMessages } from '../../i18n/messages';
import { buildAiChatRunTimelineItems } from './aiChatRunTimeline';

type DecisionLogLike = Readonly<{
  id: string;
  timestamp: string;
  toolName?: string;
  decision: string;
  reason?: string;
  requestId?: string | null;
}>;

export function AiChatRunTimelinePanel({
  cardMessages,
  showPanel,
  onTogglePanel,
  aiToolDecisionLogs,
  aiVerticalWorkflowAuditEntries,
}: {
  cardMessages: ReturnType<typeof getAiChatCardMessages>;
  showPanel: boolean;
  onTogglePanel: () => void;
  aiToolDecisionLogs: DecisionLogLike[] | null | undefined;
  aiVerticalWorkflowAuditEntries: ParsedVerticalWorkflowAuditEntry[];
}) {
  const items = useMemo(
    () =>
      buildAiChatRunTimelineItems(aiToolDecisionLogs ?? [], aiVerticalWorkflowAuditEntries ?? []),
    [aiToolDecisionLogs, aiVerticalWorkflowAuditEntries],
  );

  if (items.length === 0) return null;

  return (
    <section className={`ai-chat-run-timeline-panel ${showPanel ? 'is-open' : ''}`}>
      <button type="button" className="ai-chat-run-timeline-toggle" onClick={onTogglePanel}>
        {showPanel ? cardMessages.hideRunTimeline : cardMessages.showRunTimeline}
        <span className="ai-chat-run-timeline-count">{items.length}</span>
      </button>
      {showPanel && (
        <ol className="ai-chat-run-timeline-list">
          {items.map((item) => (
            <li key={item.id} className={`ai-chat-run-timeline-item is-${item.kind}`}>
              <div className="ai-chat-run-timeline-item-meta">
                <span className="ai-chat-run-timeline-kind">
                  {item.kind === 'tool_decision'
                    ? cardMessages.runTimelineToolDecision
                    : cardMessages.runTimelineVerticalWorkflow}
                </span>
                <time dateTime={item.timestamp}>{new Date(item.timestamp).toLocaleString()}</time>
              </div>
              <p className="ai-chat-run-timeline-title">{item.title}</p>
              {item.detail ? <p className="ai-chat-run-timeline-detail">{item.detail}</p> : null}
              {item.requestId ? (
                <p className="ai-chat-run-timeline-request-id">{item.requestId}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
