import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
  mockCreateEmbeddingProvider,
  mockSearchSimilarUtterances,
  mockSearchMultiSource,
  mockSearchMultiSourceHybrid,
  mockTerminate,
  mockEmbeddingSearchServiceCtor,
} = vi.hoisted(() => ({
  mockCreateEmbeddingProvider: vi.fn(),
  mockSearchSimilarUtterances: vi.fn(),
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
      searchSimilarUtterances: mockSearchSimilarUtterances,
      searchMultiSource: mockSearchMultiSource,
      searchMultiSourceHybrid: mockSearchMultiSourceHybrid,
    };
  }),
}));

import { createDeferredEmbeddingSearchService } from './DeferredEmbeddingSearchService';

describe('createDeferredEmbeddingSearchService', () => {
  beforeEach(() => {
    mockCreateEmbeddingProvider.mockReset();
    mockSearchSimilarUtterances.mockReset();
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
    const result = await service.searchMultiSourceHybrid('hello', ['utterance', 'note'], { topK: 5 });

    expect(result).toEqual(expected);
    expect(mockCreateEmbeddingProvider).toHaveBeenCalledTimes(1);
    expect(mockEmbeddingSearchServiceCtor).toHaveBeenCalledTimes(1);
    expect(mockSearchMultiSourceHybrid).toHaveBeenCalledWith('hello', ['utterance', 'note'], { topK: 5 });
  });

  it('reuses the same lazily created service across search methods', async () => {
    mockSearchSimilarUtterances.mockResolvedValue({ query: 'a', matches: [] });
    mockSearchMultiSource.mockResolvedValue({ query: 'b', matches: [] });

    const service = createDeferredEmbeddingSearchService(() => ({ kind: 'local' }));

    await service.searchSimilarUtterances('a', { topK: 3 });
    await service.searchMultiSource('b', ['utterance'], { topK: 4 });
    service.terminate();

    expect(mockEmbeddingSearchServiceCtor).toHaveBeenCalledTimes(1);
    expect(mockSearchSimilarUtterances).toHaveBeenCalledWith('a', { topK: 3 });
    expect(mockSearchMultiSource).toHaveBeenCalledWith('b', ['utterance'], { topK: 4 });
    expect(mockTerminate).toHaveBeenCalledTimes(1);
  });
});