// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DbIntegrityBlockingOverlay } from './DbIntegrityBlockingOverlay';

let offsetParentDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  offsetParentDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() {
      return document.body;
    },
  });
});

afterEach(() => {
  cleanup();
  if (offsetParentDescriptor) {
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', offsetParentDescriptor);
  } else {
    delete (HTMLElement.prototype as { offsetParent?: Element | null }).offsetParent;
  }
});

describe('DbIntegrityBlockingOverlay', () => {
  it('does not show restore button when onRestoreFromBackup is absent', () => {
    render(
      <DbIntegrityBlockingOverlay
        locale="zh-CN"
        failureKind="open"
        reason="open failed"
        onReload={vi.fn()}
        onRetry={vi.fn()}
        onContinueSession={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /从迁移前备份恢复/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /刷新页面/i })).toBeInTheDocument();
  });

  it('traps focus inside the blocking alertdialog', async () => {
    render(
      <>
        <button type="button">Background action</button>
        <DbIntegrityBlockingOverlay
          locale="zh-CN"
          failureKind="open"
          reason="open failed"
          onReload={vi.fn()}
          onRetry={vi.fn()}
          onContinueSession={vi.fn()}
          onRestoreFromBackup={vi.fn()}
        />
      </>,
    );

    const dialog = screen.getByRole('alertdialog');
    const buttons = within(dialog).getAllByRole('button');
    const firstButton = buttons[0]!;
    const lastButton = buttons[buttons.length - 1]!;

    await waitFor(() => expect(document.activeElement).toBe(firstButton));

    lastButton.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(firstButton);

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(lastButton);
    expect(document.activeElement).not.toHaveTextContent('Background action');
  });
});
