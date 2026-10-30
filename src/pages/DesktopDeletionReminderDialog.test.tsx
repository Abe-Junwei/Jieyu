/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n';
import { DesktopDeletionReminderDialog } from './DesktopDeletionReminderDialog';

describe('DesktopDeletionReminderDialog', () => {
  it('says removal leaves existing backups', () => {
    render(
      <LocaleProvider locale="zh-CN">
        <DesktopDeletionReminderDialog
          items={[]}
          onShown={vi.fn()}
          onPurge={() => Promise.resolve()}
          onRemoveFile={() => Promise.resolve({ state: 'confirmed' })}
          onClose={vi.fn()}
        />
      </LocaleProvider>,
    );
    expect(screen.getByText('清除只删当前项目里的内容，已有备份还在')).toBeTruthy();
  });

  it('cancels a purge without writing and ignores a second confirm', async () => {
    let release: () => void = () => undefined;
    const onPurge = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    render(
      <LocaleProvider locale="en-US">
        <DesktopDeletionReminderDialog
          items={[
            {
              target: 'manuscript',
              id: 'ms-1',
              title: { zh: '到期' },
              relpath: null,
              retainUntil: '2020-01-01T00:00:00.000Z',
              removable: false,
            },
          ]}
          onShown={vi.fn()}
          onPurge={onPurge}
          onRemoveFile={() => Promise.resolve({ state: 'confirmed' })}
          onClose={vi.fn()}
        />
      </LocaleProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Purge manuscript' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onPurge).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Purge manuscript' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm purge' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm purge' }));
    expect(onPurge).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Purge this manuscript' })).toBeNull();
    });
  });
});
