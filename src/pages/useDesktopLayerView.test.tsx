// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useDesktopLayerView } from './useDesktopLayerView';

describe('useDesktopLayerView', () => {
  beforeEach(() => window.localStorage.clear());

  it('keeps the header fold and layer folds per manuscript across a reload', () => {
    const first = renderHook(() => useDesktopLayerView('ms-1'));
    act(() => first.result.current.toggleHeader());
    act(() => first.result.current.toggleRow('layer-a'));
    expect(first.result.current.headerFolded).toBe(true);
    first.unmount();

    const again = renderHook(() => useDesktopLayerView('ms-1'));
    expect(again.result.current.headerFolded).toBe(true);
    expect(again.result.current.fold.rows).toContain('layer-a');

    const other = renderHook(() => useDesktopLayerView('ms-2'));
    expect(other.result.current.headerFolded).toBe(false);
    expect(other.result.current.fold.rows).toEqual([]);
  });

  it('keeps compact density on this machine, not per manuscript', () => {
    const first = renderHook(() => useDesktopLayerView('ms-1'));
    expect(first.result.current.compact).toBe(false);
    act(() => first.result.current.toggleCompact());
    expect(first.result.current.compact).toBe(true);
    first.unmount();
    const again = renderHook(() => useDesktopLayerView('ms-2'));
    expect(again.result.current.compact).toBe(true);
  });
});
