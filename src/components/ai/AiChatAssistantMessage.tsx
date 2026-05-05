import { Fragment } from 'react';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import { JIEYU_MATERIAL_INLINE_TIGHT } from '../../utils/jieyuMaterialIcon';
import { buildCopyableAssistantPlainText, splitCitationMarkers } from '../../utils/citationFootnoteUtils';
import { formatCitationLabel } from './aiChatCardUtils';
import { StreamWordsText } from './streamAssistantWords';

type Citation = { type: 'note' | 'unit' | 'pdf' | 'schema'; refId: string; label?: string; snippet?: string };
type AssistantMessage = {
  id: string;
  status?: 'streaming' | 'done' | 'aborted' | 'error';
  content?: string;
  reasoningContent?: string;
  citations?: Citation[];
  generationSource?: 'llm' | 'local';
  generationModel?: string;
  thinking?: boolean;
};

export function AiChatAssistantMessage({
  assistantMsg,
  locale,
  isZh,
  cardMessages,
  expandedReasoningIds,
  copiedMessageId,
  pinnedMessageIdSet,
  canToggleMessagePin,
  canActivateCitation,
  onToggleMessagePin,
  onCopyAssistantMessage,
  onToggleReasoning,
  onActivateCitation,
}: {
  assistantMsg: AssistantMessage;
  locale: string;
  isZh: boolean;
  cardMessages: {
    parsingToolCall: string;
    thinking: string;
    aborted: string;
    reasoning: string;
    hideReasoning: string;
    showReasoning: string;
    copied: string;
    copy: string;
    unpinMessage: string;
    pinMessage: string;
    aiGenerated: string;
    generatedByModel: (model: string) => string;
  };
  expandedReasoningIds: Set<string>;
  copiedMessageId: string | null;
  pinnedMessageIdSet: Set<string>;
  canToggleMessagePin: boolean;
  canActivateCitation: boolean;
  onToggleMessagePin: (messageId: string, isPinned: boolean) => void;
  onCopyAssistantMessage: (messageId: string, content: string) => void;
  onToggleReasoning: (messageId: string) => void;
  onActivateCitation: (citation: { type: 'note' | 'unit' | 'pdf' | 'schema'; refId: string }, rawCitation?: { snippet?: string }) => void;
}) {
  const assistantContent = ((assistantMsg.status === 'streaming' && /\{[\s\S]*"tool_call"\s*:\s*\{/.test(assistantMsg.content || ''))
    ? cardMessages.parsingToolCall
    : (assistantMsg.content || (assistantMsg.status === 'streaming'
      ? (assistantMsg.thinking ? cardMessages.thinking : '...')
      : (assistantMsg.status === 'aborted' ? cardMessages.aborted : ''))));
  const reasoningContent = assistantMsg.reasoningContent;
  const hasReasoning = typeof reasoningContent === 'string' && reasoningContent.length > 0;
  const isReasoningExpanded = hasReasoning && expandedReasoningIds.has(assistantMsg.id);
  const rawCitations = assistantMsg.citations ?? [];
  const hasInlineMarkers = rawCitations.length > 0 && /\[\d+\]/.test(assistantContent);
  const orderedCitations = hasInlineMarkers
    ? rawCitations
    : [...rawCitations].sort((a, b) => {
      const rank = (type: string): number => {
        if (type === 'unit') return 1;
        if (type === 'note') return 2;
        if (type === 'pdf') return 3;
        return 99;
      };
      return rank(a.type) - rank(b.type);
    });
  const copyableAssistantContent = buildCopyableAssistantPlainText({
    content: assistantMsg.content ?? '',
    citations: orderedCitations,
    locale,
  });
  const hasCopyableAssistantContent = copyableAssistantContent.length > 0;
  const showAiGeneratedText = assistantMsg.generationSource === 'llm' && assistantMsg.status === 'done';
  const generatedModelName = (assistantMsg.generationModel ?? '').trim();
  const generatedLabel = generatedModelName.length > 0
    ? cardMessages.generatedByModel(generatedModelName)
    : cardMessages.aiGenerated;
  const isAssistantPinned = pinnedMessageIdSet.has(assistantMsg.id);

  return (
    <div className="ai-chat-message-bubble ai-chat-message-assistant">
      <div className="ai-chat-message-surface">
        <span className="ai-chat-message-content">
          {hasInlineMarkers
            ? splitCitationMarkers(assistantContent, rawCitations.length).map((seg, i) => (
              seg.type === 'text'
                ? (
                  assistantMsg.status === 'streaming'
                    ? (
                      <StreamWordsText
                        key={`${assistantMsg.id}-cit-${i}`}
                        streamKey={`${assistantMsg.id}-cit-${i}`}
                        text={seg.value}
                        locale={locale}
                      />
                    )
                    : <Fragment key={i}>{seg.value}</Fragment>
                )
                : (
                  <sup
                    key={i}
                    className="ai-citation-marker"
                    role={canActivateCitation ? 'button' : undefined}
                    tabIndex={canActivateCitation ? 0 : undefined}
                    onClick={() => {
                      if (!canActivateCitation) return;
                      const c = rawCitations[seg.index! - 1];
                      if (c) onActivateCitation(c, c);
                    }}
                    onKeyDown={(e) => {
                      if (!canActivateCitation) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        const c = rawCitations[seg.index! - 1];
                        if (c) onActivateCitation(c, c);
                      }
                    }}
                  >
                    {seg.value}
                  </sup>
                )
            ))
            : assistantMsg.status === 'streaming'
              ? (
                <StreamWordsText
                  streamKey={assistantMsg.id}
                  text={assistantContent}
                  locale={locale}
                />
              )
              : assistantContent}
        </span>
        {hasReasoning && isReasoningExpanded && (
          <div className="ai-chat-reasoning-block">
            <div className="ai-chat-reasoning-title">
              {cardMessages.reasoning}
            </div>
            <div className="ai-chat-reasoning-body">
              {assistantMsg.status === 'streaming'
                ? (
                  <StreamWordsText
                    streamKey={`${assistantMsg.id}-reasoning`}
                    text={reasoningContent ?? ''}
                    locale={locale}
                  />
                )
                : reasoningContent}
            </div>
          </div>
        )}
        <div className="ai-chat-message-actions">
          {canToggleMessagePin && (
          <button
            type="button"
            className={`ai-chat-message-action-btn ai-chat-message-pin-btn ${isAssistantPinned ? 'is-active' : ''}`}
            onClick={() => onToggleMessagePin(assistantMsg.id, isAssistantPinned)}
            aria-label={isAssistantPinned ? cardMessages.unpinMessage : cardMessages.pinMessage}
            title={isAssistantPinned ? cardMessages.unpinMessage : cardMessages.pinMessage}
          >
            <MaterialSymbol
              name={isAssistantPinned ? 'close' : 'push_pin'}
              className={JIEYU_MATERIAL_INLINE_TIGHT}
            />
          </button>
          )}
          {hasCopyableAssistantContent && (
            <button
              type="button"
              className="icon-btn ai-chat-message-copy-btn"
              title={copiedMessageId === assistantMsg.id
                ? cardMessages.copied
                : cardMessages.copy}
              aria-label={copiedMessageId === assistantMsg.id
                ? cardMessages.copied
                : cardMessages.copy}
              onClick={() => onCopyAssistantMessage(assistantMsg.id, copyableAssistantContent)}
            >
              {copiedMessageId === assistantMsg.id ? <MaterialSymbol name="check" className={JIEYU_MATERIAL_INLINE_TIGHT} /> : <MaterialSymbol name="content_copy" className={JIEYU_MATERIAL_INLINE_TIGHT} />}
            </button>
          )}
          {hasReasoning && (
            <button
              type="button"
              className="ai-chat-message-action-btn ai-chat-message-action-btn-italic"
              onClick={() => onToggleReasoning(assistantMsg.id)}
            >
              {isReasoningExpanded
                ? cardMessages.hideReasoning
                : cardMessages.showReasoning}
            </button>
          )}
          {orderedCitations.map((citation, ci) => (
            <button
              key={`${assistantMsg.id}-${citation.type}-${citation.refId}`}
              className="ai-chat-message-action-btn"
              title={`${citation.type}:${citation.refId}`}
              type="button"
              disabled={!canActivateCitation}
              onClick={() => onActivateCitation(citation, citation)}
            >
              {hasInlineMarkers ? `[${ci + 1}] ` : ''}{formatCitationLabel(isZh, citation)}
            </button>
          ))}
          {showAiGeneratedText && (
            <span className="ai-chat-message-source-text">
              {generatedLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
