// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n';
import { ShortcutsPanel } from './ShortcutsPanel';

afterEach(() => {
  cleanup();
});

describe('ShortcutsPanel', () => {
  function renderPanel(onClose = vi.fn()) {
    render(
      <LocaleProvider locale="zh-CN">
        <ShortcutsPanel onClose={onClose} />
      </LocaleProvider>,
    );
    return onClose;
  }

  it('renders through DialogShell with keyboard groups', () => {
    renderPanel();

    const dialog = screen.getByRole('dialog', { name: '键盘快捷键' });
    const closeButton = screen.getByRole('button', { name: '关闭快捷键面板' });
    const keycaps = document.querySelectorAll('kbd');

    expect(dialog.className).toContain('dialog-card');
    expect(dialog.className).toContain('shortcuts-panel');
    expect(closeButton.closest('.dialog-header')).toBeTruthy();
    expect(screen.getByText('播放控制')).toBeTruthy();
    expect(screen.getByText('编辑操作')).toBeTruthy();
    expect(keycaps.length).toBeGreaterThan(0);
  });

  it('closes from overlay click and close button', () => {
    const onClose = renderPanel();

    const dialog = screen.getByRole('dialog', { name: '键盘快捷键' });
    fireEvent.click(screen.getByRole('button', { name: '关闭快捷键面板' }));
    fireEvent.click(dialog.parentElement as HTMLDivElement);

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});