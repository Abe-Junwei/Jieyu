type DirectiveSourceFilter = 'all' | 'user_explicit' | 'background_extracted' | 'pinned_message';

type DirectiveRow = {
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

  return (
    <section
      className="ai-chat-composer-attachments"
      aria-label={isZh ? '指令与记忆' : 'Directives and memory'}
      data-testid="ai-directive-console-mvp"
    >
      <span className="ai-chat-composer-attachments-title">
        {isZh ? '指令与记忆（MVP）' : 'Directives and Memory (MVP)'}
        <span className="ai-chat-pinned-count">{filteredDirectiveRows.length}</span>
      </span>
      <div className="ai-chat-alerts-pending-row">
        <span>{isZh ? '来源筛选：' : 'Source filter:'}</span>
        <select
          value={directiveSourceFilter}
          onChange={(event) => onDirectiveSourceFilterChange(event.target.value as DirectiveSourceFilter)}
          aria-label={isZh ? '指令来源筛选' : 'Directive source filter'}
        >
          <option value="all">{isZh ? '全部' : 'All'}</option>
          <option value="user_explicit">{isZh ? '用户明确指令' : 'User explicit'}</option>
          <option value="background_extracted">{isZh ? '后台抽取' : 'Background extracted'}</option>
          <option value="pinned_message">{isZh ? '钉住消息' : 'Pinned message'}</option>
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
                onDirectiveActionNoticeChange(isZh ? `已停用：${item.id}` : `Deactivated: ${item.id}`);
              }}
              disabled={!onDeactivateAiSessionDirective}
            >
              {isZh ? '停用' : 'Deactivate'}
            </button>
            {item.sourceMessageId && (
              <button
                type="button"
                className="ai-chat-composer-attachment-remove"
                onClick={() => {
                  onPruneAiSessionDirectivesBySourceMessage?.(item.sourceMessageId as string);
                  onDirectiveActionNoticeChange(
                    isZh
                      ? `已按来源消息清理：${item.sourceMessageId}`
                      : `Pruned by source message: ${item.sourceMessageId}`,
                  );
                }}
                disabled={!onPruneAiSessionDirectivesBySourceMessage}
              >
                {isZh ? '同源清理' : 'Prune source'}
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
