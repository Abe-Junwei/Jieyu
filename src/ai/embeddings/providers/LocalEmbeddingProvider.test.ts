import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockRuntimePreload,
  mockRuntimeEmbed,
  mockRuntimeTerminate,
} = vi.hoisted(() => ({
  mockRuntimePreload: vi.fn(),
  mockRuntimeEmbed: vi.fn(async () => [[1, 0, 0]]),
  mockRuntimeTerminate: vi.fn(),
}));

vi.mock('../EmbeddingRuntime', () => ({
  WorkerEmbeddingRuntime: class WorkerEmbeddingRuntime {
    preload = mockRuntimePreload;
    embed = mockRuntimeEmbed;
    terminate = mockRuntimeTerminate;
  },
}));

import { LocalEmbeddingProvider } from './LocalEmbeddingProvider';

describe('LocalEmbeddingProvider', () => {
  beforeEach(() => {
    mockRuntimePreload.mockReset();
    mockRuntimeEmbed.mockClear();
    mockRuntimeTerminate.mockClear();
  });

  it('treats fallback preload as initialized and avoids repeated warm-up', async () => {
    mockRuntimePreload.mockImplementation(async (options?: { onProgress?: (progress: { usingFallback?: boolean }) => void }) => {
      options?.onProgress?.({ usingFallback: true });
    });

    const provider = new LocalEmbeddingProvider({ kind: 'local' });
    await provider.preload();
    await provider.preload();

    expect(mockRuntimePreload).toHaveBeenCalledTimes(1);
  });

  it('resets preload state after terminate', async () => {
    mockRuntimePreload.mockResolvedValue(undefined);

    const provider = new LocalEmbeddingProvider({ kind: 'local' });
    await provider.preload();
    provider.terminate();
    await provider.preload();

    expect(mockRuntimeTerminate).toHaveBeenCalledTimes(1);
    expect(mockRuntimePreload).toHaveBeenCalledTimes(2);
  });
});