import { type RefObject } from 'react';
import { t } from '../../i18n';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import { JIEYU_MATERIAL_INLINE_TIGHT } from '../../utils/jieyuMaterialIcon';
import { AiChatAssistantMessage } from './AiChatAssistantMessage';
import type { DegradationScenario } from '../../ai/chat/degradationManualOverride';

type UserMessage = {
  id: string;
  status?: 'streaming' | 'done' | 'aborted' | 'error';
  content?: string;
};

type AssistantMessage = {
  id: string;
  status?: 'streaming' | 'done' | 'aborted' | 'error';
  content?: string;
  reasoningContent?: string;
  citations?: Array<{ type: 'note' | 'unit' | 'pdf' | 'schema'; refId: string; label?: string; snippet?: string; confidence?: number; reasonCode?: string }>;
  generationSource?: 'llm' | 'local';
  generationModel?: string;
  thinking?: boolean;
  degradationScenarios?: DegradationScenario[];
};

export function AiChatMessageThread({
  locale,
  cardMessages,
  messageViewportRef,
  messages,
  turns,
  pinnedMessageIdSet,
  pinnedSummaryItems,
  expandedReasoningIds,
  copiedMessageId,
  canToggleMessagePin,
  canActivateCitation,
  onToggleMessagePin,
  onCopyAssistantMessage,
  onToggleReasoning,
  onActivateCitation,
  onClearAiMessages,
  feedbackRatings,
  onFeedbackRate,
}: {
  locale: Parameters<typeof t>[0];
  cardMessages: {
    aborted: string;
    unpinMessage: string;
    pinMessage: string;
    pinnedMessagesTitle: string;
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
    parsingToolCall: string;
    thinking: string;
  };
  messageViewportRef: RefObject<HTMLDivElement | null>;
  messages: Array<UserMessage | AssistantMessage>;
  turns: Array<{ assistant?: AssistantMessage; user?: UserMessage }>;
  pinnedMessageIdSet: Set<string>;
  pinnedSummaryItems: Array<{ messageId: string; summary: string }>;
  expandedReasoningIds: Set<string>;
  copiedMessageId: string | null;
  canToggleMessagePin: boolean;
  canActivateCitation: boolean;
  onToggleMessagePin: (messageId: string, isPinned: boolean) => void;
  onCopyAssistantMessage: (messageId: string, content: string) => void;
  onToggleReasoning: (messageId: string) => void;
  onActivateCitation: (citation: { type: 'note' | 'unit' | 'pdf' | 'schema'; refId: string }, rawCitation?: { snippet?: string }) => void;
  onClearAiMessages: (() => void) | undefined;
  feedbackRatings?: Record<string, 'thumbs_up' | 'thumbs_down'>;
  onFeedbackRate?: (messageId: string, rating: 'thumbs_up' | 'thumbs_down') => void;
}) {
  const isZh = locale === 'zh-CN';
  return (
    <>
      <div ref={messageViewportRef} className="ai-chat-message-viewport">
        {messages.length === 0 ? (
          <p className="small-text">{t(locale, 'ai.chat.noMessages')}</p>
        ) : (
          <div className="ai-chat-message-canvas">
            {turns.map((turn, index) => {
              const assistantMsg = turn.assistant;
              const userMsg = turn.user;
              if (!assistantMsg && !userMsg) return null;
              const userContent = userMsg
                ? (userMsg.content || (userMsg.status === 'streaming' ? '...' : (userMsg.status === 'aborted' ? cardMessages.aborted : '')))
                : '';
              const isUserPinned = pinnedMessageIdSet.has(userMsg?.id ?? '');

              return (
                <div
                  key={`${assistantMsg?.id ?? 'na'}-${userMsg?.id ?? 'nu'}`}
                  className="ai-chat-turn"
                  data-index={index}
                >
                  {userMsg && (
                    <div className="ai-chat-message-bubble ai-chat-message-user">
                      <div className="ai-chat-message-surface">
                        <span className="ai-chat-message-content">{userContent}</span>
                        {canToggleMessagePin && (
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
                        )}
                      </div>
                    </div>
                  )}
                  {assistantMsg && (
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
                  )}
                </div>
              );
            })}
          </div>
        )}
        {messages.length > 0 && onClearAiMessages && (
          <div className="ai-chat-message-toolbar">
            <button
              type="button"
              className="ai-chat-clear-inline-text"
              onClick={() => onClearAiMessages?.()}
            >
              {t(locale, 'ai.chat.clear')}
            </button>
          </div>
        )}
      </div>
      {pinnedSummaryItems.length > 0 && (
        <section className="ai-chat-pinned-summary-panel" aria-label={cardMessages.pinnedMessagesTitle}>
          <div className="ai-chat-pinned-summary-list">
            {pinnedSummaryItems.map((item) => (
              <article key={item.messageId} className="ai-chat-pinned-summary-item">
                <span className="ai-chat-pinned-summary-text">{item.summary}</span>
                <button
                  type="button"
                  className="ai-chat-pinned-summary-remove"
                  onClick={() => onToggleMessagePin(item.messageId, true)}
                  disabled={!canToggleMessagePin}
                  aria-label={cardMessages.unpinMessage}
                  title={cardMessages.unpinMessage}
                >
                  <MaterialSymbol name="close" className={JIEYU_MATERIAL_INLINE_TIGHT} />
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
