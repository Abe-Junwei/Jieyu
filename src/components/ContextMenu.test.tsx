// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContextMenu } from './ContextMenu';

afterEach(() => {
  cleanup();
});

describe('ContextMenu', () => {
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
                    label: '默认 (13px)',
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
    fireEvent.click(screen.getByRole('menuitem', { name: '默认 (13px)' }));

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

    fireEvent.mouseEnter(screen.getAllByRole('menuitem', { name: /^字体/ }).at(-1)!);
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

    fireEvent.mouseEnter(screen.getAllByRole('menuitem', { name: /^字体/ }).at(-1)!);
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

    fireEvent.mouseEnter(screen.getAllByRole('menuitem', { name: /^字体/ }).at(-1)!);
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