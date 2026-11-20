/** @vitest-environment jsdom */
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const player = vi.hoisted(() => ({
  waveformRef: { current: null },
  spectrogramRef: { current: null },
  isReady: true,
  isPlaying: false,
  duration: 2,
  togglePlayback: vi.fn(),
  playRegion: vi.fn(),
  seekTo: vi.fn(),
  seekBySeconds: vi.fn(),
  stop: vi.fn(),
  setVolume: vi.fn(),
  setPlaybackRate: vi.fn(),
  instanceRef: { current: null },
}));

vi.mock('../hooks/media/useWaveSurfer', () => ({
  useWaveSurfer: () => player,
}));

import { useDesktopTranscriptionMediaController } from './useDesktopTranscriptionMediaController';

const units = [
  { id: 'u-a', startTime: 0.4, endTime: 0.8, text: 'two' },
  { id: 'u-b', startTime: 0.8, endTime: 1.2, text: 'three' },
];

afterEach(() => {
  cleanup();
  localStorage.clear();
  player.togglePlayback.mockClear();
  player.playRegion.mockClear();
});

function press(key: string, init: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
}

describe('useDesktopTranscriptionMediaController', () => {
  it('uses space to resume from the playhead and shift+space to play the selected segment', () => {
    const tier = { current: null };
    const { result } = renderHook(() =>
      useDesktopTranscriptionMediaController({
        mediaUrl: 'blob:test-audio',
        units,
        selectedUnitId: 'u-a',
        tierContainerRef: tier,
        onSelectUnit: vi.fn(),
      }),
    );

    press(' ');
    expect(player.togglePlayback).toHaveBeenCalledOnce();
    expect(player.playRegion).not.toHaveBeenCalled();
    expect(result.current.zoomPercent).toBe(100);

    press(' ', { shiftKey: true });
    expect(player.playRegion).toHaveBeenCalledWith(0.4, 0.8, true);
    expect(player.togglePlayback).toHaveBeenCalledOnce();

    player.playRegion.mockClear();
    result.current.playSegment();
    expect(player.playRegion).toHaveBeenCalledWith(0.4, 0.8, true);
  });

  it('ignores playback keys while typing', () => {
    renderHook(() =>
      useDesktopTranscriptionMediaController({
        mediaUrl: 'blob:test-audio',
        units,
        selectedUnitId: 'u-a',
        tierContainerRef: { current: null },
        onSelectUnit: vi.fn(),
      }),
    );
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, shiftKey: true }));
    expect(player.togglePlayback).not.toHaveBeenCalled();
    expect(player.playRegion).not.toHaveBeenCalled();
  });
});
