import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCreateEmbeddingProvider,
  mockEmbeddingServiceCtor,
  mockEmbeddingSearchServiceCtor,
  mockBuildEmbeddings,
  mockBuildNotesEmbeddings,
  mockBuildPdfEmbeddings,
  mockSearchSimilarUtterances,
  mockSearchMultiSource,
  mockSearchMultiSourceHybrid,
  mockTerminate,
} = vi.hoisted(() => ({
  mockCreateEmbeddingProvider: vi.fn(),
  mockEmbeddingServiceCtor: vi.fn(),
  mockEmbeddingSearchServiceCtor: vi.fn(),
  mockBuildEmbeddings: vi.fn(),
  mockBuildNotesEmbeddings: vi.fn(),
  mockBuildPdfEmbeddings: vi.fn(),
  mockSearchSimilarUtterances: vi.fn(),
  mockSearchMultiSource: vi.fn(),
  mockSearchMultiSourceHybrid: vi.fn(),
  mockTerminate: vi.fn(),
}));

vi.mock('./EmbeddingProviderCatalog', () => ({
  createEmbeddingProvider: mockCreateEmbeddingProvider,
}));

vi.mock('./EmbeddingService', () => ({
  EmbeddingService: mockEmbeddingServiceCtor.mockImplementation(function MockEmbeddingService() {
    return {
      terminate: mockTerminate,
      buildEmbeddings: mockBuildEmbeddings,
      buildNotesEmbeddings: mockBuildNotesEmbeddings,
      buildPdfEmbeddings: mockBuildPdfEmbeddings,
    };
  }),
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

import { createDeferredEmbeddingRuntime } from './DeferredEmbeddingRuntime';

describe('createDeferredEmbeddingRuntime', () => {
  beforeEach(() => {
    mockCreateEmbeddingProvider.mockReset();
    mockEmbeddingServiceCtor.mockClear();
    mockEmbeddingSearchServiceCtor.mockClear();
    mockBuildEmbeddings.mockReset();
    mockBuildNotesEmbeddings.mockReset();
    mockBuildPdfEmbeddings.mockReset();
    mockSearchSimilarUtterances.mockReset();
    mockSearchMultiSource.mockReset();
    mockSearchMultiSourceHybrid.mockReset();
    mockTerminate.mockReset();
    mockCreateEmbeddingProvider.mockReturnValue({ kind: 'mock-provider' });
  });

  it('delegates searchMultiSource through the lazy runtime wrapper', async () => {
    const expected = { query: 'hello', matches: [{ sourceId: 'u1', score: 0.8 }] };
    mockSearchMultiSource.mockResolvedValue(expected);

    const runtime = createDeferredEmbeddingRuntime(() => ({ kind: 'local' }), {
      register: vi.fn(),
      enqueue: vi.fn(),
      subscribe: vi.fn(),
      snapshot: vi.fn(),
      cancel: vi.fn(),
      retry: vi.fn(),
    } as never);

    const result = await runtime.embeddingSearchService.searchMultiSource('hello', ['utterance'], { topK: 5 });

    expect(result).toEqual(expected);
    expect(mockEmbeddingSearchServiceCtor).toHaveBeenCalledTimes(1);
    expect(mockSearchMultiSource).toHaveBeenCalledWith('hello', ['utterance'], { topK: 5 });
  });
});