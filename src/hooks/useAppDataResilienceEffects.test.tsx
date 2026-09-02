// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAppDataResilienceEffects } from './useAppDataResilienceEffects';

const {
  dispatchAppGlobalToastMock,
  getPreMigrationBackupForMigrationMock,
  restorePreMigrationBackupMock,
} = vi.hoisted(() => ({
  dispatchAppGlobalToastMock: vi.fn(),
  getPreMigrationBackupForMigrationMock: vi.fn(),
  restorePreMigrationBackupMock: vi.fn(),
}));

vi.mock('../utils/appGlobalToast', () => ({
  dispatchAppGlobalToast: dispatchAppGlobalToastMock,
}));

vi.mock('../db/preMigrationBackup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/preMigrationBackup')>();
  return {
    ...actual,
    getPreMigrationBackupForMigration: getPreMigrationBackupForMigrationMock,
    restorePreMigrationBackup: restorePreMigrationBackupMock,
  };
});

afterEach(() => {
  dispatchAppGlobalToastMock.mockReset();
  getPreMigrationBackupForMigrationMock.mockReset();
  restorePreMigrationBackupMock.mockReset();
  Object.defineProperty(window.navigator, 'webdriver', { configurable: true, value: false });
  delete document.documentElement.dataset.jieyuE2eDbOpenHook;
});

describe('useAppDataResilienceEffects', () => {
  it('allows manual restore after a migration open failure has dismissed the migration overlay', async () => {
    getPreMigrationBackupForMigrationMock.mockResolvedValue({ id: 'backup-1' });
    restorePreMigrationBackupMock.mockResolvedValue('missing');

    const { result } = renderHook(() => useAppDataResilienceEffects('zh-CN'));

    act(() => {
      window.dispatchEvent(new CustomEvent('jieyu:db-migrating', { detail: { from: 49, to: 50 } }));
    });
    act(() => {
      window.dispatchEvent(
        new CustomEvent('jieyu:db-open-failed', {
          detail: {
            cause: new DOMException('abort', 'AbortError'),
            recoveryHint: 'corrupted',
          },
        }),
      );
      window.dispatchEvent(new CustomEvent('jieyu:db-migration-done'));
    });

    await waitFor(() => expect(result.current.dbMigration).toEqual({ kind: 'idle' }));

    await act(async () => {
      await result.current.dbOverlayHandlers.onRestoreFromBackup?.();
    });

    expect(getPreMigrationBackupForMigrationMock).toHaveBeenCalledWith('jieyudb_v2', 49, 50);
    expect(restorePreMigrationBackupMock).toHaveBeenCalledWith('backup-1');
  });

  it('does not offer manual restore when migration open failed due to blocked tab', async () => {
    const { result } = renderHook(() => useAppDataResilienceEffects('zh-CN'));

    act(() => {
      window.dispatchEvent(new CustomEvent('jieyu:db-migrating', { detail: { from: 49, to: 50 } }));
    });
    act(() => {
      window.dispatchEvent(
        new CustomEvent('jieyu:db-open-failed', {
          detail: {
            cause: new Error('open blocked for jieyudb_v2'),
            recoveryHint: 'blocked',
          },
        }),
      );
      window.dispatchEvent(new CustomEvent('jieyu:db-migration-done'));
    });

    await waitFor(() => expect(result.current.dbMigration).toEqual({ kind: 'idle' }));
    expect(result.current.dbOverlayHandlers.onRestoreFromBackup).toBeUndefined();
    expect(getPreMigrationBackupForMigrationMock).not.toHaveBeenCalled();
  });

  it('does not use a successful migration as a later restore target', async () => {
    const { result } = renderHook(() => useAppDataResilienceEffects('zh-CN'));

    act(() => {
      window.dispatchEvent(new CustomEvent('jieyu:db-migrating', { detail: { from: 49, to: 50 } }));
      window.dispatchEvent(new CustomEvent('jieyu:db-migration-done'));
    });

    expect(result.current.dbOverlayHandlers.onRestoreFromBackup).toBeUndefined();
    expect(getPreMigrationBackupForMigrationMock).not.toHaveBeenCalled();
    expect(dispatchAppGlobalToastMock).not.toHaveBeenCalled();
  });

  it('exposes an automation-only open failure path with restore target', async () => {
    Object.defineProperty(window.navigator, 'webdriver', { configurable: true, value: true });
    getPreMigrationBackupForMigrationMock.mockResolvedValue({ id: 'backup-e2e' });
    restorePreMigrationBackupMock.mockResolvedValue('missing');

    const { result } = renderHook(() => useAppDataResilienceEffects('zh-CN'));

    expect(document.documentElement.dataset.jieyuE2eDbOpenHook).toBe('1');

    act(() => {
      window.dispatchEvent(
        new CustomEvent('jieyu:e2e-db-open-failed', {
          detail: { reason: 'simulated open failure', from: 49, to: 50 },
        }),
      );
    });

    await waitFor(() =>
      expect(result.current.dbGate).toEqual({
        kind: 'failed',
        failureKind: 'open',
        reason: 'simulated open failure',
      }),
    );

    await act(async () => {
      await result.current.dbOverlayHandlers.onRestoreFromBackup?.();
    });

    expect(getPreMigrationBackupForMigrationMock).toHaveBeenCalledWith('jieyudb_v2', 49, 50);
    expect(restorePreMigrationBackupMock).toHaveBeenCalledWith('backup-e2e');
  });
});
