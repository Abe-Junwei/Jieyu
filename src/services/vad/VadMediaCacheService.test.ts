import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VadMediaBackend, VadMediaBackendRunOptions, VadMediaRef } from './VadMediaBackend';

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

import { ensureVadCacheForMedia, getVadCacheWarmupStatus } from './VadMediaCacheService';

/** 创建可注入的 mock 后端 | Create an injectable mock backend */
function createMockBackend(overrides?: Partial<VadMediaBackend>): VadMediaBackend {
  return {
    canProcess: vi.fn(() => true),
    run: vi.fn(async () => ({
      engine: 'silero' as const,
      segments: [],
      durationSec: 0,
    })),
    ...overrides,
  };
}

describe('VadMediaCacheService', () => {
  beforeEach(() => {
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
    mockCacheGet.mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns cached entry without calling backend', async () => {
    const cachedEntry = {
      engine: 'silero' as const,
      segments: [{ start: 0.2, end: 0.8 }],
      durationSec: 2,
      cachedAt: 123,
    };
    mockCacheGet.mockReturnValue(cachedEntry);
    const backend = createMockBackend();

    const result = await ensureVadCacheForMedia({
      mediaId: 'media-1',
      mediaUrl: 'blob:media-1',
      backend,
    });

    expect(result).toEqual(cachedEntry);
    expect(backend.run).not.toHaveBeenCalled();
    expect(mockCacheSet).not.toHaveBeenCalled();
  });

  it('warms uncached media via backend and persists detected segments', async () => {
    const backend = createMockBackend({
      run: vi.fn(async () => ({
        engine: 'silero' as const,
        segments: [{ start: 0.1, end: 1.4, confidence: 0.93 }],
        durationSec: 3.2,
      })),
    });

    const result = await ensureVadCacheForMedia({
      mediaId: 'media-2',
      mediaUrl: 'blob:media-2',
      backend,
      now: () => 456,
    });

    expect(backend.canProcess).toHaveBeenCalledWith({
      mediaId: 'media-2',
      mediaUrl: 'blob:media-2',
      byteSize: undefined,
    });
    expect(backend.run).toHaveBeenCalledTimes(1);
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
  });

  it('publishes and clears warmup progress while VAD cache is warming', async () => {
    const backend = createMockBackend({
      run: vi.fn(async (_ref: VadMediaRef, opts?: VadMediaBackendRunOptions) => {
        opts?.onProgress?.({
          engine: 'silero',
          processedFrames: 16,
          totalFrames: 32,
          ratio: 0.5,
        });
        expect(getVadCacheWarmupStatus('media-progress')).toEqual({
          state: 'warming',
          engine: 'silero',
          progressRatio: 0.5,
          processedFrames: 16,
          totalFrames: 32,
        });
        return {
          engine: 'silero' as const,
          segments: [{ start: 0.1, end: 1.4, confidence: 0.93 }],
          durationSec: 3.2,
        };
      }),
    });

    const result = await ensureVadCacheForMedia({
      mediaId: 'media-progress',
      mediaUrl: 'blob:media-progress',
      backend,
      now: () => 456,
    });

    expect(result).not.toBeNull();
    expect(getVadCacheWarmupStatus('media-progress')).toBeNull();
  });

  it('deduplicates concurrent warmup requests for the same media', async () => {
    let releaseFetch: (() => void) | undefined;
    const fetchGate = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });
    const backend = createMockBackend({
      run: vi.fn(async () => {
        await fetchGate;
        return {
          engine: 'energy' as const,
          segments: [{ start: 0, end: 1.5 }],
          durationSec: 1.5,
        };
      }),
    });

    const pendingA = ensureVadCacheForMedia({
      mediaId: 'media-3',
      mediaUrl: 'blob:media-3',
      backend,
      now: () => 789,
    });
    const pendingB = ensureVadCacheForMedia({
      mediaId: 'media-3',
      mediaUrl: 'blob:media-3',
      backend,
      now: () => 789,
    });

    releaseFetch?.();

    const [resultA, resultB] = await Promise.all([pendingA, pendingB]);

    expect(backend.run).toHaveBeenCalledTimes(1);
    expect(resultA).toEqual(resultB);
  });
});
