/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n';
import { DesktopDailyBackupPanel } from './DesktopDailyBackupPanel';

afterEach(() => {
  cleanup();
});

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

  it('shows a list failure without treating it as an empty snapshot list', async () => {
    render(
      <LocaleProvider locale="zh-CN">
        <DesktopDailyBackupPanel
          sessionId="session-1"
          listDailyBackups={vi.fn().mockRejectedValue(new Error('offline'))}
          restoreDailyBackup={vi.fn()}
        />
      </LocaleProvider>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('没能读出快照名单');
    expect(screen.queryByText('现在没有快照')).toBeNull();
  });

  it('ignores a second confirm while restore is still running and keeps the session on cancel', async () => {
    let finish: (result: { cancelled: true } | { folder: string }) => void = () => {};
    const restoreDailyBackup = vi.fn(
      () =>
        new Promise<{ cancelled: true } | { folder: string }>((resolve) => {
          finish = resolve;
        }),
    );
    const onOpened = vi.fn();
    render(
      <LocaleProvider locale="zh-CN">
        <DesktopDailyBackupPanel
          sessionId="session-1"
          listDailyBackups={vi.fn().mockResolvedValue({ days: ['2026-10-27'] })}
          restoreDailyBackup={restoreDailyBackup}
          openRestoredBackup={vi.fn()}
          onOpened={onOpened}
        />
      </LocaleProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: '恢复' }));
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(restoreDailyBackup).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '恢复' }));
    fireEvent.click(screen.getByRole('button', { name: '继续恢复' }));
    fireEvent.click(screen.getByRole('button', { name: '继续恢复' }));
    expect(restoreDailyBackup).toHaveBeenCalledTimes(1);
    expect(screen.getByText('正在恢复')).toBeTruthy();
    finish({ cancelled: true });
    await waitFor(() => {
      expect(screen.queryByText('正在恢复')).toBeNull();
    });
    expect(onOpened).not.toHaveBeenCalled();
    expect(screen.queryByText(/已恢复到/)).toBeNull();
  });

  it('opens only through the granted call and leaves the current page when that open fails', async () => {
    const openRestoredBackup = vi
      .fn()
      .mockRejectedValueOnce(new Error('project.sqlite is not a Jieyu project library'))
      .mockResolvedValueOnce({ sessionId: 'session-next' });
    const onOpened = vi.fn();
    render(
      <LocaleProvider locale="zh-CN">
        <DesktopDailyBackupPanel
          sessionId="session-1"
          listDailyBackups={vi.fn().mockResolvedValue({ days: ['2026-10-27'] })}
          restoreDailyBackup={vi.fn().mockResolvedValue({ folder: '/restored' })}
          openRestoredBackup={openRestoredBackup}
          onOpened={onOpened}
        />
      </LocaleProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: '恢复' }));
    fireEvent.click(screen.getByRole('button', { name: '继续恢复' }));
    fireEvent.click(await screen.findByRole('button', { name: '打开恢复副本' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('没有打开恢复副本');
    expect(openRestoredBackup).toHaveBeenCalledWith('session-1');
    expect(onOpened).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '打开恢复副本' }));
    await waitFor(() => {
      expect(onOpened).toHaveBeenCalledWith('session-next');
    });
  });

  it('shows the occupied folder message when the main process wraps that error', async () => {
    render(
      <LocaleProvider locale="zh-CN">
        <DesktopDailyBackupPanel
          sessionId="session-1"
          listDailyBackups={vi.fn().mockResolvedValue({ days: ['2026-10-27'] })}
          restoreDailyBackup={vi
            .fn()
            .mockRejectedValue(
              new Error(
                "Error invoking remote method 'desktop:restore-backup': Error: import destination is not empty",
              ),
            )}
        />
      </LocaleProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: '恢复' }));
    fireEvent.click(screen.getByRole('button', { name: '继续恢复' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('那个文件夹不是空的，没有写入');
  });
});
