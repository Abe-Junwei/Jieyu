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

const waveOptions = vi.hoisted(() => ({
  current: null as {
    onRegionContextMenu?: (regionId: string, x: number, y: number) => void;
    onRegionClick?: (regionId: string, time: number) => void;
  } | null,
}));

vi.mock('../hooks/media/useWaveSurfer', () => ({
  useWaveSurfer: (options: {
    onRegionContextMenu?: (regionId: string, x: number, y: number) => void;
    onRegionClick?: (regionId: string, time: number) => void;
  }) => {
    waveOptions.current = options;
    return player;
  },
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

  it('seeks to the start on the first waveform click', () => {
    renderHook(() =>
      useDesktopTranscriptionMediaController({
        mediaUrl: 'blob:test-audio',
        units,
        selectedUnitId: null,
        tierContainerRef: { current: null },
        onSelectUnit: vi.fn(),
      }),
    );
    player.seekTo.mockClear();
    waveOptions.current?.onRegionClick?.('u-a', 0.6);
    expect(player.seekTo).toHaveBeenLastCalledWith(0.4);
  });

  it('keeps the clicked time inside a waveform segment', () => {
    renderHook(() =>
      useDesktopTranscriptionMediaController({
        mediaUrl: 'blob:test-audio',
        units,
        selectedUnitId: 'u-a',
        tierContainerRef: { current: null },
        onSelectUnit: vi.fn(),
      }),
    );
    player.seekTo.mockClear();
    waveOptions.current?.onRegionClick?.('u-a', 0.6);
    expect(player.seekTo).toHaveBeenLastCalledWith(0.6);
  });

  it('reads pointer time from the live waveform scroll before React catches up', () => {
    const host = document.createElement('div');
    host.getBoundingClientRect = () => new DOMRect(100, 0, 500, 224);
    const wrapper = document.createElement('div');
    Object.defineProperty(wrapper, 'scrollWidth', { value: 2000 });
    const getScroll = vi.fn(() => 800);
    const { result } = renderHook(() =>
      useDesktopTranscriptionMediaController({
        mediaUrl: 'blob:test-audio',
        units,
        selectedUnitId: null,
        tierContainerRef: { current: null },
        onSelectUnit: vi.fn(),
      }),
    );
    Object.assign(player.waveformRef, { current: host });
    Object.assign(player.instanceRef, {
      current: { getDuration: () => 2, getWrapper: () => wrapper, getScroll },
    });
    expect(result.current.scrollLeftPx).toBe(0);
    expect(result.current.timeAtClientX(300)).toBe(1);
    getScroll.mockReturnValue(1200);
    expect(result.current.timeAtClientX(300)).toBe(1.4);
    Object.assign(player.waveformRef, { current: null });
    Object.assign(player.instanceRef, { current: null });
  });

  it('forwards a waveform segment context menu', () => {
    const onRegionContextMenu = vi.fn();
    renderHook(() =>
      useDesktopTranscriptionMediaController({
        mediaUrl: 'blob:test-audio',
        units,
        selectedUnitId: 'u-a',
        tierContainerRef: { current: null },
        onSelectUnit: vi.fn(),
        onRegionContextMenu,
      }),
    );
    waveOptions.current?.onRegionContextMenu?.('u-a', 12, 8);
    expect(onRegionContextMenu).toHaveBeenCalledWith('u-a', 12, 8);
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
