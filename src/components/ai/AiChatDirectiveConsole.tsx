import { t, tf, type Locale } from '../../i18n';

export type DirectiveSourceFilter = 'all' | 'user_explicit' | 'background_extracted' | 'pinned_message';

export type DirectiveRow = {
  id: string;
  text: string;
  category: string;
  source: string;
  sourceMessageId?: string | undefined;
};

type AiChatDirectiveConsoleProps = {
  isZh: boolean;
  activeDirectiveRows: DirectiveRow[];
  filteredDirectiveRows: DirectiveRow[];
  directiveSourceFilter: DirectiveSourceFilter;
  directiveActionNotice: string | null;
  onDirectiveSourceFilterChange: (next: DirectiveSourceFilter) => void;
  onDirectiveActionNoticeChange: (next: string | null) => void;
  onDeactivateAiSessionDirective?: ((id: string) => void) | undefined;
  onPruneAiSessionDirectivesBySourceMessage?: ((sourceMessageId: string) => void) | undefined;
};

export function AiChatDirectiveConsole({
  isZh,
  activeDirectiveRows,
  filteredDirectiveRows,
  directiveSourceFilter,
  directiveActionNotice,
  onDirectiveSourceFilterChange,
  onDirectiveActionNoticeChange,
  onDeactivateAiSessionDirective,
  onPruneAiSessionDirectivesBySourceMessage,
}: AiChatDirectiveConsoleProps) {
  if (activeDirectiveRows.length === 0) return null;

  const locale: Locale = isZh ? 'zh-CN' : 'en-US';

  return (
    <section
      className="ai-chat-composer-attachments"
      aria-label={t(locale, 'ai.chat.directiveConsole.ariaLabel')}
      data-testid="ai-directive-console-mvp"
    >
      <span className="ai-chat-composer-attachments-title">
        {t(locale, 'ai.chat.directiveConsole.title')}
        <span className="ai-chat-pinned-count">{filteredDirectiveRows.length}</span>
      </span>
      <div className="ai-chat-alerts-pending-row">
        <span>{t(locale, 'ai.chat.directiveConsole.sourceFilterLabel')}</span>
        <select
          value={directiveSourceFilter}
          onChange={(event) => onDirectiveSourceFilterChange(event.target.value as DirectiveSourceFilter)}
          aria-label={t(locale, 'ai.chat.directiveConsole.sourceFilterAriaLabel')}
        >
          <option value="all">{t(locale, 'ai.chat.directiveConsole.filter.all')}</option>
          <option value="user_explicit">{t(locale, 'ai.chat.directiveConsole.filter.userExplicit')}</option>
          <option value="background_extracted">{t(locale, 'ai.chat.directiveConsole.filter.backgroundExtracted')}</option>
          <option value="pinned_message">{t(locale, 'ai.chat.directiveConsole.filter.pinnedMessage')}</option>
        </select>
      </div>
      {directiveActionNotice && <div className="ai-chat-alerts-pending-risk">{directiveActionNotice}</div>}
      <div className="ai-chat-composer-attachments-list">
        {filteredDirectiveRows.map((item) => (
          <article key={item.id} className="ai-chat-composer-attachment-chip">
            <span className="ai-chat-composer-attachment-role">[{item.category}]</span>
            <span className="ai-chat-composer-attachment-summary" title={`${item.text} (${item.source})`}>
              {item.text} ({item.source})
            </span>
            <button
              type="button"
              className="ai-chat-composer-attachment-remove"
              onClick={() => {
                onDeactivateAiSessionDirective?.(item.id);
                onDirectiveActionNoticeChange(tf(locale, 'ai.chat.directiveConsole.deactivatedNotice', { id: item.id }));
              }}
              disabled={!onDeactivateAiSessionDirective}
            >
              {t(locale, 'ai.chat.directiveConsole.deactivate')}
            </button>
            {item.sourceMessageId && (
              <button
                type="button"
                className="ai-chat-composer-attachment-remove"
                onClick={() => {
                  onPruneAiSessionDirectivesBySourceMessage?.(item.sourceMessageId as string);
                  onDirectiveActionNoticeChange(
                    tf(locale, 'ai.chat.directiveConsole.prunedBySourceNotice', { sourceMessageId: item.sourceMessageId as string }),
                  );
                }}
                disabled={!onPruneAiSessionDirectivesBySourceMessage}
              >
                {t(locale, 'ai.chat.directiveConsole.pruneSource')}
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
