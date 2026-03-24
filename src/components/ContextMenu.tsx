import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export const ContextMenu = memo(function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(() => ({ left: x, top: y }));

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

  useEffect(() => {
    const handler = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key === 'Escape') { onClose(); return; }
      if (e instanceof MouseEvent && ref.current && !ref.current.contains(e.target as Node)) onClose();
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
    <div ref={ref} className="context-menu" style={style} role="menu">
      {items.map((item) => (
        <button
          key={item.label}
          className={`context-menu-item${item.danger ? ' context-menu-danger' : ''}`}
          disabled={item.disabled}
          role="menuitem"
          onClick={() => { item.onClick(); onClose(); }}
        >
          <span>{item.label}</span>
          {item.shortcut && <span className="context-menu-shortcut">{item.shortcut}</span>}
        </button>
      ))}
    </div>
  );

  if (typeof document === 'undefined' || !document.body) {
    return node;
  }

  return createPortal(node, document.body);
});
