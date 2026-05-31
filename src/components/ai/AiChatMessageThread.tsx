import { type CSSProperties, type RefObject } from 'react';
import { t } from '../../i18n';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import { JIEYU_MATERIAL_INLINE_TIGHT } from '../../utils/jieyuMaterialIcon';
import { AiChatTurnRow, type AiChatTurnRowData } from './AiChatTurnRow';
import {
  shouldVirtualizeAiChatTurns,
  useAiChatMessageThreadVirtualizer,
} from './useAiChatMessageThreadVirtualizer';

type TurnRowRenderProps = {
  locale: Parameters<typeof t>[0];
  isZh: boolean;
  cardMessages: Parameters<typeof AiChatTurnRow>[0]['cardMessages'];
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
};

function renderTurnRow(turn: AiChatTurnRowData, turnIndex: number, props: TurnRowRenderProps) {
  return (
    <AiChatTurnRow
      key={`${turn.assistant?.id ?? 'na'}-${turn.user?.id ?? 'nu'}`}
      locale={props.locale}
      isZh={props.isZh}
      turn={turn}
      turnIndex={turnIndex}
      cardMessages={props.cardMessages}
      pinnedMessageIdSet={props.pinnedMessageIdSet}
      expandedReasoningIds={props.expandedReasoningIds}
      copiedMessageId={props.copiedMessageId}
      canToggleMessagePin={props.canToggleMessagePin}
      canActivateCitation={props.canActivateCitation}
      onToggleMessagePin={props.onToggleMessagePin}
      onCopyAssistantMessage={props.onCopyAssistantMessage}
      onToggleReasoning={props.onToggleReasoning}
      onActivateCitation={props.onActivateCitation}
      {...(props.feedbackRatings !== undefined ? { feedbackRatings: props.feedbackRatings } : {})}
      {...(props.onFeedbackRate !== undefined ? { onFeedbackRate: props.onFeedbackRate } : {})}
    />
  );
}

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
  clearConversationLabel = false,
  virtualizeTurns,
  aiIsStreaming,
  streamingThreadScrollSignature = 0,
  feedbackRatings,
  onFeedbackRate,
}: {
  locale: Parameters<typeof t>[0];
  cardMessages: TurnRowRenderProps['cardMessages'] & { pinnedMessagesTitle: string };
  messageViewportRef: RefObject<HTMLDivElement | null>;
  messages: Array<{ id: string; role?: string }>;
  turns: AiChatTurnRowData[];
  pinnedMessageIdSet: Set<string>;
  pinnedSummaryItems: Array<{ messageId: string; summary: string }>;
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
  onClearAiMessages: (() => void) | undefined;
  clearConversationLabel?: boolean;
  /** When omitted, derives from turn count (G1g threshold). */
  virtualizeTurns?: boolean;
  aiIsStreaming?: boolean;
  streamingThreadScrollSignature?: number;
  feedbackRatings?: Record<string, 'thumbs_up' | 'thumbs_down'>;
  onFeedbackRate?: (messageId: string, rating: 'thumbs_up' | 'thumbs_down') => void;
}) {
  const isZh = locale === 'zh-CN';
  const useVirtualization = virtualizeTurns ?? shouldVirtualizeAiChatTurns(turns.length);

  const { turnVirtualizer } = useAiChatMessageThreadVirtualizer({
    enabled: useVirtualization,
    turns,
    messageViewportRef,
    messagesLength: messages.length,
    streamingThreadScrollSignature,
    aiIsStreaming,
  });

  const turnRowProps: TurnRowRenderProps = {
    locale,
    isZh,
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
    ...(feedbackRatings !== undefined ? { feedbackRatings } : {}),
    ...(onFeedbackRate !== undefined ? { onFeedbackRate } : {}),
  };

  const virtualListStyle: CSSProperties = {
    height: `${turnVirtualizer.getTotalSize()}px`,
    position: 'relative',
    width: '100%',
  };

  return (
    <>
      <div ref={messageViewportRef} className="ai-chat-message-viewport">
        {messages.length === 0 ? (
          <p className="small-text">{t(locale, 'ai.chat.noMessages')}</p>
        ) : useVirtualization ? (
          <div className="ai-chat-message-canvas ai-chat-message-canvas-virtual">
            <div style={virtualListStyle}>
              {turnVirtualizer.getVirtualItems().map((virtualRow) => {
                const turn = turns[virtualRow.index];
                if (!turn) return null;
                const rowStyle: CSSProperties = {
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                };
                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={turnVirtualizer.measureElement}
                    className="ai-chat-turn-virtual-row"
                    style={rowStyle}
                  >
                    {renderTurnRow(turn, virtualRow.index, turnRowProps)}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="ai-chat-message-canvas">
            {turns.map((turn, index) => renderTurnRow(turn, index, turnRowProps))}
          </div>
        )}
        {messages.length > 0 && onClearAiMessages ? (
          <div className="ai-chat-message-toolbar">
            <button
              type="button"
              className="ai-chat-clear-inline-text"
              onClick={() => onClearAiMessages?.()}
            >
              {t(locale, clearConversationLabel ? 'ai.chat.clearCurrent' : 'ai.chat.clear')}
            </button>
          </div>
        ) : null}
      </div>
      {pinnedSummaryItems.length > 0 ? (
        <section
          className="ai-chat-pinned-summary-panel"
          aria-label={cardMessages.pinnedMessagesTitle}
        >
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
      ) : null}
    </>
  );
}
