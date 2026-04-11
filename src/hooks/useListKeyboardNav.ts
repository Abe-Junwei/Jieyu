/**
 * 列表键盘导航 hook：ArrowUp/Down 在列表项间移动焦点、Enter 触发选中
 * List keyboard navigation hook: ArrowUp/Down to move focus between items, Enter to select
 */
import { useCallback, useRef, useState } from 'react';

export interface UseListKeyboardNavOptions<T> {
  /** 当前可见列表 | Current visible list */
  items: readonly T[];
  /** 获取项 ID | Get item ID */
  getItemId: (item: T) => string;
  /** 选中回调 | Selection callback */
  onSelect: (id: string) => void;
}

export interface UseListKeyboardNavResult {
  /** 当前焦点高亮索引（-1 表示无高亮） | Current focus-highlighted index (-1 = none) */
  activeIndex: number;
  /** 绑定到搜索 input 的 onKeyDown | Bind to search input's onKeyDown */
  handleSearchKeyDown: (event: React.KeyboardEvent) => void;
  /** 列表容器 ref（用于滚动到可见区域） | list container ref for scrollIntoView */
  listRef: React.RefObject<HTMLDivElement | null>;
  /** 清除高亮（列表变化时调用） | Clear highlight (call on list change) */
  resetActiveIndex: () => void;
}

export function useListKeyboardNav<T>({
  items,
  getItemId,
  onSelect,
}: UseListKeyboardNavOptions<T>): UseListKeyboardNavResult {
  const [activeIndex, setActiveIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement | null>(null);

  // 用 ref 保持 onSelect/getItemId 最新，避免频繁重建回调 | Keep latest via ref to avoid callback churn
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const getItemIdRef = useRef(getItemId);
  getItemIdRef.current = getItemId;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  const scrollToIndex = useCallback((index: number) => {
    const container = listRef.current;
    if (!container) return;
    const children = container.querySelectorAll<HTMLElement>('[role="listitem"], button');
    const target = children[index];
    if (target) {
      target.scrollIntoView({ block: 'nearest' });
    }
  }, []);

  const handleSearchKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const currentItems = itemsRef.current;
      if (currentItems.length === 0) return;

      switch (event.key) {
        case 'ArrowDown': {
          event.preventDefault();
          const next = activeIndexRef.current < currentItems.length - 1 ? activeIndexRef.current + 1 : 0;
          setActiveIndex(next);
          scrollToIndex(next);
          break;
        }
        case 'ArrowUp': {
          event.preventDefault();
          const prevIdx = activeIndexRef.current > 0 ? activeIndexRef.current - 1 : currentItems.length - 1;
          setActiveIndex(prevIdx);
          scrollToIndex(prevIdx);
          break;
        }
        case 'Enter': {
          event.preventDefault();
          const idx = activeIndexRef.current >= 0 && activeIndexRef.current < currentItems.length ? activeIndexRef.current : 0;
          const item = currentItems[idx];
          if (item) {
            onSelectRef.current(getItemIdRef.current(item));
          }
          break;
        }
        // 其他按键不处理 | Other keys: no-op
      }
    },
    [scrollToIndex],
  );

  const resetActiveIndex = useCallback(() => {
    setActiveIndex(-1);
  }, []);

  return { activeIndex, handleSearchKeyDown, listRef, resetActiveIndex };
}
