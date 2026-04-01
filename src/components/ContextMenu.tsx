import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface OpenSubmenu {
  path: number[];
  anchorEl: HTMLElement;
  left: number;
  top: number;
}

export interface ContextMenuItem {
  id?: string;
  label: string;
  icon?: ReactNode;
  submenuClassName?: string;
  selectionState?: 'selected' | 'unselected';
  selectionVariant?: 'dot' | 'check';
  meta?: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  variant?: 'default' | 'category';
  separatorBefore?: boolean;
  keepOpen?: boolean;
  onClick?: () => void;
  children?: ContextMenuItem[];
  searchField?: {
    value: string;
    placeholder?: string;
    onChange: (nextValue: string) => void;
  };
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
  anchorOrigin?: 'top-left' | 'bottom-left';
}

export const ContextMenu = memo(function ContextMenu({ x, y, items, onClose, anchorOrigin = 'top-left' }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const submenuRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [position, setPosition] = useState(() => ({ left: x, top: y }));
  const [submenus, setSubmenus] = useState<OpenSubmenu[]>([]);
  const [layoutVersion, setLayoutVersion] = useState(0);

  const requestLayoutRecalc = () => {
    setLayoutVersion((prev) => prev + 1);
  };

  const getItemAtPath = (path: number[]): ContextMenuItem | undefined => {
    let currentItems = items;
    let currentItem: ContextMenuItem | undefined;
    for (const index of path) {
      currentItem = currentItems[index];
      if (!currentItem) return undefined;
      currentItems = currentItem.children ?? [];
    }
    return currentItem;
  };

  const getChildrenAtPath = (path: number[]): ContextMenuItem[] => {
    return getItemAtPath(path)?.children ?? [];
  };

  useEffect(() => {
    setSubmenus([]);
  }, [x, y]);

  useEffect(() => {
    setSubmenus((prev) => {
      const next = prev.filter((submenu) => getChildrenAtPath(submenu.path).length > 0);
      return next.length === prev.length ? prev : next;
    });
    requestLayoutRecalc();
  }, [items]);

  useEffect(() => {
    const handleWindowChange = () => {
      requestLayoutRecalc();
    };
    window.addEventListener('resize', handleWindowChange);
    return () => {
      window.removeEventListener('resize', handleWindowChange);
    };
  }, []);

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
    const anchoredTop = anchorOrigin === 'bottom-left' ? y - height : y;

    setPosition({
      left: Math.min(Math.max(margin, x), maxLeft),
      top: Math.min(Math.max(margin, anchoredTop), maxTop),
    });
  }, [anchorOrigin, x, y, items.length]);

  const computeSubmenuPosition = (anchorEl: HTMLElement, panel: HTMLDivElement | null) => {
    const margin = 8;
    const gap = 4;
    const targetRect = anchorEl.getBoundingClientRect();
    const fallbackWidth = 180;
    const fallbackHeight = 120;
    const measuredWidth = panel?.offsetWidth ?? fallbackWidth;
    const measuredHeight = panel?.offsetHeight ?? fallbackHeight;

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

    return { left, top };
  };

  useLayoutEffect(() => {
    if (submenus.length === 0) return;
    setSubmenus((prev) => {
      let changed = false;
      const next: OpenSubmenu[] = [];
      prev.forEach((submenu, index) => {
        if (getChildrenAtPath(submenu.path).length === 0) {
          changed = true;
          return;
        }
        const panel = submenuRefs.current[index] ?? null;
        const position = computeSubmenuPosition(submenu.anchorEl, panel);
        if (position.left !== submenu.left || position.top !== submenu.top) {
          changed = true;
          next.push({ ...submenu, ...position });
          return;
        }
        next.push(submenu);
      });
      return changed ? next : prev;
    });
  }, [layoutVersion, submenus.length, items]);

  const openSubmenuForItem = (itemPath: number[], target: HTMLElement, depth: number) => {
    const children = getChildrenAtPath(itemPath);
    if (children.length === 0) {
      setSubmenus((prev) => prev.slice(0, depth));
      return;
    }
    const position = computeSubmenuPosition(target, submenuRefs.current[depth] ?? null);

    setSubmenus((prev) => {
      const next = prev.slice(0, depth);
      next[depth] = {
        path: itemPath,
        anchorEl: target,
        ...position,
      };
      return next;
    });
  };

  const toggleSubmenuForItem = (itemPath: number[], target: HTMLElement, depth: number) => {
    if (getChildrenAtPath(itemPath).length === 0) return;
    const openedPath = submenus[depth]?.path;
    if (openedPath && openedPath.length === itemPath.length && openedPath.every((value, index) => value === itemPath[index])) {
      setSubmenus((prev) => prev.slice(0, depth));
      return;
    }
    openSubmenuForItem(itemPath, target, depth);
  };

  useEffect(() => {
    const handler = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key === 'Escape') { onClose(); return; }
      if (e instanceof MouseEvent) {
        const targetNode = e.target as Node;
        const inMain = ref.current?.contains(targetNode) ?? false;
        const inSubmenu = submenuRefs.current.some((panel) => panel?.contains(targetNode) ?? false);
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

  const renderMenuItems = (menuItems: ContextMenuItem[], depth: number, parentPath: number[] = []) => menuItems.map((item, index) => {
    const itemPath = [...parentPath, index];
    if (item.searchField) {
      return (
        <div
          key={item.id ?? `${item.label}-${index}`}
          className={[
            'context-menu-search',
            item.separatorBefore ? 'context-menu-item-separator-before' : '',
          ].filter(Boolean).join(' ')}
          role="none"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <label className="context-menu-search-label">
            <span className="context-menu-search-title">{item.label}</span>
            <input
              type="search"
              className="context-menu-search-input"
              value={item.searchField.value}
              placeholder={item.searchField.placeholder}
              onChange={(e) => item.searchField?.onChange(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </label>
        </div>
      );
    }

    return (
      <button
        key={item.id ?? `${item.label}-${index}`}
        className={[
          'context-menu-item',
          item.danger ? 'context-menu-danger' : '',
          item.variant === 'category' ? 'context-menu-item-category' : '',
          item.separatorBefore ? 'context-menu-item-separator-before' : '',
        ].filter(Boolean).join(' ')}
        disabled={item.disabled}
        role="menuitem"
        aria-haspopup={item.children && item.children.length > 0 ? 'menu' : undefined}
        aria-expanded={item.children && item.children.length > 0 ? Boolean(submenus[depth]?.path && submenus[depth]?.path.length === itemPath.length && submenus[depth]?.path.every((value, pathIndex) => value === itemPath[pathIndex])) : undefined}
        onMouseEnter={(e) => openSubmenuForItem(itemPath, e.currentTarget, depth)}
        onFocus={(e) => openSubmenuForItem(itemPath, e.currentTarget, depth)}
        onClick={(e) => {
          if (item.children && item.children.length > 0) {
            toggleSubmenuForItem(itemPath, e.currentTarget, depth);
            return;
          }
          item.onClick?.();
          if (!item.keepOpen) {
            onClose();
          }
          requestLayoutRecalc();
        }}
        onMouseDown={(e) => {
          if (item.children && item.children.length > 0) {
            e.preventDefault();
            toggleSubmenuForItem(itemPath, e.currentTarget, depth);
          }
        }}
      >
        <span className="context-menu-item-main">
          {item.selectionState ? (
            <span
              className={[
                'context-menu-item-selection',
                item.selectionVariant === 'check' ? 'context-menu-item-selection-check' : 'context-menu-item-selection-dot',
                item.selectionState === 'selected' ? 'context-menu-item-selection-selected' : '',
              ].filter(Boolean).join(' ')}
              aria-hidden="true"
            />
          ) : item.icon ? <span className="context-menu-item-icon" aria-hidden="true">{item.icon}</span> : null}
          <span>{item.label}</span>
        </span>
        <span className="context-menu-item-trailing">
          {item.meta ? <span className="context-menu-item-meta">{item.meta}</span> : null}
          {item.children && item.children.length > 0
            ? <span className="context-menu-caret">›</span>
            : item.shortcut && <span className="context-menu-shortcut">{item.shortcut}</span>}
        </span>
      </button>
    );
  });

  const node = (
    <>
      <div ref={ref} className="context-menu" style={style} role="menu" onScroll={requestLayoutRecalc}>
        {renderMenuItems(items, 0)}
      </div>

      {submenus.map((submenu, index) => {
        const submenuItems = getChildrenAtPath(submenu.path);
        const submenuOwner = getItemAtPath(submenu.path);
        if (submenuItems.length === 0) return null;
        return (
          <div
            key={`submenu-${submenu.path.join('-')}`}
            ref={(node) => {
              submenuRefs.current[index] = node;
            }}
            className={[
              'context-menu',
              'context-menu-submenu',
              submenuOwner?.submenuClassName ?? '',
            ].filter(Boolean).join(' ')}
            style={{
              position: 'fixed',
              left: submenu.left,
              top: submenu.top,
              zIndex: 10000 + index,
            }}
            role="menu"
            onScroll={requestLayoutRecalc}
          >
            {renderMenuItems(submenuItems, index + 1, submenu.path)}
          </div>
        );
      })}
    </>
  );

  if (typeof document === 'undefined' || !document.body) {
    return node;
  }

  return createPortal(node, document.body);
});
