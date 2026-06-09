// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useWaveformBridgeSegmentPlaybackControls } from './waveformBridgeSegmentPlaybackControls';

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
});
