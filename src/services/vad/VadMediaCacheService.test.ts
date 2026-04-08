import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCacheGet, mockCacheSet } = vi.hoisted(() => ({
  mockCacheGet: vi.fn(),
  mockCacheSet: vi.fn(),
}));

vi.mock('./VadCacheService', () => ({
  vadCache: {
    get: mockCacheGet,
    set: mockCacheSet,
  },
}));

import { ensureVadCacheForMedia } from './VadMediaCacheService';

describe('VadMediaCacheService', () => {
  beforeEach(() => {
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
    mockCacheGet.mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns cached entry without refetching media', async () => {
    const cachedEntry = {
      engine: 'silero' as const,
      segments: [{ start: 0.2, end: 0.8 }],
      durationSec: 2,
      cachedAt: 123,
    };
    mockCacheGet.mockReturnValue(cachedEntry);
    const fetchImpl = vi.fn();

    const result = await ensureVadCacheForMedia({
      mediaId: 'media-1',
      mediaUrl: 'blob:media-1',
      fetchImpl,
    });

    expect(result).toEqual(cachedEntry);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(mockCacheSet).not.toHaveBeenCalled();
  });

  it('warms uncached media and persists detected segments', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(16),
    }));
    const decodeAudioData = vi.fn(async () => ({ duration: 3.2 } as AudioBuffer));
    const close = vi.fn(async () => undefined);
    const vadRuntime = {
      init: vi.fn(async () => undefined),
      detectSpeechSegments: vi.fn(async () => [{ start: 0.1, end: 1.4, confidence: 0.93 }]),
      getRuntimeEngine: vi.fn(() => 'silero' as const),
    };

    const result = await ensureVadCacheForMedia({
      mediaId: 'media-2',
      mediaUrl: 'blob:media-2',
      fetchImpl,
      audioContextFactory: () => ({ decodeAudioData, close }),
      vadRuntime,
      now: () => 456,
    });

    expect(vadRuntime.init).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith('blob:media-2');
    expect(decodeAudioData).toHaveBeenCalledTimes(1);
    expect(vadRuntime.detectSpeechSegments).toHaveBeenCalledTimes(1);
    expect(mockCacheSet).toHaveBeenCalledWith('media-2', {
      engine: 'silero',
      segments: [{ start: 0.1, end: 1.4, confidence: 0.93 }],
      durationSec: 3.2,
      cachedAt: 456,
    });
    expect(result).toEqual({
      engine: 'silero',
      segments: [{ start: 0.1, end: 1.4, confidence: 0.93 }],
      durationSec: 3.2,
      cachedAt: 456,
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent warmup requests for the same media', async () => {
    let releaseFetch: (() => void) | undefined;
    const fetchGate = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });
    const fetchImpl = vi.fn(async () => {
      await fetchGate;
      return {
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      };
    });
    const decodeAudioData = vi.fn(async () => ({ duration: 1.5 } as AudioBuffer));
    const vadRuntime = {
      init: vi.fn(async () => undefined),
      detectSpeechSegments: vi.fn(async () => [{ start: 0, end: 1.5 }]),
      getRuntimeEngine: vi.fn(() => 'energy' as const),
    };

    const pendingA = ensureVadCacheForMedia({
      mediaId: 'media-3',
      mediaUrl: 'blob:media-3',
      fetchImpl,
      audioContextFactory: () => ({ decodeAudioData }),
      vadRuntime,
      now: () => 789,
    });
    const pendingB = ensureVadCacheForMedia({
      mediaId: 'media-3',
      mediaUrl: 'blob:media-3',
      fetchImpl,
      audioContextFactory: () => ({ decodeAudioData }),
      vadRuntime,
      now: () => 789,
    });

    releaseFetch?.();

    const [resultA, resultB] = await Promise.all([pendingA, pendingB]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(vadRuntime.detectSpeechSegments).toHaveBeenCalledTimes(1);
    expect(resultA).toEqual(resultB);
  });
});
