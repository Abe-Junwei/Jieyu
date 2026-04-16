import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
  mockCreateEmbeddingProvider,
  mockSearchSimilarUnits,
  mockSearchMultiSource,
  mockSearchMultiSourceHybrid,
  mockTerminate,
  mockEmbeddingSearchServiceCtor,
} = vi.hoisted(() => ({
  mockCreateEmbeddingProvider: vi.fn(),
  mockSearchSimilarUnits: vi.fn(),
  mockSearchMultiSource: vi.fn(),
  mockSearchMultiSourceHybrid: vi.fn(),
  mockTerminate: vi.fn(),
  mockEmbeddingSearchServiceCtor: vi.fn(),
}));

vi.mock('./EmbeddingProviderCatalog', () => ({
  createEmbeddingProvider: mockCreateEmbeddingProvider,
}));

vi.mock('./EmbeddingSearchService', () => ({
  EmbeddingSearchService: mockEmbeddingSearchServiceCtor.mockImplementation(function MockEmbeddingSearchService() {
    return {
      terminate: mockTerminate,
      searchSimilarUnits: mockSearchSimilarUnits,
      searchMultiSource: mockSearchMultiSource,
      searchMultiSourceHybrid: mockSearchMultiSourceHybrid,
    };
  }),
}));

import { createDeferredEmbeddingSearchService } from './DeferredEmbeddingSearchService';

describe('createDeferredEmbeddingSearchService', () => {
  beforeEach(() => {
    mockCreateEmbeddingProvider.mockReset();
    mockSearchSimilarUnits.mockReset();
    mockSearchMultiSource.mockReset();
    mockSearchMultiSourceHybrid.mockReset();
    mockTerminate.mockReset();
    mockEmbeddingSearchServiceCtor.mockClear();
    mockCreateEmbeddingProvider.mockReturnValue({ kind: 'mock-provider' });
  });

  it('delegates hybrid search to the lazily created service', async () => {
    const expected = { query: 'hello', matches: [{ sourceId: 'u1', score: 0.9 }] };
    mockSearchMultiSourceHybrid.mockResolvedValue(expected);

    const service = createDeferredEmbeddingSearchService(() => ({ kind: 'local' }));
    const result = await service.searchMultiSourceHybrid('hello', ['unit', 'note'], { topK: 5 });

    expect(result).toEqual(expected);
    expect(mockCreateEmbeddingProvider).toHaveBeenCalledTimes(1);
    expect(mockEmbeddingSearchServiceCtor).toHaveBeenCalledTimes(1);
    expect(mockSearchMultiSourceHybrid).toHaveBeenCalledWith('hello', ['unit', 'note'], { topK: 5 });
  });

  it('reuses the same lazily created service across search methods', async () => {
    mockSearchSimilarUnits.mockResolvedValue({ query: 'a', matches: [] });
    mockSearchMultiSource.mockResolvedValue({ query: 'b', matches: [] });

    const service = createDeferredEmbeddingSearchService(() => ({ kind: 'local' }));

    await service.searchSimilarUnits('a', { topK: 3 });
    await service.searchMultiSource('b', ['unit'], { topK: 4 });
    service.terminate();

    expect(mockEmbeddingSearchServiceCtor).toHaveBeenCalledTimes(1);
    expect(mockSearchSimilarUnits).toHaveBeenCalledWith('a', { topK: 3 });
    expect(mockSearchMultiSource).toHaveBeenCalledWith('b', ['unit'], { topK: 4 });
    expect(mockTerminate).toHaveBeenCalledTimes(1);
  });
});