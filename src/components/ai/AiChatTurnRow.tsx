import { MaterialSymbol } from '../ui/MaterialSymbol';
import { JIEYU_MATERIAL_INLINE_TIGHT } from '../../utils/jieyuMaterialIcon';
import { AiChatAssistantMessage } from './AiChatAssistantMessage';
import type { DegradationScenario } from '../../ai/chat/degradationManualOverride';
import type { WorkflowExplainabilityV0 } from '../../ai/chat/workflowExplainability';
import type { Locale } from '../../i18n';

export type AiChatTurnUserMessage = {
  id: string;
  status?: 'streaming' | 'done' | 'aborted' | 'error';
  content?: string;
};

export type AiChatTurnAssistantMessage = {
  id: string;
  status?: 'streaming' | 'done' | 'aborted' | 'error';
  content?: string;
  reasoningContent?: string;
  citations?: Array<{
    type: 'note' | 'unit' | 'pdf' | 'schema';
    refId: string;
    label?: string;
    snippet?: string;
    confidence?: number;
    reasonCode?: string;
  }>;
  generationSource?: 'llm' | 'local';
  generationModel?: string;
  thinking?: boolean;
  degradationScenarios?: DegradationScenario[];
  sourceScopeSummary?: {
    evidenceCount: number;
    sourceTypeBreakdown: Record<string, number>;
    scopeLabel: string;
  };
  workflowExplainability?: WorkflowExplainabilityV0;
  reflectionChecks?: Array<{ name: string; passed: boolean }>;
  compatibilityReport?: {
    reportId: string;
    findings: Array<{
      findingId: string;
      kind: string;
      severity: 'info' | 'warning' | 'error';
      title: string;
      description: string;
      recommendedAction: string;
      evidenceCount: number;
    }>;
    summary: string;
    exportTargets: string[];
  };
};

export type AiChatTurnRowData = {
  assistant?: AiChatTurnAssistantMessage;
  user?: AiChatTurnUserMessage;
};

export function AiChatTurnRow({
  locale,
  isZh,
  turn,
  turnIndex,
  cardMessages,
  pinnedMessageIdSet,
  expandedReasoningIds,
  copiedMessageId,
  canToggleMessagePin,
  canActivateCitation,
  onToggleMessagePin,
  onCopyAssistantMessage,
  onToggleReasoning,
  onActivateCitation,
  feedbackRatings,
  onFeedbackRate,
}: {
  locale: Locale;
  isZh: boolean;
  turn: AiChatTurnRowData;
  turnIndex: number;
  cardMessages: {
    aborted: string;
    unpinMessage: string;
    pinMessage: string;
    reasoning: string;
    hideReasoning: string;
    showReasoning: string;
    copied: string;
    copy: string;
    aiGenerated: string;
    generatedByModel: (model: string) => string;
    evidenceTitle: string;
    evidenceSourceLabel: string;
    evidenceQuoteLabel: string;
    evidenceConfidenceLabel: (confidencePercent: string) => string;
    evidenceJump: string;
    sourceScopeSummary: (count: number, scopeLabel: string) => string;
    workflowExplainabilitySrOnly: (
      headlineKey: 'assistant_error' | 'degraded_response' | 'scope_summary_only',
      detailsJoined: string,
    ) => string;
    parsingToolCall: string;
    thinking: string;
  };
  pinnedMessageIdSet: Set<string>;
  expandedReasoningIds: Set<string>;
  copiedMessageId: string | null;
  canToggleMessagePin: boolean;
  canActivateCitation: boolean;
  onToggleMessagePin: (messageId: string, isPinned: boolean) => void;
  onCopyAssistantMessage: (messageId: string, content: string) => void;
  onToggleReasoning: (messageId: string) => void;
  onActivateCitation: (
    citation: { type: 'note' | 'unit' | 'pdf' | 'schema'; refId: string },
    rawCitation?: { snippet?: string },
  ) => void;
  feedbackRatings?: Record<string, 'thumbs_up' | 'thumbs_down'>;
  onFeedbackRate?: (messageId: string, rating: 'thumbs_up' | 'thumbs_down') => void;
}) {
  const assistantMsg = turn.assistant;
  const userMsg = turn.user;
  if (!assistantMsg && !userMsg) return null;

  const userContent = userMsg
    ? userMsg.content ||
      (userMsg.status === 'streaming'
        ? '...'
        : userMsg.status === 'aborted'
          ? cardMessages.aborted
          : '')
    : '';
  const isUserPinned = pinnedMessageIdSet.has(userMsg?.id ?? '');

  return (
    <div className="ai-chat-turn" data-index={turnIndex}>
      {userMsg ? (
        <div className="ai-chat-message-bubble ai-chat-message-user">
          <div className="ai-chat-message-surface">
            <span className="ai-chat-message-content">{userContent}</span>
            {canToggleMessagePin ? (
              <div className="ai-chat-message-actions">
                <button
                  type="button"
                  className={`ai-chat-message-action-btn ai-chat-message-pin-btn ${isUserPinned ? 'is-active' : ''}`}
                  onClick={() => onToggleMessagePin(userMsg.id, isUserPinned)}
                  aria-label={isUserPinned ? cardMessages.unpinMessage : cardMessages.pinMessage}
                  title={isUserPinned ? cardMessages.unpinMessage : cardMessages.pinMessage}
                >
                  <MaterialSymbol
                    name={isUserPinned ? 'close' : 'push_pin'}
                    className={JIEYU_MATERIAL_INLINE_TIGHT}
                  />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {assistantMsg ? (
        <AiChatAssistantMessage
          assistantMsg={assistantMsg}
          locale={locale}
          isZh={isZh}
          cardMessages={cardMessages}
          expandedReasoningIds={expandedReasoningIds}
          copiedMessageId={copiedMessageId}
          pinnedMessageIdSet={pinnedMessageIdSet}
          canToggleMessagePin={canToggleMessagePin}
          canActivateCitation={canActivateCitation}
          onToggleMessagePin={onToggleMessagePin}
          onCopyAssistantMessage={onCopyAssistantMessage}
          onToggleReasoning={onToggleReasoning}
          onActivateCitation={onActivateCitation}
          {...(feedbackRatings !== undefined ? { feedbackRatings } : {})}
          {...(onFeedbackRate !== undefined ? { onFeedbackRate } : {})}
        />
      ) : null}
    </div>
  );
}
