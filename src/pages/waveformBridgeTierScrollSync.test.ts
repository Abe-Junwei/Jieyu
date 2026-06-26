// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import type { RefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { useWaveSurfer } from '~/hooks/media/useWaveSurfer';
import { useWaveformBridgeTierScrollSync } from './waveformBridgeTierScrollSync';

type PlayerSlice = Pick<ReturnType<typeof useWaveSurfer>, 'instanceRef' | 'isReady' | 'duration'>;

describe('useWaveformBridgeTierScrollSync', () => {
  it('resets tier scroll projection when media attaches from empty', () => {
    const tier = document.createElement('div');
    Object.defineProperty(tier, 'scrollLeft', {
      configurable: true,
      writable: true,
      value: 48,
    });
    const tierRef = { current: tier } as RefObject<HTMLDivElement | null>;
    const onTierScrollLeftPx = vi.fn();
    const commitWaveformScrollLeft = vi.fn();
    const player: PlayerSlice = {
      instanceRef: { current: null },
      isReady: false,
      duration: 0,
    };

    const { rerender } = renderHook(
      (url: string | undefined) =>
        useWaveformBridgeTierScrollSync({
          tierContainerRef: tierRef,
          player,
          selectedMediaUrl: url,
          documentSpanSec: 120,
          zoomPxPerSec: 10,
          commitWaveformScrollLeft,
          onTierScrollLeftPx,
        }),
      { initialProps: undefined as string | undefined },
    );

    rerender('blob:new-media');

    expect(tier.scrollLeft).toBe(0);
    expect(commitWaveformScrollLeft).toHaveBeenCalledWith(0);
    expect(onTierScrollLeftPx).toHaveBeenCalledWith(0);
  });

  it('mirrors tier scrollLeft into onTierScrollLeftPx before WaveSurfer is ready', () => {
    const tier = document.createElement('div');
    Object.defineProperty(tier, 'scrollLeft', {
      configurable: true,
      writable: true,
      value: 33,
    });
    const tierRef = { current: tier } as RefObject<HTMLDivElement | null>;
    const onTierScrollLeftPx = vi.fn();
    const commitWaveformScrollLeft = vi.fn();
    const player: PlayerSlice = {
      instanceRef: { current: null },
      isReady: false,
      duration: 0,
    };

    renderHook(() =>
      useWaveformBridgeTierScrollSync({
        tierContainerRef: tierRef,
        player,
        selectedMediaUrl: 'blob:pending',
        documentSpanSec: 200,
        zoomPxPerSec: 10,
        commitWaveformScrollLeft,
        onTierScrollLeftPx,
      }),
    );

    expect(onTierScrollLeftPx).toHaveBeenCalledWith(33);
    expect(commitWaveformScrollLeft).not.toHaveBeenCalled();
  });
});
