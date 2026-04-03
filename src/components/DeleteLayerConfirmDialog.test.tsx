// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeleteLayerConfirmDialog } from './DeleteLayerConfirmDialog';
import { LocaleProvider } from '../i18n';

afterEach(() => {
  cleanup();
});

describe('DeleteLayerConfirmDialog', () => {
  function renderDialog(props: React.ComponentProps<typeof DeleteLayerConfirmDialog>) {
    render(
      <LocaleProvider locale="zh-CN">
        <DeleteLayerConfirmDialog {...props} />
      </LocaleProvider>,
    );
  }

  it('does not render when open is false', () => {
    renderDialog(
      {
        open: false,
        layerName: '测试层',
        layerType: 'translation',
        textCount: 0,
        onCancel: vi.fn(),
        onConfirm: vi.fn(),
      },
    );

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders translation layer details and no destructive hint when text count is 0', () => {
    renderDialog(
      {
        open: true,
        layerName: '日语翻译',
        layerType: 'translation',
        textCount: 0,
        onCancel: vi.fn(),
        onConfirm: vi.fn(),
      },
    );

    const dialog = screen.getByRole('dialog');
    const cancelButton = screen.getByRole('button', { name: '取消' });
    const confirmButton = screen.getByRole('button', { name: '确认删除' });

    expect(dialog.className).toContain('dialog-card');
    expect(dialog.className).toContain('delete-layer-confirm-dialog');
    expect(cancelButton.className).toContain('panel-button--ghost');
    expect(confirmButton.className).toContain('panel-button--danger');
    expect(screen.getByText('确定要删除层「日语翻译」吗？')).toBeTruthy();
    expect(screen.getByText(/类型：翻译层/)).toBeTruthy();
    expect(screen.getByText(/文本记录：0 条/)).toBeTruthy();
    expect(screen.queryByText('删除后将无法恢复这些文本内容。')).toBeNull();
  });

  it('shows destructive hint when text count is greater than 0', () => {
    renderDialog(
      {
        open: true,
        layerName: '默认转写',
        layerType: 'transcription',
        textCount: 3,
        onCancel: vi.fn(),
        onConfirm: vi.fn(),
      },
    );

    expect(screen.getByText(/类型：转写层/)).toBeTruthy();
    expect(screen.getByText(/文本记录：3 条/)).toBeTruthy();
    expect(screen.getByText('删除后将无法恢复这些文本内容。')).toBeTruthy();
  });

  it('calls onCancel when clicking overlay and cancel button, and onConfirm for confirm button', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    renderDialog(
      {
        open: true,
        layerName: '层 A',
        layerType: 'translation',
        textCount: 1,
        onCancel,
        onConfirm,
      },
    );

    fireEvent.click(screen.getByRole('presentation'));
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));

    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape key press through focus trap', () => {
    const onCancel = vi.fn();

    renderDialog(
      {
        open: true,
        layerName: '层 B',
        layerType: 'translation',
        textCount: 0,
        onCancel,
        onConfirm: vi.fn(),
      },
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders keep-utterances option and emits checkbox state changes', () => {
    const onKeepUtterancesChange = vi.fn();

    renderDialog(
      {
        open: true,
        layerName: '层 C',
        layerType: 'transcription',
        textCount: 2,
        keepUtterances: false,
        onKeepUtterancesChange,
        onCancel: vi.fn(),
        onConfirm: vi.fn(),
      },
    );

    const checkbox = screen.getByRole('checkbox', { name: '保留现有语段区间' });
    fireEvent.click(checkbox);

    expect(onKeepUtterancesChange).toHaveBeenCalledWith(true);
  });
});
