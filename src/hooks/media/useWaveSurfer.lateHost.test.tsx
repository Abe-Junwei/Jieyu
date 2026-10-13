// @vitest-environment jsdom
/**
 * WS8-X1：波形宿主在生命周期 effect 之后才挂上，也要建出 WaveSurfer 实例（否则一直“解码中”）。
 * WS8-X1: a host that attaches after the lifecycle effect still gets a WaveSurfer instance.
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { create } = vi.hoisted(() => ({
  create: vi.fn(() => ({
    on: vi.fn(),
    load: vi.fn(() => Promise.resolve()),
    setVolume: vi.fn(),
    setPlaybackRate: vi.fn(),
    destroy: vi.fn(),
    getDecodedData: vi.fn(() => null),
  })),
}));

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

describe('useWaveSurfer late host (WS8-X1)', () => {
  it('creates the instance once the host attaches after the effect ran', async () => {
    const { result } = renderHook(() => useWaveSurfer({ mediaUrl: 'blob:late' }));
    await flushFrames();
    expect(create).not.toHaveBeenCalled();

    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      result.current.waveformRef.current = host;
    });
    await flushFrames();
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ container: host }));
  });
});
