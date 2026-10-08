// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LegacyDataResetDialog } from './LegacyDataResetDialog';
import type { LegacyDataDetection, LegacyDataWipeResult } from '../db/legacyDataReset';

afterEach(() => cleanup());

const detected: LegacyDataDetection = {
  detected: true,
  databases: ['jieyudb_v2', 'jieyu_recovery'],
  localStorageKeys: ['jieyu.lastExportTimestamp'],
  sessionStorageKeys: [],
};

const okResult: LegacyDataWipeResult = {
  deletedDatabases: ['jieyudb_v2', 'jieyu_recovery'],
  failedDatabases: [],
  removedLocalStorageKeys: ['jieyu.lastExportTimestamp'],
  removedSessionStorageKeys: [],
};

describe('LegacyDataResetDialog (D10 / T2 / T47)', () => {
  it('renders nothing when no legacy data is detected', async () => {
    const detect = vi.fn().mockResolvedValue({ ...detected, detected: false, databases: [] });
    render(<LegacyDataResetDialog locale="zh-CN" detect={detect} />);
    await waitFor(() => expect(detect).toHaveBeenCalled());
    expect(screen.queryByTestId('legacy-data-reset-dialog')).not.toBeInTheDocument();
  });

  it('lists the databases and deletes only after confirmation', async () => {
    const wipe = vi.fn().mockResolvedValue(okResult);
    const onWiped = vi.fn();
    render(
      <LegacyDataResetDialog
        locale="zh-CN"
        detect={vi.fn().mockResolvedValue(detected)}
        wipe={wipe}
        onWiped={onWiped}
      />,
    );
    const dialog = await screen.findByRole('alertdialog', { name: '检测到旧版本的本地数据' });
    expect(dialog).toHaveTextContent('jieyudb_v2');
    expect(dialog).toHaveTextContent('jieyu_recovery');
    expect(dialog).toHaveTextContent('语音会话');
    expect(wipe).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '删除旧数据' }));
    await waitFor(() => expect(onWiped).toHaveBeenCalledWith(okResult));
    expect(wipe).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('legacy-data-reset-dialog')).not.toBeInTheDocument();
  });

  it('T47: declining closes the dialog without deleting anything', async () => {
    const wipe = vi.fn();
    render(
      <LegacyDataResetDialog
        locale="zh-CN"
        detect={vi.fn().mockResolvedValue(detected)}
        wipe={wipe}
      />,
    );
    await screen.findByTestId('legacy-data-reset-dialog');
    fireEvent.click(screen.getByRole('button', { name: '暂不删除' }));
    expect(screen.queryByTestId('legacy-data-reset-dialog')).not.toBeInTheDocument();
    expect(wipe).not.toHaveBeenCalled();
  });

  it('keeps the dialog open and reports databases that could not be deleted', async () => {
    const onWiped = vi.fn();
    render(
      <LegacyDataResetDialog
        locale="en-US"
        detect={vi.fn().mockResolvedValue(detected)}
        wipe={vi.fn().mockResolvedValue({ ...okResult, failedDatabases: ['jieyu_recovery'] })}
        onWiped={onWiped}
      />,
    );
    await screen.findByTestId('legacy-data-reset-dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Delete old data' }));
    expect(await screen.findByRole('status')).toHaveTextContent('jieyu_recovery');
    expect(onWiped).not.toHaveBeenCalled();
  });
});
