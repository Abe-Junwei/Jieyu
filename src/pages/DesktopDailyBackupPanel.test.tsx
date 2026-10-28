/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n';
import { DesktopDailyBackupPanel } from './DesktopDailyBackupPanel';

describe('DesktopDailyBackupPanel', () => {
  it('shows an empty list, then explains before restoring', async () => {
    const listDailyBackups = vi
      .fn()
      .mockResolvedValueOnce({ days: [] })
      .mockResolvedValue({ days: ['2026-10-27'] });
    const restoreDailyBackup = vi.fn().mockResolvedValue({ folder: '/restored' });
    const view = render(
      <LocaleProvider locale="zh-CN">
        <DesktopDailyBackupPanel
          sessionId="session-1"
          listDailyBackups={listDailyBackups}
          restoreDailyBackup={restoreDailyBackup}
        />
      </LocaleProvider>,
    );
    expect(await screen.findByText('现在没有快照')).toBeTruthy();

    view.rerender(
      <LocaleProvider locale="zh-CN">
        <DesktopDailyBackupPanel
          sessionId="session-2"
          listDailyBackups={listDailyBackups}
          restoreDailyBackup={restoreDailyBackup}
        />
      </LocaleProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: '恢复' }));
    expect(
      screen.getByText('恢复写进另一个空文件夹。不改当前项目，也不删除这份快照。'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(restoreDailyBackup).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '恢复' }));
    fireEvent.click(screen.getByRole('button', { name: '继续恢复' }));
    await waitFor(() => {
      expect(screen.getByText('已恢复到 /restored')).toBeTruthy();
    });
    expect(restoreDailyBackup).toHaveBeenCalledWith('session-2', '2026-10-27');
  });
});
