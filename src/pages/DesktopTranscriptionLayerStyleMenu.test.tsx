/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopLayerHeaderMenu } from './DesktopTranscriptionLayerStyleMenu';
import type { LayerCommandItem } from './desktopTranscriptionLayerCommands';

const fields = {
  languageId: null,
  orthographyId: null,
  orthographyName: '',
  scriptTag: null,
  displayFont: null,
  displayFontSize: null,
  displayBold: false,
  displayItalic: false,
};

const commands: LayerCommandItem[] = [
  { id: 'up', label: '上移' },
  { id: 'return', label: '回到顶层', disabledReason: '已经在顶层' },
  { id: 'delete', label: '删除', danger: true, ruleBefore: true },
];

describe('DesktopLayerHeaderMenu', () => {
  afterEach(() => cleanup());

  it('puts layer commands under 层', () => {
    const onCommand = vi.fn();
    render(
      <DesktopLayerHeaderMenu
        locale="zh-CN"
        x={20}
        y={20}
        onCollapse={() => undefined}
        commands={commands}
        onCommand={onCommand}
      />,
    );
    expect(screen.queryByRole('menuitem', { name: '上移' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^层$/ }));
    const back = screen.getByRole('menuitem', { name: '回到顶层' });
    expect(back).toHaveAccessibleDescription('已经在顶层');
    expect(back).toHaveAttribute('title', '已经在顶层');
    fireEvent.click(back);
    expect(onCommand).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('menuitem', { name: '上移' }));
    expect(onCommand).toHaveBeenCalledWith('up');
    expect(screen.getAllByRole('menuitem', { name: '删除' })).toHaveLength(1);
  });

  it('nests speaker tracks and shows the current mode', () => {
    const onMode = vi.fn();
    const onLock = vi.fn();
    render(
      <DesktopLayerHeaderMenu
        locale="zh-CN"
        x={20}
        y={20}
        onCollapse={() => undefined}
        lane={{ mode: 'auto', conflicts: true, onMode, onLock, onClearConflicts: vi.fn() }}
      />,
    );
    expect(screen.queryByRole('menuitemradio', { name: '单轨' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /说话人轨道/ }));
    expect(screen.getByRole('menuitemradio', { name: '自动分轨' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.click(screen.getByRole('menuitemradio', { name: '一人一轨' }));
    expect(onMode).toHaveBeenCalledWith('one-per-speaker');
    fireEvent.click(screen.getByRole('menuitem', { name: '锁定到这一行' }));
    expect(onLock).toHaveBeenCalled();
    expect(screen.getByRole('menuitem', { name: '解除这几人的锁定' })).toBeTruthy();
  });

  it('disables lock while the layer is a single row', () => {
    const onLock = vi.fn();
    render(
      <DesktopLayerHeaderMenu
        locale="zh-CN"
        x={20}
        y={20}
        onCollapse={() => undefined}
        lane={{
          mode: 'single',
          conflicts: false,
          onMode: vi.fn(),
          onLock,
          onClearConflicts: vi.fn(),
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /说话人轨道/ }));
    const lock = screen.getByRole('menuitem', { name: '锁定到这一行' });
    expect(lock).toHaveAttribute('aria-disabled', 'true');
    expect(lock).toHaveAccessibleDescription('单轨只有一行，不用锁定');
    fireEvent.click(lock);
    expect(onLock).not.toHaveBeenCalled();
  });

  it('closes the previous submenu when another one opens', () => {
    render(
      <DesktopLayerHeaderMenu
        locale="zh-CN"
        x={20}
        y={20}
        onCollapse={() => undefined}
        commands={commands}
        onCommand={vi.fn()}
        lane={{
          mode: 'single',
          conflicts: false,
          onMode: vi.fn(),
          onLock: vi.fn(),
          onClearConflicts: vi.fn(),
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^层$/ }));
    expect(screen.getByRole('menuitem', { name: '上移' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /说话人轨道/ }));
    expect(screen.queryByRole('menuitem', { name: '上移' })).toBeNull();
    expect(screen.getByRole('menuitemradio', { name: '单轨' })).toBeTruthy();
  });

  it('keeps delete and orthography on the root', async () => {
    const onCommand = vi.fn();
    const onApply = vi.fn();
    render(
      <DesktopLayerHeaderMenu
        locale="zh-CN"
        x={20}
        y={20}
        onCollapse={() => undefined}
        commands={commands}
        onCommand={onCommand}
        fields={{ ...fields, languageId: 'lang-1', orthographyName: '木雅文' }}
        loadOrthographies={async () => [
          { id: 'ortho-1', name: { zh: '木雅文' }, scriptTag: 'Muya' },
        ]}
        onApply={onApply}
      />,
    );
    const remove = screen.getByRole('menuitem', { name: '删除' });
    expect(remove.className).toContain('is-danger');
    fireEvent.click(screen.getByRole('button', { name: /^层$/ }));
    expect(screen.getAllByRole('menuitem', { name: '删除' })).toHaveLength(1);
    fireEvent.click(remove);
    expect(onCommand).toHaveBeenCalledWith('delete');
    expect(screen.getByRole('button', { name: /正字法/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^样式$/ }));
    expect(screen.getAllByRole('button', { name: /正字法/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /正字法/ }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: '木雅文' }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ orthographyId: 'ortho-1' }));
  });

  it('opens the font list to the side and writes the preset key', () => {
    const onApply = vi.fn();
    render(
      <DesktopLayerHeaderMenu
        locale="zh-CN"
        x={20}
        y={20}
        onCollapse={() => undefined}
        fields={fields}
        loadOrthographies={async () => []}
        onApply={onApply}
      />,
    );
    expect(screen.queryByRole('menuitemradio', { name: 'Charis SIL' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^样式$/ }));
    fireEvent.click(screen.getByRole('button', { name: /字体/ }));
    expect(screen.getByRole('menu', { name: '字体' }).className).toContain(
      'desktop-tx-layer-menu__flyout',
    );
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Charis SIL' }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ displayFont: 'Charis SIL' }));
  });

  it('toggles bold with the circular radio without clearing italic', () => {
    const onApply = vi.fn();
    render(
      <DesktopLayerHeaderMenu
        locale="zh-CN"
        x={20}
        y={20}
        onCollapse={() => undefined}
        fields={{ ...fields, displayItalic: true }}
        loadOrthographies={async () => []}
        onApply={onApply}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^样式$/ }));
    fireEvent.click(screen.getByRole('radio', { name: '粗体' }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ displayBold: true, displayItalic: true }),
    );
    cleanup();
    onApply.mockClear();
    render(
      <DesktopLayerHeaderMenu
        locale="zh-CN"
        x={20}
        y={20}
        onCollapse={() => undefined}
        fields={{ ...fields, displayBold: true }}
        loadOrthographies={async () => []}
        onApply={onApply}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^样式$/ }));
    fireEvent.click(screen.getByRole('radio', { name: '粗体' }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ displayBold: false }));
  });

  it('loads local fonts into the font list', async () => {
    vi.stubGlobal(
      'queryLocalFonts',
      vi.fn(async () => [
        { family: 'Songti SC', postscriptName: 'Songti-SC', fullName: 'Songti SC' },
      ]),
    );
    render(
      <DesktopLayerHeaderMenu
        locale="zh-CN"
        x={20}
        y={20}
        onCollapse={() => undefined}
        fields={fields}
        loadOrthographies={async () => []}
        onApply={() => undefined}
      />,
    );
    expect(screen.queryByRole('button', { name: '本机字体' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^样式$/ }));
    fireEvent.click(screen.getByRole('button', { name: /字体/ }));
    expect(await screen.findByRole('menuitemradio', { name: 'Songti SC' })).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: '查找字体' }), {
      target: { value: '宋' },
    });
    expect(screen.getByRole('menuitemradio', { name: 'Songti SC' })).toBeTruthy();
    expect(screen.queryByRole('menuitemradio', { name: 'Charis SIL' })).toBeNull();
  });
});
