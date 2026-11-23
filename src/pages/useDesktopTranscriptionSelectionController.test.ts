/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { setTranscriptionPlaybackClock } from '../hooks/transcription/transcriptionPlaybackClock';
import { useDesktopTranscriptionSelectionController } from './useDesktopTranscriptionSelectionController';

describe('useDesktopTranscriptionSelectionController', () => {
  it('preserves a playhead already inside the selected text segment', () => {
    setTranscriptionPlaybackClock(1.5);
    const { result } = renderHook(() => useDesktopTranscriptionSelectionController(null));
    const seek = vi.fn();
    result.current.seekToRef.current = seek;
    act(() => result.current.selectUnit({ id: 'u', startTime: 1, endTime: 2 }));
    expect(seek).not.toHaveBeenCalled();
    setTranscriptionPlaybackClock(0);
  });
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
