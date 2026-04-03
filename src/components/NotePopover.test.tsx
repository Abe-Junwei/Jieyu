// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UserNoteDocType } from '../db';
import { LocaleProvider } from '../i18n';
import { NotePopover } from './NotePopover';

afterEach(() => {
  cleanup();
});

describe('NotePopover', () => {
  it('renders dialog mode through compact DialogShell structure', () => {
    const view = render(
      <LocaleProvider locale="zh-CN">
        <NotePopover
          x={120}
          y={80}
          displayMode="dialog"
          notes={[] as UserNoteDocType[]}
          targetLabel="测试目标"
          onClose={vi.fn()}
          onAdd={vi.fn(async () => undefined)}
          onUpdate={vi.fn(async () => undefined)}
          onDelete={vi.fn(async () => undefined)}
        />
      </LocaleProvider>,
    );

    const dialog = screen.getByRole('dialog');
    const overlay = dialog.parentElement?.parentElement as HTMLDivElement;
    const addButton = screen.getByRole('button', { name: '新增备注' });
    const closeButton = screen.getByRole('button', { name: '关闭备注面板' });

    expect(dialog.className).toContain('dialog-card');
    expect(dialog.className).toContain('dialog-card-compact');
    expect(dialog.className).toContain('note-popover-dialog');
    expect(overlay.className).toContain('dialog-overlay-topmost');
    expect(closeButton.closest('.dialog-header')).toBeTruthy();
    expect(addButton.className).toContain('panel-button--primary');
    expect(view.container.querySelector('.note-popover')).toBeTruthy();
  });

  it('closes popover after adding a note with add button', async () => {
    const onClose = vi.fn();
    const onAdd = vi.fn(async () => undefined);

    render(
      <LocaleProvider locale="zh-CN">
        <NotePopover
          x={120}
          y={80}
          notes={[] as UserNoteDocType[]}
          targetLabel="测试目标"
          onClose={onClose}
          onAdd={onAdd}
          onUpdate={vi.fn(async () => undefined)}
          onDelete={vi.fn(async () => undefined)}
        />
      </LocaleProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText(/输入新备注|添加备注/u), {
      target: { value: '新备注' },
    });

      fireEvent.click(screen.getByRole('button', { name: /\u65b0\u589e\u5907\u6ce8|\u6dfb\u52a0/ }));

    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledWith({ default: '新备注' }, 'comment');
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
