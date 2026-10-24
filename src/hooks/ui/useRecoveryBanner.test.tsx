// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RECOVERY_SCHEMA_VERSION, type RecoveryData } from '../../services/SnapshotService';
import { useRecoveryBanner } from './useRecoveryBanner';

function makeRecoveryData(
  units: unknown[],
  translations: unknown[],
  layers: unknown[],
): RecoveryData {
  return {
    schemaVersion: RECOVERY_SCHEMA_VERSION,
    timestamp: Date.now(),
    snapshot: {
      schemaVersion: 5,
      exportedAt: '2026-06-01T00:00:00.000Z',
      dbName: 'jieyu',
      collections: {
        layer_units: units,
        layer_unit_contents: translations,
        layers,
      },
    },
  };
}

describe('useRecoveryBanner', () => {
  it('ignores a late snapshot from the previous project', async () => {
    let resolveOld!: (value: RecoveryData | null) => void;
    const current = makeRecoveryData([{ id: 'current-unit' }], [], []);
    const checkRecovery = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<RecoveryData | null>((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce(current);
    const applyRecovery = vi.fn(async () => true);
    const { result, rerender } = renderHook(
      (props: { scopeKey: string }) =>
        useRecoveryBanner({
          ...props,
          phase: 'ready',
          unitsLength: 0,
          translationsLength: 0,
          layersLength: 0,
          checkRecovery,
          applyRecovery,
        }),
      { initialProps: { scopeKey: 'old' } },
    );
    rerender({ scopeKey: 'current' });
    await waitFor(() => expect(result.current.recoveryAvailable).toBe(true));
    await act(async () => resolveOld(makeRecoveryData([{ id: 'old-unit' }], [], [])));
    await act(async () => result.current.applyRecoveryBanner());
    expect(applyRecovery).toHaveBeenCalledWith(current);
  });

  it('clears the previous project snapshot before checking the next project', async () => {
    const snapshot = makeRecoveryData([{ id: 'project-a-unit' }], [], []);
    let resolveNext!: (value: RecoveryData | null) => void;
    const checkRecovery = vi
      .fn()
      .mockResolvedValueOnce(snapshot)
      .mockImplementationOnce(
        () =>
          new Promise<RecoveryData | null>((resolve) => {
            resolveNext = resolve;
          }),
      );
    const applyRecovery = vi.fn(async () => true);
    const { result, rerender } = renderHook(
      (props: { scopeKey: string }) =>
        useRecoveryBanner({
          ...props,
          phase: 'ready',
          unitsLength: 0,
          translationsLength: 0,
          layersLength: 0,
          checkRecovery,
          applyRecovery,
        }),
      { initialProps: { scopeKey: 'project-a' } },
    );
    await waitFor(() => expect(result.current.recoveryAvailable).toBe(true));
    rerender({ scopeKey: 'project-b' });
    expect(result.current.recoveryAvailable).toBe(false);
    act(() => result.current.applyRecoveryBanner());
    expect(applyRecovery).not.toHaveBeenCalled();
    expect(result.current.recoveryDataRef.current).toBeNull();
    await act(async () => resolveNext(null));
    expect(checkRecovery).toHaveBeenCalledTimes(2);
    expect(result.current.recoveryDiffSummary).toBeNull();
  });

  it('does not re-open banner after dismiss when lengths change', async () => {
    const checkRecovery = vi.fn(async () =>
      makeRecoveryData([{ id: 'u1' }, { id: 'u2' }], [{ id: 't1' }], [{ id: 'l1' }]),
    );

    const { result, rerender } = renderHook(
      (props: {
        phase: string;
        unitsLength: number;
        translationsLength: number;
        layersLength: number;
      }) =>
        useRecoveryBanner({
          scopeKey: 'test-project',
          ...props,
          checkRecovery,
        }),
      {
        initialProps: {
          phase: 'ready',
          unitsLength: 1,
          translationsLength: 0,
          layersLength: 0,
        },
      },
    );

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
    const snapshot = makeRecoveryData([{ id: 'u1' }], [], []);
    const checkRecovery = vi.fn(async () => snapshot);
    const applyRecovery = vi.fn(async () => true);
    const dismissRecovery = vi.fn(async () => {});

    const { result } = renderHook(() =>
      useRecoveryBanner({
        scopeKey: 'test-project',
        phase: 'ready',
        unitsLength: 0,
        translationsLength: 0,
        layersLength: 0,
        checkRecovery,
        applyRecovery,
        dismissRecovery,
      }),
    );

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
