// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioImportDialog } from './AudioImportDialog';
import { renderWithLocale } from '../test/localeTestUtils';

function installMediaMetadataMock(duration = 12.5) {
  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-media');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName === 'audio' || tagName === 'video') {
      const listeners = new Map<string, EventListener>();
      const media = {
        duration,
        addEventListener: vi.fn((type: string, cb: EventListener) => {
          listeners.set(type, cb);
          if (type === 'loadedmetadata') {
            queueMicrotask(() => listeners.get('loadedmetadata')?.(new Event('loadedmetadata')));
          }
        }),
        removeEventListener: vi.fn(),
        set src(_value: string) {},
      };
      return media as unknown as HTMLElement;
    }
    return originalCreateElement(tagName);
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AudioImportDialog', () => {
  it('does not render when closed', () => {
    renderWithLocale(
      <AudioImportDialog isOpen={false} onClose={vi.fn()} onImport={vi.fn(async () => undefined)} />,
    );

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders through DialogShell with panel footer actions', () => {
    renderWithLocale(
      <AudioImportDialog isOpen onClose={vi.fn()} onImport={vi.fn(async () => undefined)} />,
    );

    const dialog = screen.getByRole('dialog', { name: '导入音视频' });
    const cancelButton = screen.getByRole('button', { name: '取消' });
    const importButton = screen.getByRole('button', { name: '确认导入' });

    expect(dialog.className).toContain('dialog-card');
    expect(dialog.className).toContain('audio-import-dialog');
    expect(cancelButton.className).toContain('panel-button--ghost');
    expect(importButton.className).toContain('panel-button--primary');
    expect(importButton.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('点击选择音视频文件')).toBeTruthy();
  });

  it('imports a selected audio file after metadata resolves', async () => {
    installMediaMetadataMock(125);
    const onImport = vi.fn(async () => undefined);
    const onClose = vi.fn();
    const view = renderWithLocale(
      <AudioImportDialog isOpen onClose={onClose} onImport={onImport} />,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['audio'], 'demo.wav', { type: 'audio/wav' });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '确认导入' }).hasAttribute('disabled')).toBe(false);
      expect(screen.getByText('demo.wav')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: '确认导入' }));

    await waitFor(() => {
      expect(onImport).toHaveBeenCalledWith(file, 125);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});