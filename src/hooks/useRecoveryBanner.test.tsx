// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRecoveryBanner } from './useRecoveryBanner';

describe('useRecoveryBanner', () => {
  it('does not re-open banner after dismiss when lengths change', async () => {
    const checkRecovery = vi.fn(async () => ({
      utterances: [{ id: 'u1' }, { id: 'u2' }],
      translations: [{ id: 't1' }],
      layers: [{ id: 'l1' }],
    }));

    const { result, rerender } = renderHook((props: {
      phase: string;
      utterancesLength: number;
      translationsLength: number;
      layersLength: number;
    }) => useRecoveryBanner({
      ...props,
      checkRecovery,
    }), {
      initialProps: {
        phase: 'ready',
        utterancesLength: 1,
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
      utterancesLength: 2,
      translationsLength: 1,
      layersLength: 1,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.recoveryAvailable).toBe(false);
    expect(checkRecovery).toHaveBeenCalledTimes(1);
  });
});
