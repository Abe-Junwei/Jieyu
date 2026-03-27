import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
  id?: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick?: () => void;
  children?: ContextMenuItem[];
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export const ContextMenu = memo(function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(() => ({ left: x, top: y }));
  const [submenu, setSubmenu] = useState<{ items: ContextMenuItem[]; left: number; top: number } | null>(null);

  useEffect(() => {
    setSubmenu(null);
  }, [x, y, items]);

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) {
      setPosition({ left: x, top: y });
      return;
    }

    const margin = 8;
    const width = menu.offsetWidth || 180;
    const height = menu.offsetHeight || 120;
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const maxTop = Math.max(margin, window.innerHeight - height - margin);

    setPosition({
      left: Math.min(Math.max(margin, x), maxLeft),
      top: Math.min(Math.max(margin, y), maxTop),
    });
  }, [x, y, items.length]);

  const openSubmenuForItem = (item: ContextMenuItem, target: HTMLElement) => {
    if (!item.children || item.children.length === 0) {
      setSubmenu(null);
      return;
    }

    const margin = 8;
    const gap = 4;
    const targetRect = target.getBoundingClientRect();
    const fallbackWidth = 180;
    const fallbackHeight = Math.max(36, item.children.length * 32 + 8);
    const measuredWidth = submenuRef.current?.offsetWidth ?? fallbackWidth;
    const measuredHeight = submenuRef.current?.offsetHeight ?? fallbackHeight;

    const preferLeft = targetRect.right + gap;
    const maxLeft = window.innerWidth - measuredWidth - margin;
    const minLeft = margin;
    let left = Math.min(Math.max(minLeft, preferLeft), Math.max(minLeft, maxLeft));
    if (preferLeft > maxLeft) {
      left = Math.max(minLeft, targetRect.left - measuredWidth - gap);
    }

    const preferTop = targetRect.top;
    const maxTop = window.innerHeight - measuredHeight - margin;
    const top = Math.min(Math.max(margin, preferTop), Math.max(margin, maxTop));

    setSubmenu({
      items: item.children,
      left,
      top,
    });
  };

  useEffect(() => {
    const handler = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key === 'Escape') { onClose(); return; }
      if (e instanceof MouseEvent) {
        const targetNode = e.target as Node;
        const inMain = ref.current?.contains(targetNode) ?? false;
        const inSubmenu = submenuRef.current?.contains(targetNode) ?? false;
        if (!inMain && !inSubmenu) onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', handler);
    };
  }, [onClose]);

  const style: React.CSSProperties = {
    position: 'fixed',
    left: position.left,
    top: position.top,
    zIndex: 9999,
  };

  const node = (
    <>
      <div ref={ref} className="context-menu" style={style} role="menu">
        {items.map((item, index) => (
          <button
            key={item.id ?? `${item.label}-${index}`}
            className={`context-menu-item${item.danger ? ' context-menu-danger' : ''}`}
            disabled={item.disabled}
            role="menuitem"
            aria-haspopup={item.children && item.children.length > 0 ? 'menu' : undefined}
            onMouseEnter={(e) => openSubmenuForItem(item, e.currentTarget)}
            onClick={() => {
              if (item.children && item.children.length > 0) {
                return;
              }
              item.onClick?.();
              onClose();
            }}
          >
            <span>{item.label}</span>
            {item.children && item.children.length > 0
              ? <span className="context-menu-caret">›</span>
              : item.shortcut && <span className="context-menu-shortcut">{item.shortcut}</span>}
          </button>
        ))}
      </div>

      {submenu && (
        <div
          ref={submenuRef}
          className="context-menu context-menu-submenu"
          style={{
            position: 'fixed',
            left: submenu.left,
            top: submenu.top,
            zIndex: 10000,
          }}
          role="menu"
        >
          {submenu.items.map((item, index) => (
            <button
              key={item.id ?? `${item.label}-${index}`}
              className={`context-menu-item${item.danger ? ' context-menu-danger' : ''}`}
              disabled={item.disabled}
              role="menuitem"
              onClick={() => {
                item.onClick?.();
                onClose();
              }}
            >
              <span>{item.label}</span>
              {item.shortcut && <span className="context-menu-shortcut">{item.shortcut}</span>}
            </button>
          ))}
        </div>
      )}
    </>
  );

  if (typeof document === 'undefined' || !document.body) {
    return node;
  }

  return createPortal(node, document.body);
});
