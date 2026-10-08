// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAppDataResilienceEffects } from './useAppDataResilienceEffects';

const { dispatchAppGlobalToastMock } = vi.hoisted(() => ({
  dispatchAppGlobalToastMock: vi.fn(),
}));

vi.mock('../utils/appGlobalToast', () => ({
  dispatchAppGlobalToast: dispatchAppGlobalToastMock,
}));

afterEach(() => {
  dispatchAppGlobalToastMock.mockReset();
  Object.defineProperty(window.navigator, 'webdriver', { configurable: true, value: false });
  delete document.documentElement.dataset.jieyuE2eDbOpenHook;
});

describe('useAppDataResilienceEffects', () => {
  it('no longer exposes migration state or pre-migration restore (Batch 2A baseline)', () => {
    const { result } = renderHook(() => useAppDataResilienceEffects('zh-CN'));
    expect(result.current).not.toHaveProperty('dbMigration');
    expect(Object.keys(result.current.dbOverlayHandlers).sort()).toEqual([
      'onContinueSession',
      'onReload',
      'onRetry',
    ]);
  });

  it('exposes an automation-only open failure path', async () => {
    Object.defineProperty(window.navigator, 'webdriver', { configurable: true, value: true });

    const { result } = renderHook(() => useAppDataResilienceEffects('zh-CN'));

    expect(document.documentElement.dataset.jieyuE2eDbOpenHook).toBe('1');

    act(() => {
      window.dispatchEvent(
        new CustomEvent('jieyu:e2e-db-open-failed', {
          detail: { reason: 'simulated open failure' },
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
    expect(dispatchAppGlobalToastMock).not.toHaveBeenCalled();
  });
});
