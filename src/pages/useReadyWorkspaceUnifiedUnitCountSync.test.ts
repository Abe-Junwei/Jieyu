// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DbState } from '../hooks/transcriptionTypes';
import { useReadyWorkspaceUnifiedUnitCountSync } from './useReadyWorkspaceUnifiedUnitCountSync';

function readyState(
  partial: Partial<Extract<DbState, { phase: 'ready' }>>,
): Extract<DbState, { phase: 'ready' }> {
  return {
    phase: 'ready',
    dbName: 'test',
    unitCount: 1,
    translationLayerCount: 0,
    translationRecordCount: 0,
    ...partial,
  };
}

describe('useReadyWorkspaceUnifiedUnitCountSync', () => {
  it('writes timeline total into ready unifiedUnitCount when it changes', () => {
    const setState = vi.fn();
    const { rerender } = renderHook(
      ({ total }: { total: number }) => {
        useReadyWorkspaceUnifiedUnitCountSync({
          statePhase: 'ready',
          timelineTotalCount: total,
          setState,
        });
        return null;
      },
      { initialProps: { total: 3 } },
    );

    expect(setState).toHaveBeenCalled();
    const updater = setState.mock.calls.at(-1)?.[0] as (prev: DbState) => DbState;
    const next = updater(readyState({ unifiedUnitCount: 1 }));
    expect(next).toEqual(
      expect.objectContaining({
        phase: 'ready',
        unifiedUnitCount: 3,
      }),
    );

    setState.mockClear();
    rerender({ total: 3 });
    expect(setState).not.toHaveBeenCalled();

    rerender({ total: 5 });
    const updater2 = setState.mock.calls.at(-1)?.[0] as (prev: DbState) => DbState;
    const next2 = updater2(readyState({ unifiedUnitCount: 3 }));
    expect(next2).toEqual(
      expect.objectContaining({
        phase: 'ready',
        unifiedUnitCount: 5,
      }),
    );
  });

  it('no-ops when phase is not ready', () => {
    const setState = vi.fn();
    renderHook(() =>
      useReadyWorkspaceUnifiedUnitCountSync({
        statePhase: 'loading',
        timelineTotalCount: 9,
        setState,
      }),
    );
    expect(setState).not.toHaveBeenCalled();
  });
});
