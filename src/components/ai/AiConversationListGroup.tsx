import type { Locale } from '../../i18n';
import type { AiConversationListItem as AiConversationListItemData } from '../../hooks/ai/aiConversationManager.types';
import { AiConversationListItem } from './AiConversationListItem';

export function AiConversationListGroup({
  locale,
  groupLabel,
  items,
  activeConversationId,
  onSelectConversation,
  switchLabel,
  onArchiveConversation,
  onDeleteConversation,
  showItemActions = false,
  itemActionVariant = 'active',
  resolveItemTitle,
}: {
  locale: Locale;
  groupLabel: string;
  items: AiConversationListItemData[];
  activeConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  switchLabel: string;
  onArchiveConversation?: (conversationId: string) => void | Promise<void>;
  onDeleteConversation?: (conversationId: string) => void | Promise<void>;
  showItemActions?: boolean;
  /** Archived rows only expose delete (G2a). */
  itemActionVariant?: 'active' | 'archived';
  resolveItemTitle?: (item: AiConversationListItemData) => string;
}) {
  if (items.length === 0) return null;
  return (
    <section className="ai-conversation-list-group">
      <h3 className="ai-conversation-list-group-label">{groupLabel}</h3>
      <div className="ai-conversation-list-group-items">
        {items.map((item) => (
          <AiConversationListItem
            key={item.id}
            locale={locale}
            item={item}
            isActive={item.id === activeConversationId}
            onSelect={() => onSelectConversation(item.id)}
            switchLabel={switchLabel}
            showActions={showItemActions}
            {...(itemActionVariant === 'active' && onArchiveConversation
              ? { onArchive: () => onArchiveConversation(item.id) }
              : {})}
            {...(onDeleteConversation ? { onDelete: () => onDeleteConversation(item.id) } : {})}
            {...(resolveItemTitle ? { displayTitle: resolveItemTitle(item) } : {})}
          />
        ))}
      </div>
    </section>
  );
}
