import { MaterialSymbol } from '../ui/MaterialSymbol';
import { JIEYU_MATERIAL_INLINE } from '../../utils/jieyuMaterialIcon';
import type { AiConversationListItem as AiConversationListItemData } from '../../hooks/ai/aiConversationManager.types';
import { AiConversationActionMenu } from './AiConversationActionMenu';
import type { Locale } from '../../i18n';

export function AiConversationListItem({
  locale,
  item,
  isActive,
  onSelect,
  switchLabel,
  onArchive,
  onDelete,
  showActions = false,
  displayTitle,
}: {
  locale: Locale;
  item: AiConversationListItemData;
  isActive: boolean;
  onSelect: () => void;
  switchLabel: string;
  onArchive?: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  showActions?: boolean;
  displayTitle?: string;
}) {
  const titleLabel = displayTitle ?? item.title;
  return (
    <div className={`ai-conversation-list-item-row ${isActive ? 'is-active' : ''}`}>
      <button
        type="button"
        className="ai-conversation-list-item"
        onClick={onSelect}
        aria-current={isActive ? 'true' : undefined}
        aria-label={`${switchLabel}: ${titleLabel}`}
      >
        <span className="ai-conversation-list-item-title">{titleLabel}</span>
        {isActive ? (
          <MaterialSymbol name="check" className={JIEYU_MATERIAL_INLINE} aria-hidden />
        ) : null}
      </button>
      {showActions && onArchive && onDelete ? (
        <AiConversationActionMenu
          locale={locale}
          conversationTitle={titleLabel}
          onArchive={onArchive}
          onDelete={onDelete}
        />
      ) : null}
    </div>
  );
}
