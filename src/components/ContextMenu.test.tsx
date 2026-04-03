// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContextMenu } from './ContextMenu';

afterEach(() => {
  cleanup();
});

describe('ContextMenu', () => {
  it('renders fixed menu shell with clamped position and submenu structure', () => {
    const onClose = vi.fn();
    const onChange = vi.fn();

    render(
      <ContextMenu
        x={2}
        y={4}
        onClose={onClose}
        items={[
          {
            label: '导出',
            submenuClassName: 'context-menu-submenu-export',
            children: [
              {
                label: '查找项目',
                searchField: {
                  value: '词',
                  placeholder: '输入关键字',
                  onChange,
                },
              },
              {
                label: '删除导出项',
                danger: true,
                shortcut: 'Del',
                separatorBefore: true,
              },
            ],
          },
          {
            label: '当前方案',
            selectionState: 'selected',
            selectionVariant: 'check',
            meta: '已启用',
          },
        ]}
      />,
    );

    const rootMenu = screen.getAllByRole('menu')[0] as HTMLDivElement;
    const selectedItem = screen.getByRole('menuitem', { name: /当前方案/ });

    expect(rootMenu).toBeTruthy();
    expect(rootMenu.getAttribute('role')).toBe('menu');
    expect(rootMenu.style.position).toBe('fixed');
    expect(rootMenu.style.left).toBe('8px');
    expect(rootMenu.style.top).toBe('8px');
    expect(selectedItem.querySelector('.context-menu-item-selection-check.context-menu-item-selection-selected')).toBeTruthy();
    expect(selectedItem.querySelector('.context-menu-item-meta')?.textContent).toContain('已启用');

    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: /^导出/ }));

    const submenu = document.querySelector('.context-menu-submenu.context-menu-submenu-export') as HTMLDivElement;
    const searchInput = screen.getByRole('searchbox') as HTMLInputElement;
    const dangerItem = screen.getByRole('menuitem', { name: /删除导出项/ });

    expect(submenu).toBeTruthy();
    expect(submenu.style.position).toBe('fixed');
    expect(searchInput.value).toBe('词');
    expect(dangerItem.className).toContain('context-menu-danger');
    expect(dangerItem.className).toContain('context-menu-item-separator-before');

    fireEvent.change(searchInput, { target: { value: '短语' } });
    expect(onChange).toHaveBeenCalledWith('短语');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('supports nested submenus beyond one level', () => {
    const onLeafClick = vi.fn();
    const onClose = vi.fn();

    render(
      <ContextMenu
        x={40}
        y={24}
        onClose={onClose}
        items={[
          {
            label: '显示样式',
            children: [
              {
                label: '字体',
                children: [
                  {
                    label: '默认（13号）',
                    onClick: onLeafClick,
                  },
                ],
              },
            ],
          },
        ]}
      />,
    );

    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: /^显示样式/ }));
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: /^字体/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: '默认（13号）' }));

    expect(onLeafClick).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders an inline search field without closing the menu', () => {
    const onClose = vi.fn();
    const onChange = vi.fn();

    render(
      <ContextMenu
        x={40}
        y={24}
        onClose={onClose}
        items={[
          {
            label: '字体',
            children: [
              {
                label: '查找字体',
                searchField: {
                  value: 'ping',
                  placeholder: '输入字体名',
                  onChange,
                },
              },
            ],
          },
        ]}
      />,
    );

    const fontMenuItems1 = screen.getAllByRole('menuitem', { name: /^字体/ });
    fireEvent.mouseEnter(fontMenuItems1[fontMenuItems1.length - 1]!);
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'fang' } });

    expect(onChange).toHaveBeenCalledWith('fang');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps the menu open for leaf items marked keepOpen', () => {
    const onClose = vi.fn();
    const onToggle = vi.fn();

    render(
      <ContextMenu
        x={40}
        y={24}
        onClose={onClose}
        items={[
          {
            label: '字体',
            children: [
              {
                label: '显示所有本地字体',
                keepOpen: true,
                onClick: onToggle,
              },
            ],
          },
        ]}
      />,
    );

    const fontMenuItems2 = screen.getAllByRole('menuitem', { name: /^字体/ });
    fireEvent.mouseEnter(fontMenuItems2[fontMenuItems2.length - 1]!);
    fireEvent.click(screen.getByRole('menuitem', { name: '显示所有本地字体' }));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('refreshes opened submenu content when items change', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <ContextMenu
        x={40}
        y={24}
        onClose={onClose}
        items={[
          {
            label: '字体',
            children: [
              {
                label: '初始字体',
              },
            ],
          },
        ]}
      />,
    );

    const fontMenuItems3 = screen.getAllByRole('menuitem', { name: /^字体/ });
    fireEvent.mouseEnter(fontMenuItems3[fontMenuItems3.length - 1]!);
    expect(screen.getByRole('menuitem', { name: '初始字体' })).toBeTruthy();

    rerender(
      <ContextMenu
        x={40}
        y={24}
        onClose={onClose}
        items={[
          {
            label: '字体',
            children: [
              {
                label: '更新字体',
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.queryByRole('menuitem', { name: '初始字体' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: '更新字体' })).toBeTruthy();
  });
});