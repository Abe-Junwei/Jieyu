// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { requestPlayUnitRange } from './transcription/playUnitRange';
import { useWaveformBridgeSegmentPlaybackControls } from './waveformBridgeSegmentPlaybackControls';
import { emitDefaultPlaybackRateChanged } from '~/utils/workspaceLayoutPreferenceSync';

describe('useWaveformBridgeSegmentPlaybackControls', () => {
  it('does not repeatedly zoomToUnit for the same selected segment in fit-selection mode', () => {
    const zoomToUnit = vi.fn();
    const seekTo = vi.fn();

    const makeInput = (range: { startTime: number; endTime: number }) => ({
      player: {
        instanceRef: { current: null },
        isReady: true,
        isPlaying: false,
        seekTo,
        stop: vi.fn(),
        playRegion: vi.fn(),
        setPlaybackRate: vi.fn(),
      },
      segmentLoopPlayback: false,
      setSegmentLoopPlayback: vi.fn(),
      setSegmentPlaybackRate: vi.fn(),
      selectedWaveformTimelineItem: null,
      subSelectionRange: null,
      selectedTimelineUnitId: 'seg-1',
      zoomMode: 'fit-selection' as const,
      selectedTimelineUnitForTime: range,
      zoomToUnit,
      skipSeekForIdRef: { current: null as string | null },
    });

    const { rerender } = renderHook(
      (props: ReturnType<typeof makeInput>) => useWaveformBridgeSegmentPlaybackControls(props),
      {
        initialProps: makeInput({ startTime: 1, endTime: 2 }),
      },
    );

    expect(zoomToUnit).toHaveBeenCalledTimes(1);
    expect(zoomToUnit).toHaveBeenCalledWith(1, 2);

    // 同一语段但新对象引用：不应再次触发居中 | Same segment with new object reference should not re-center again
    rerender(makeInput({ startTime: 1, endTime: 2 }));
    expect(zoomToUnit).toHaveBeenCalledTimes(1);

    // 语段切换后应重新触发一次 | Segment change should trigger one more viewport sync
    rerender({
      ...makeInput({ startTime: 3, endTime: 4 }),
      selectedTimelineUnitId: 'seg-2',
    });
    expect(zoomToUnit).toHaveBeenCalledTimes(2);
    expect(zoomToUnit).toHaveBeenLastCalledWith(3, 4);
    expect(seekTo).not.toHaveBeenCalled();
  });

  it('plays the unit range requested from search once that unit is selected', () => {
    const playRegion = vi.fn();
    const makeInput = (unitId: string, range: { startTime: number; endTime: number }) => ({
      player: {
        instanceRef: { current: null },
        isReady: true,
        isPlaying: false,
        seekTo: vi.fn(),
        stop: vi.fn(),
        playRegion,
        setPlaybackRate: vi.fn(),
      },
      segmentLoopPlayback: false,
      setSegmentLoopPlayback: vi.fn(),
      setSegmentPlaybackRate: vi.fn(),
      selectedWaveformTimelineItem: null,
      subSelectionRange: null,
      selectedTimelineUnitId: unitId,
      zoomMode: 'fit-selection' as const,
      selectedTimelineUnitForTime: range,
      zoomToUnit: vi.fn(),
      skipSeekForIdRef: { current: null as string | null },
    });
    const { rerender } = renderHook(
      (props: ReturnType<typeof makeInput>) => useWaveformBridgeSegmentPlaybackControls(props),
      { initialProps: makeInput('seg-1', { startTime: 0, endTime: 1 }) },
    );
    requestPlayUnitRange(1.25, 2.5);
    rerender(makeInput('seg-2', { startTime: 1.25, endTime: 2.5 }));
    expect(playRegion).toHaveBeenCalledWith(1.25, 2.5, true);
  });

  it('applies a settings playback-rate change without switching units', () => {
    localStorage.setItem('jieyu:default-playback-rate', '1');
    const setSegmentPlaybackRate = vi.fn();
    const setPlaybackRate = vi.fn();
    renderHook(() =>
      useWaveformBridgeSegmentPlaybackControls({
        player: {
          instanceRef: { current: null },
          isReady: true,
          isPlaying: false,
          seekTo: vi.fn(),
          stop: vi.fn(),
          playRegion: vi.fn(),
          setPlaybackRate,
        },
        segmentLoopPlayback: false,
        setSegmentLoopPlayback: vi.fn(),
        setSegmentPlaybackRate,
        selectedWaveformTimelineItem: null,
        subSelectionRange: null,
        selectedTimelineUnitId: 'seg-1',
        zoomMode: 'fit-selection',
        selectedTimelineUnitForTime: { startTime: 0, endTime: 1 },
        zoomToUnit: vi.fn(),
        skipSeekForIdRef: { current: null },
      }),
    );
    setSegmentPlaybackRate.mockClear();
    setPlaybackRate.mockClear();
    localStorage.setItem('jieyu:default-playback-rate', '1.5');
    emitDefaultPlaybackRateChanged();
    expect(setSegmentPlaybackRate).toHaveBeenCalledWith(1.5);
    expect(setPlaybackRate).toHaveBeenCalledWith(1.5);
    localStorage.removeItem('jieyu:default-playback-rate');
  });
});
