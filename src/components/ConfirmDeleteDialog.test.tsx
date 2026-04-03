// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';

afterEach(() => {
  cleanup();
});

describe('ConfirmDeleteDialog', () => {
  it('does not render when open is false', () => {
    render(
      <ConfirmDeleteDialog
        locale="zh-CN"
        open={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders through DialogShell with destructive footer actions', () => {
    render(
      <ConfirmDeleteDialog
        locale="zh-CN"
        open
        title="删除项目"
        description="删除后不可恢复。"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: '删除项目' });
    const cancelButton = screen.getByRole('button', { name: '取消' });
    const confirmButton = screen.getByRole('button', { name: '确认删除' });

    expect(dialog.className).toContain('dialog-card');
    expect(dialog.className).toContain('confirm-delete-dialog');
    expect(cancelButton.className).toContain('panel-button--ghost');
    expect(confirmButton.className).toContain('panel-button--danger');
    expect(screen.getByText('删除后不可恢复。')).toBeTruthy();
  });

  it('handles mute toggle, overlay cancel, and confirm action', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const onMuteChange = vi.fn();

    render(
      <ConfirmDeleteDialog
        locale="zh-CN"
        open
        totalCount={2}
        textCount={1}
        emptyCount={1}
        showMuteOption
        muteInSession={false}
        onMuteChange={onMuteChange}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    fireEvent.click(screen.getByRole('dialog').parentElement as HTMLDivElement);

    expect(onMuteChange).toHaveBeenCalledWith(true);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});