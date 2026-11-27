/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { setTranscriptionPlaybackClock } from '../hooks/transcription/transcriptionPlaybackClock';
import { useDesktopTranscriptionSelectionController } from './useDesktopTranscriptionSelectionController';

const layerUnits = [
  { id: 'a', startTime: 0, endTime: 1, layerId: 'L' },
  { id: 'b', startTime: 1, endTime: 2, layerId: 'L' },
  { id: 'c', startTime: 2, endTime: 3, layerId: 'L' },
];

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

  it('toggles and ranges within a structure layer, keeps on context hit, prunes gone ids', () => {
    const { result, rerender } = renderHook(
      ({ units }) => useDesktopTranscriptionSelectionController(null, units),
      { initialProps: { units: layerUnits } },
    );
    act(() => result.current.selectUnit(layerUnits[0]!));
    act(() => result.current.clickUnit(layerUnits[2]!, { toggle: true, range: false }));
    expect(result.current.selectedUnitIds).toEqual(['a', 'c']);
    act(() => result.current.applyContextMenuTarget('c'));
    expect(result.current.selectedUnitIds).toEqual(['a', 'c']);
    act(() => result.current.applyContextMenuTarget('b'));
    expect(result.current.selectedUnitIds).toEqual(['b']);
    act(() => result.current.selectUnit(layerUnits[0]!));
    act(() => result.current.clickUnit(layerUnits[2]!, { toggle: false, range: true }));
    expect(result.current.selectedUnitIds).toEqual(['a', 'b', 'c']);
    rerender({ units: [layerUnits[0]!, layerUnits[2]!] });
    expect(result.current.selectedUnitIds).toEqual(['a', 'c']);
  });
});
