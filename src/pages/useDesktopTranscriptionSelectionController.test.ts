/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDesktopTranscriptionSelectionController } from './useDesktopTranscriptionSelectionController';

describe('useDesktopTranscriptionSelectionController', () => {
  it('starts from the located unit and seeks when another unit is selected', () => {
    const seek = vi.fn();
    const { result } = renderHook(() => useDesktopTranscriptionSelectionController('u-b'));
    result.current.seekToRef.current = seek;

    expect(result.current.selectedUnitId).toBe('u-b');
    act(() => result.current.selectUnit({ id: 'u-a', startTime: 1.25 }));
    expect(result.current.selectedUnitId).toBe('u-a');
    expect(seek).toHaveBeenCalledWith(1.25);

    act(() => result.current.clearSelection());
    expect(result.current.selectedUnitId).toBeNull();
  });
});
