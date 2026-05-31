import { useCallback, useId, useRef, useState } from 'react';
import { t, type Locale } from '../../i18n';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import { JIEYU_MATERIAL_INLINE } from '../../utils/jieyuMaterialIcon';
import { ModalPanel } from '../ui/ModalPanel';

export function AiConversationActionMenu({
  locale,
  conversationTitle,
  onArchive,
  onDelete,
}: {
  locale: Locale;
  conversationTitle: string;
  onArchive: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
}) {
  const menuId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  return (
    <>
      <div className="ai-conversation-action-menu" ref={menuRef}>
        <button
          type="button"
          className="icon-btn ai-conversation-action-menu-trigger"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-controls={menuId}
          aria-label={t(locale, 'ai.chat.conversationList.moreActions')}
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen((prev) => !prev);
          }}
        >
          <MaterialSymbol name="more_vert" className={JIEYU_MATERIAL_INLINE} />
        </button>
        {menuOpen ? (
          <div
            id={menuId}
            role="menu"
            className="ai-conversation-action-menu-popover"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              className="ai-conversation-action-menu-item"
              onClick={() => {
                closeMenu();
                void onArchive();
              }}
            >
              {t(locale, 'ai.chat.conversationList.archive')}
            </button>
            <button
              type="button"
              role="menuitem"
              className="ai-conversation-action-menu-item ai-conversation-action-menu-item-danger"
              onClick={() => {
                closeMenu();
                setDeleteDialogOpen(true);
              }}
            >
              {t(locale, 'ai.chat.conversationList.delete')}
            </button>
          </div>
        ) : null}
      </div>

      <ModalPanel
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        title={t(locale, 'ai.chat.conversationList.deleteConfirmTitle')}
        compact
        ariaLabel={t(locale, 'ai.chat.conversationList.deleteConfirmTitle')}
        footer={
          <div className="ai-conversation-delete-dialog-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setDeleteDialogOpen(false)}
            >
              {t(locale, 'ai.assistantHub.cancel')}
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={() => {
                setDeleteDialogOpen(false);
                void onDelete();
              }}
            >
              {t(locale, 'ai.chat.conversationList.delete')}
            </button>
          </div>
        }
      >
        <p className="small-text">
          {t(locale, 'ai.chat.conversationList.deleteConfirmBody')}
          <span className="ai-conversation-delete-dialog-title"> {conversationTitle}</span>
        </p>
      </ModalPanel>
    </>
  );
}
