import { formatPolicyReasonExplanation, formatToolDecision } from './aiChatCardUtils';

type DecisionItem = {
  id: string;
  toolName?: string;
  decision: string;
  reason?: string;
  reasonLabelEn?: string;
  reasonLabelZh?: string;
  message?: string;
  timestamp: string;
  requestId?: string | null;
  durationMs?: number;
};

export function AiChatDecisionListItem({
  item,
  isZh,
  cardMessages,
  isLoading,
  isSelected,
  isReplayFocus,
  isReplayLocated,
  onReplay,
  onExportSnapshot,
  onRequestRef,
  onEscapeToHeader,
}: {
  item: DecisionItem;
  isZh: boolean;
  cardMessages: {
    unknownTool: string;
    loading: string;
    replayOpened: string;
    replayCompare: string;
    snapshotExported: string;
    exportSnapshot: string;
  };
  isLoading: boolean;
  isSelected: boolean;
  isReplayFocus: boolean;
  isReplayLocated: boolean;
  onReplay: (requestId: string) => void;
  onExportSnapshot: (requestId: string) => void;
  onRequestRef: (requestId: string | null | undefined, node: HTMLDivElement | null) => void;
  onEscapeToHeader: () => void;
}) {
  const canReplay = typeof item.requestId === 'string' && item.requestId.trim().length > 0;
  const isDecisionRowKeyboardReachable = isReplayFocus || isReplayLocated || isSelected;
  const decisionBits = [
    formatToolDecision(isZh, item.decision),
    item.reason,
    typeof item.durationMs === 'number' ? `${item.durationMs}ms` : '',
  ].filter((value) => typeof value === 'string' && value.trim().length > 0);
  return (
    <div
      key={item.id}
      className={`ai-chat-decision-item ai-chat-decision-item-compact${isReplayFocus ? ' is-replay-focus' : ''}${isReplayLocated || isSelected ? ' is-replay-located' : ''}`}
      data-ai-decision-request-id={item.requestId ?? undefined}
      tabIndex={isDecisionRowKeyboardReachable ? 0 : -1}
      aria-current={isReplayLocated || isSelected ? 'location' : undefined}
      onKeyDown={(event) => {
        if (!canReplay || event.currentTarget !== event.target) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          onEscapeToHeader();
          return;
        }
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onReplay(item.requestId!);
      }}
      ref={(node) => onRequestRef(item.requestId, node)}
    >
      <div className="ai-chat-decision-item-meta">
        <span className="ai-chat-decision-item-main">{item.toolName || cardMessages.unknownTool} · {decisionBits.join(' · ')}</span>
        <em className="ai-chat-decision-item-time">{new Date(item.timestamp).toLocaleTimeString()}</em>
      </div>
      {(item.message || item.reason || item.reasonLabelEn || item.reasonLabelZh) && (
        <div className="ai-chat-decision-item-note">
          {item.message ?? ''}
          {(item.reason || item.reasonLabelEn || item.reasonLabelZh) ? (
            <span className="ai-chat-decision-item-reason">
              {isZh
                ? (item.reasonLabelZh ?? formatPolicyReasonExplanation(true, item.reason) ?? item.reason)
                : (item.reasonLabelEn ?? formatPolicyReasonExplanation(false, item.reason) ?? item.reason)}
            </span>
          ) : null}
        </div>
      )}
      {canReplay && (
        <div className="ai-chat-decision-item-actions">
          <button
            type="button"
            className="icon-btn ai-chat-decision-action-btn ai-chat-decision-action-btn-wide"
            disabled={isLoading}
            onClick={() => onReplay(item.requestId!)}
          >
            {isLoading ? cardMessages.loading : (isSelected ? cardMessages.replayOpened : cardMessages.replayCompare)}
          </button>
          <button
            type="button"
            className="icon-btn ai-chat-decision-action-btn ai-chat-decision-action-btn-mid"
            onClick={() => onExportSnapshot(item.requestId!)}
          >
            {cardMessages.exportSnapshot}
          </button>
        </div>
      )}
    </div>
  );
}
