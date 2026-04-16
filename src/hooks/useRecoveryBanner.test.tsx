// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRecoveryBanner } from './useRecoveryBanner';

describe('useRecoveryBanner', () => {
  it('does not re-open banner after dismiss when lengths change', async () => {
    const checkRecovery = vi.fn(async () => ({
      units: [{ id: 'u1' }, { id: 'u2' }],
      translations: [{ id: 't1' }],
      layers: [{ id: 'l1' }],
    }));

    const { result, rerender } = renderHook((props: {
      phase: string;
      unitsLength: number;
      translationsLength: number;
      layersLength: number;
    }) => useRecoveryBanner({
      ...props,
      checkRecovery,
    }), {
      initialProps: {
        phase: 'ready',
        unitsLength: 1,
        translationsLength: 0,
        layersLength: 0,
      },
    });

    await waitFor(() => {
      expect(result.current.recoveryAvailable).toBe(true);
    });

    act(() => {
      result.current.hideRecoveryBanner();
    });

    expect(result.current.recoveryAvailable).toBe(false);

    rerender({
      phase: 'ready',
      unitsLength: 2,
      translationsLength: 1,
      layersLength: 1,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.recoveryAvailable).toBe(false);
    expect(checkRecovery).toHaveBeenCalledTimes(1);
  });

  it('hides banner after successful apply and forwards dismiss callback', async () => {
    const snapshot = {
      units: [{ id: 'u1' }],
      translations: [],
      layers: [],
    };
    const checkRecovery = vi.fn(async () => snapshot);
    const applyRecovery = vi.fn(async () => true);
    const dismissRecovery = vi.fn(async () => {});

    const { result } = renderHook(() => useRecoveryBanner({
      phase: 'ready',
      unitsLength: 0,
      translationsLength: 0,
      layersLength: 0,
      checkRecovery,
      applyRecovery,
      dismissRecovery,
    }));

    await waitFor(() => {
      expect(result.current.recoveryAvailable).toBe(true);
    });

    act(() => {
      result.current.applyRecoveryBanner();
    });

    await waitFor(() => {
      expect(applyRecovery).toHaveBeenCalledWith(snapshot);
      expect(result.current.recoveryAvailable).toBe(false);
    });

    act(() => {
      result.current.dismissRecoveryBanner();
    });

    await waitFor(() => {
      expect(dismissRecovery).toHaveBeenCalledTimes(1);
    });
  });
});
