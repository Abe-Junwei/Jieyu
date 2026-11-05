// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

type Handler = (...args: unknown[]) => void;

function makeWs() {
  const handlers = new Map<string, Handler[]>();
  const ws = {
    on: vi.fn((event: string, cb: Handler) => {
      const list = handlers.get(event) ?? [];
      list.push(cb);
      handlers.set(event, list);
    }),
    load: vi.fn(() => Promise.resolve()),
    setVolume: vi.fn(),
    setPlaybackRate: vi.fn(),
    destroy: vi.fn(),
    getDecodedData: vi.fn(() => null),
    getCurrentTime: vi.fn(() => 0),
    isPlaying: vi.fn(() => false),
    getDuration: vi.fn(() => 60),
    setTime: vi.fn(),
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    zoom: vi.fn(),
    getScroll: vi.fn(() => 0),
    getWrapper: vi.fn(() => document.createElement('div')),
    setOptions: vi.fn(),
    emit(event: string, ...args: unknown[]) {
      for (const cb of handlers.get(event) ?? []) cb(...args);
    },
  };
  return ws;
}

const { create, instances } = vi.hoisted(() => {
  const instances: ReturnType<typeof makeWs>[] = [];
  const create = vi.fn(() => {
    const ws = makeWs();
    instances.push(ws);
    return ws;
  });
  return { create, instances };
});

vi.mock('wavesurfer.js', () => ({ default: { create } }));
vi.mock('wavesurfer.js/dist/plugins/regions.esm.js', () => ({
  default: { create: () => ({ on: vi.fn(), getRegions: () => [], clearRegions: vi.fn() }) },
}));

import { useWaveSurfer } from './useWaveSurfer';

async function flushFrames() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

describe('useWaveSurfer display-mode rebuild (#506)', () => {
  it('restores playback position and resume after waveform→split on same media', async () => {
    type Props = { mode: 'waveform' | 'split' };
    const { result, rerender } = renderHook(
      ({ mode }: Props) => useWaveSurfer({ mediaUrl: 'blob:same', waveformDisplayMode: mode }),
      { initialProps: { mode: 'waveform' } as Props },
    );

    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      result.current.waveformRef.current = host;
    });
    await flushFrames();

    expect(instances).toHaveLength(1);
    const first = instances[0]!;
    first.getCurrentTime.mockReturnValue(12);
    first.isPlaying.mockReturnValue(true);

    act(() => {
      first.emit('ready');
    });

    rerender({ mode: 'split' });
    await flushFrames();

    expect(instances.length).toBeGreaterThanOrEqual(2);
    const second = instances[instances.length - 1]!;
    expect(first.destroy).toHaveBeenCalled();

    act(() => {
      second.emit('ready');
    });

    expect(second.setTime).toHaveBeenCalledWith(12);
    expect(second.play).toHaveBeenCalled();
  });

  it('restores segment playback rate after display-mode rebuild (#518)', async () => {
    type Props = { mode: 'waveform' | 'split' };
    const { result, rerender } = renderHook(
      ({ mode }: Props) =>
        useWaveSurfer({
          mediaUrl: 'blob:same-rate',
          waveformDisplayMode: mode,
          segmentPlaybackRate: 0.5,
        }),
      { initialProps: { mode: 'waveform' } as Props },
    );

    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      result.current.waveformRef.current = host;
    });
    await flushFrames();

    const first = instances[instances.length - 1]!;
    first.getCurrentTime.mockReturnValue(8);
    first.isPlaying.mockReturnValue(true);

    act(() => {
      first.emit('ready');
    });

    act(() => {
      result.current.playRegion(5, 15);
    });
    expect(first.setPlaybackRate).toHaveBeenCalledWith(0.5);

    first.setPlaybackRate.mockClear();

    rerender({ mode: 'split' });
    await flushFrames();

    const second = instances[instances.length - 1]!;
    expect(second).not.toBe(first);

    act(() => {
      second.emit('ready');
    });

    expect(second.setTime).toHaveBeenCalledWith(8);
    expect(second.setPlaybackRate).toHaveBeenCalledWith(0.5);
    expect(second.play).toHaveBeenCalled();
  });
});
