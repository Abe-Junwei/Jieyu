/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopLayerHeaderMenu } from './DesktopTranscriptionLayerStyleMenu';

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

describe('DesktopLayerHeaderMenu', () => {
  afterEach(() => cleanup());

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
    fireEvent.click(screen.getByRole('button', { name: /字体/ }));
    expect(await screen.findByRole('menuitemradio', { name: 'Songti SC' })).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: '查找字体' }), {
      target: { value: '宋' },
    });
    expect(screen.getByRole('menuitemradio', { name: 'Songti SC' })).toBeTruthy();
    expect(screen.queryByRole('menuitemradio', { name: 'Charis SIL' })).toBeNull();
  });
});
