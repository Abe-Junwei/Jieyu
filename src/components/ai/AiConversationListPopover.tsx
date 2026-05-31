import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { t, type Locale } from '../../i18n';
import type { AiConversationManagementApi } from '../../hooks/ai/aiConversationManager.types';
import {
  filterConversationsBySearch,
  loadRecentMessageBodiesByConversation,
  normalizeConversationSearchQuery,
} from '../../hooks/ai/conversationSearch';
import { isPersistedTitleEmptyOrDefault } from '../../hooks/ai/conversationTitleGeneration';
import { AiConversationListGroup } from './AiConversationListGroup';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import { JIEYU_MATERIAL_INLINE } from '../../utils/jieyuMaterialIcon';

export function AiConversationListPopover({
  locale,
  management,
  groupLabel,
  archivedGroupLabel,
  onStartNewConversation,
  onSelectConversation,
  onClose,
  titleButtonRef,
}: {
  locale: Locale;
  management: AiConversationManagementApi;
  groupLabel: string;
  archivedGroupLabel: string;
  onStartNewConversation: () => void | Promise<void>;
  onSelectConversation: (conversationId: string) => void | Promise<void>;
  onClose: () => void;
  titleButtonRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const popoverId = useId();
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [messageBodiesByConversationId, setMessageBodiesByConversationId] = useState<
    Map<string, string[]>
  >(new Map());

  const normalizedSearch = normalizeConversationSearchQuery(searchQuery);
  const searchEnabled = normalizedSearch.length > 0;

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (popoverRef.current?.contains(target)) return;
      if (titleButtonRef?.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [onClose, titleButtonRef]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
      titleButtonRef?.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, titleButtonRef]);

  useEffect(() => {
    let cancelled = false;
    const ids = [
      ...management.conversations.map((item) => item.id),
      ...(showArchived ? management.archivedConversations.map((item) => item.id) : []),
    ];
    if (ids.length === 0) {
      setMessageBodiesByConversationId(new Map());
      return () => {
        cancelled = true;
      };
    }
    void loadRecentMessageBodiesByConversation(ids).then((map) => {
      if (!cancelled) setMessageBodiesByConversationId(map);
    });
    return () => {
      cancelled = true;
    };
  }, [management.archivedConversations, management.conversations, showArchived]);

  const filteredActive = useMemo(
    () =>
      filterConversationsBySearch(
        management.conversations,
        searchQuery,
        messageBodiesByConversationId,
      ),
    [management.conversations, messageBodiesByConversationId, searchQuery],
  );

  const filteredArchived = useMemo(
    () =>
      filterConversationsBySearch(
        management.archivedConversations,
        searchQuery,
        messageBodiesByConversationId,
      ),
    [management.archivedConversations, messageBodiesByConversationId, searchQuery],
  );

  const switchLabel = t(locale, 'ai.chat.conversationList.switchConversation');
  const listEmpty = filteredActive.length === 0 && (!showArchived || filteredArchived.length === 0);

  const resolveItemTitle = (item: (typeof management.conversations)[number]) => {
    if (
      isPersistedTitleEmptyOrDefault(item.title, locale) &&
      (messageBodiesByConversationId.get(item.id)?.length ?? 0) > 0
    ) {
      return t(locale, 'ai.chat.conversationList.titleGenerating');
    }
    return item.title;
  };

  return (
    <div
      ref={popoverRef}
      id={popoverId}
      className="ai-conversation-list-popover"
      role="dialog"
      aria-label={t(locale, 'ai.chat.conversationList.openList')}
    >
      <div className="ai-conversation-list-popover-toolbar">
        <button
          type="button"
          className="ai-conversation-list-new-btn"
          onClick={() => void onStartNewConversation()}
        >
          <MaterialSymbol name="add" className={JIEYU_MATERIAL_INLINE} aria-hidden />
          {t(locale, 'ai.chat.conversationList.newConversation')}
        </button>
        <input
          type="search"
          className="ai-conversation-list-search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.currentTarget.value)}
          placeholder={t(locale, 'ai.chat.conversationList.searchPlaceholder')}
          aria-label={t(locale, 'ai.chat.conversationList.searchPlaceholder')}
        />
      </div>
      <div className="ai-conversation-list-popover-meta">
        <button
          type="button"
          className="ai-conversation-list-view-archived-btn"
          onClick={() => setShowArchived((prev) => !prev)}
          aria-pressed={showArchived}
        >
          {showArchived
            ? t(locale, 'ai.chat.conversationList.hideArchived')
            : t(locale, 'ai.chat.conversationList.viewArchived')}
        </button>
      </div>
      {listEmpty ? (
        <p className="ai-conversation-list-empty small-text">
          {searchEnabled
            ? t(locale, 'ai.chat.conversationList.searchNoResults')
            : t(locale, 'ai.chat.conversationList.empty')}
        </p>
      ) : (
        <>
          <AiConversationListGroup
            locale={locale}
            groupLabel={groupLabel}
            items={filteredActive}
            activeConversationId={management.activeConversationId}
            onSelectConversation={onSelectConversation}
            switchLabel={switchLabel}
            showItemActions
            itemActionVariant="active"
            onArchiveConversation={management.archiveConversation}
            onDeleteConversation={management.deleteConversation}
            resolveItemTitle={resolveItemTitle}
          />
          {showArchived ? (
            <AiConversationListGroup
              locale={locale}
              groupLabel={archivedGroupLabel}
              items={filteredArchived}
              activeConversationId={management.activeConversationId}
              onSelectConversation={onSelectConversation}
              switchLabel={switchLabel}
              showItemActions
              itemActionVariant="archived"
              onDeleteConversation={management.deleteConversation}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
