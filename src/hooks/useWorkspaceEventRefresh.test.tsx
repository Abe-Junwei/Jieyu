// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useWorkspaceEventRefresh } from './useWorkspaceEventRefresh';
import { dispatchWorkspaceUnitUpdated } from '../utils/workspaceEvents';

describe('useWorkspaceEventRefresh', () => {
  it('applies a new unit event and ignores the duplicate key', () => {
    const onUnitUpdated = vi.fn();
    const onUnitRefreshBlocked = vi.fn();
    renderHook(() =>
      useWorkspaceEventRefresh({
        hasDraftForUnit: () => false,
        onUnitUpdated,
        onUnitRefreshBlocked,
      }),
    );
    const first = dispatchWorkspaceUnitUpdated({ unitId: 'uid-1', revision: 4 });
    dispatchWorkspaceUnitUpdated({ unitId: 'uid-1', revision: 4 });
    expect(onUnitUpdated).toHaveBeenCalledTimes(1);
    expect(onUnitUpdated).toHaveBeenCalledWith(first);
    expect(onUnitRefreshBlocked).not.toHaveBeenCalled();
  });

  it('does not apply when the target unit has an uncommitted draft', () => {
    const onUnitUpdated = vi.fn();
    const onUnitRefreshBlocked = vi.fn();
    renderHook(() =>
      useWorkspaceEventRefresh({
        hasDraftForUnit: (unitId) => unitId === 'uid-1',
        onUnitUpdated,
        onUnitRefreshBlocked,
      }),
    );
    const detail = dispatchWorkspaceUnitUpdated({ unitId: 'uid-1', revision: 8 });
    expect(onUnitUpdated).not.toHaveBeenCalled();
    expect(onUnitRefreshBlocked).toHaveBeenCalledWith(detail);
  });
});
