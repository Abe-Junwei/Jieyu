import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Library } from 'lucide-react';
import { JIEYU_LUCIDE_NAV } from '../utils/jieyuLucideIcon';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { t, type Locale } from '../i18n';

export type LeftRailResourceItem = {
  to: string;
  label: string;
};

type LeftRailResourcesMenuProps = {
  locale: Locale;
  items: LeftRailResourceItem[];
  isItemActive: (to: string) => boolean;
  onPick: (to: string) => void;
};

export function LeftRailResourcesMenu({
  locale,
  items,
  isItemActive,
  onPick,
}: LeftRailResourcesMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [panelPosition, setPanelPosition] = useState({ top: 88, left: 88 });

  const syncPanelPosition = useCallback(() => {
    const anchor = buttonRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setPanelPosition({ top: rect.bottom - 2, left: rect.right + 6 });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    syncPanelPosition();
    const handleWindowChange = () => {
      syncPanelPosition();
    };
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);
    return () => {
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
    };
  }, [isOpen, syncPanelPosition]);

  const menuItems = useMemo<ContextMenuItem[]>(
    () =>
      items.map((item) => ({
        label: item.label,
        onClick: () => onPick(item.to),
      })),
    [items, onPick],
  );

  const anyActive = items.some((item) => isItemActive(item.to));

  return (
    <div className="left-rail-resources-root">
      <button
        ref={buttonRef}
        type="button"
        className={`left-rail-btn left-rail-btn-utility ${anyActive ? 'left-rail-btn-active' : ''}`}
        aria-label={t(locale, 'app.leftRail.resources')}
        title={t(locale, 'app.leftRail.resources')}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => {
          setIsOpen((prev) => {
            const next = !prev;
            if (next) syncPanelPosition();
            return next;
          });
        }}
      >
        <Library aria-hidden className={JIEYU_LUCIDE_NAV} />
        <span>{t(locale, 'app.leftRail.resourcesShort')}</span>
      </button>
      {isOpen ? (
        <ContextMenu
          x={panelPosition.left}
          y={panelPosition.top}
          items={menuItems}
          anchorOrigin="bottom-left"
          onClose={() => setIsOpen(false)}
        />
      ) : null}
    </div>
  );
}
