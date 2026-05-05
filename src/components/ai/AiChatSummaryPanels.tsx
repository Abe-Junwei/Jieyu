import type { getAiChatCardMessages } from '../../i18n/messages';
import { compactInternalId } from './aiChatCardUtils';

type VerticalWorkflowEntryLike = {
  metadata: {
    completionPath: string;
  };
  recordedAt: string;
};

type ConversationSummaryEntry = {
  id: string;
  summary: string;
  coveredTurnCount: number;
  createdAt: string;
};

type SummaryQualityWarning = {
  similarity: number;
  threshold: number;
};

export function AiChatSummaryPanels({
  locale,
  cardMessages,
  hasConversationSummary,
  showConversationSummary,
  onToggleConversationSummary,
  summaryQualityWarning,
  summaryEntries,
  latestVerticalWorkflowSummary,
  latestVerticalWorkflowEntry,
  latestVerticalWorkflowSelectionSummary,
  latestVerticalWorkflowSelectionKeywordSummary,
  latestVerticalWorkflowSelectionConfidenceSummary,
  latestVerticalWorkflowRequestId,
  showVerticalWorkflowDetail,
  onToggleVerticalWorkflowDetail,
  isLatestVerticalReplayLoading,
  isLatestVerticalReplaySelected,
  copiedVerticalWorkflowRequestId,
  onOpenLatestVerticalWorkflowReplay,
  onCopyLatestVerticalWorkflowRequestId,
}: {
  locale: string;
  cardMessages: ReturnType<typeof getAiChatCardMessages>;
  hasConversationSummary: boolean;
  showConversationSummary: boolean;
  onToggleConversationSummary: () => void;
  summaryQualityWarning: SummaryQualityWarning | null;
  summaryEntries: ConversationSummaryEntry[];
  latestVerticalWorkflowSummary: string | null;
  latestVerticalWorkflowEntry: VerticalWorkflowEntryLike | null;
  latestVerticalWorkflowSelectionSummary: string | null;
  latestVerticalWorkflowSelectionKeywordSummary: string | null;
  latestVerticalWorkflowSelectionConfidenceSummary: string | null;
  latestVerticalWorkflowRequestId: string | null;
  showVerticalWorkflowDetail: boolean;
  onToggleVerticalWorkflowDetail: () => void;
  isLatestVerticalReplayLoading: boolean;
  isLatestVerticalReplaySelected: boolean;
  copiedVerticalWorkflowRequestId: string | null;
  onOpenLatestVerticalWorkflowReplay: () => void;
  onCopyLatestVerticalWorkflowRequestId: () => void;
}) {
  return (
    <>
      {hasConversationSummary && (
        <section className={`ai-chat-summary-panel ${showConversationSummary ? 'is-open' : ''}`}>
          <div className="ai-chat-summary-header-row">
            <button
              type="button"
              className="ai-chat-summary-toggle"
              onClick={onToggleConversationSummary}
            >
              {showConversationSummary ? cardMessages.hideConversationSummary : cardMessages.showConversationSummary}
            </button>
            {summaryQualityWarning && (
              <span className="ai-chat-summary-warning" role="status" aria-live="polite">
                {cardMessages.summaryQualityWarning(summaryQualityWarning.similarity, summaryQualityWarning.threshold)}
              </span>
            )}
          </div>
          {showConversationSummary && (
            <div className="ai-chat-summary-body">
              <p className="ai-chat-summary-title">{cardMessages.conversationSummaryTitle}</p>
              {summaryEntries.length === 0 ? (
                <p className="ai-chat-summary-empty">{cardMessages.summaryEmpty}</p>
              ) : summaryEntries.map((entry) => (
                <article key={entry.id} className="ai-chat-summary-entry">
                  <div className="ai-chat-summary-entry-meta">
                    <span>{cardMessages.summaryCoveredTurns(entry.coveredTurnCount)}</span>
                    {entry.createdAt ? <span>{new Date(entry.createdAt).toLocaleString(locale)}</span> : null}
                  </div>
                  <p className="ai-chat-summary-entry-content">{entry.summary}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
      {latestVerticalWorkflowSummary && latestVerticalWorkflowEntry && (
        <section className="ai-chat-summary-panel" aria-label={cardMessages.verticalWorkflowTitle}>
          <div className="ai-chat-summary-header-row">
            <p className="ai-chat-summary-title">{cardMessages.verticalWorkflowTitle}</p>
            <button
              type="button"
              className="ai-chat-summary-toggle"
              onClick={onToggleVerticalWorkflowDetail}
              aria-expanded={showVerticalWorkflowDetail}
            >
              {showVerticalWorkflowDetail
                ? cardMessages.verticalWorkflowHideDetail
                : cardMessages.verticalWorkflowShowDetail}
            </button>
          </div>
          <div className="small-text" role="status" aria-live="polite">
            {latestVerticalWorkflowSummary}
          </div>
          {showVerticalWorkflowDetail && (
            <div className="ai-chat-summary-body">
              <article className="ai-chat-summary-entry">
                <div className="ai-chat-summary-entry-meta">
                  <span>{latestVerticalWorkflowEntry.metadata.completionPath}</span>
                  <span>{new Date(latestVerticalWorkflowEntry.recordedAt).toLocaleString(locale)}</span>
                </div>
                <p className="ai-chat-summary-entry-content">
                  {latestVerticalWorkflowSummary}
                </p>
                {latestVerticalWorkflowSelectionSummary && (
                  <p className="ai-chat-summary-entry-content">
                    {latestVerticalWorkflowSelectionSummary}
                  </p>
                )}
                {latestVerticalWorkflowSelectionKeywordSummary && (
                  <p className="ai-chat-summary-entry-content">
                    {latestVerticalWorkflowSelectionKeywordSummary}
                  </p>
                )}
                {latestVerticalWorkflowSelectionConfidenceSummary && (
                  <p className="ai-chat-summary-entry-content">
                    {latestVerticalWorkflowSelectionConfidenceSummary}
                  </p>
                )}
                <p className="ai-chat-summary-entry-content">
                  {cardMessages.verticalWorkflowRequestLabel(compactInternalId(latestVerticalWorkflowRequestId ?? 'n/a'))}
                </p>
              </article>
              <div className="ai-chat-decision-item-actions">
                <button
                  type="button"
                  className="icon-btn ai-chat-decision-action-btn ai-chat-decision-action-btn-wide"
                  disabled={!latestVerticalWorkflowRequestId || isLatestVerticalReplayLoading}
                  onClick={onOpenLatestVerticalWorkflowReplay}
                  title={!latestVerticalWorkflowRequestId ? cardMessages.verticalWorkflowRequestUnavailable : undefined}
                >
                  {isLatestVerticalReplayLoading
                    ? cardMessages.loading
                    : (isLatestVerticalReplaySelected ? cardMessages.replayOpened : cardMessages.verticalWorkflowOpenReplay)}
                </button>
                <button
                  type="button"
                  className="icon-btn ai-chat-decision-action-btn ai-chat-decision-action-btn-mid"
                  disabled={!latestVerticalWorkflowRequestId}
                  onClick={onCopyLatestVerticalWorkflowRequestId}
                  title={copiedVerticalWorkflowRequestId === latestVerticalWorkflowRequestId
                    ? cardMessages.copied
                    : cardMessages.copy}
                  aria-label={copiedVerticalWorkflowRequestId === latestVerticalWorkflowRequestId
                    ? cardMessages.copied
                    : cardMessages.copy}
                >
                  {copiedVerticalWorkflowRequestId === latestVerticalWorkflowRequestId
                    ? cardMessages.copied
                    : cardMessages.copy}
                </button>
              </div>
              {!latestVerticalWorkflowRequestId && (
                <p className="ai-chat-summary-empty">{cardMessages.verticalWorkflowRequestUnavailable}</p>
              )}
            </div>
          )}
        </section>
      )}
    </>
  );
}