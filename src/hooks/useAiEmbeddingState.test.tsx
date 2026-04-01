// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAiEmbeddingState } from './useAiEmbeddingState';

vi.mock('../db', () => ({
  getDb: vi.fn(async () => ({
    collections: {
      ai_tasks: {
        find: () => ({
          exec: async () => [],
        }),
      },
    },
  })),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

function makeServices() {
  return {
    taskRunner: {
      cancel: vi.fn(() => true),
      retry: vi.fn(async () => null),
    },
    embeddingService: {
      terminate: vi.fn(),
      buildEmbeddings: vi.fn(),
      buildNotesEmbeddings: vi.fn(),
      buildPdfEmbeddings: vi.fn(),
    },
    embeddingSearchService: {
      terminate: vi.fn(),
      searchSimilarUtterances: vi.fn(),
      searchMultiSource: vi.fn(),
      searchMultiSourceHybrid: vi.fn(),
    },
  };
}

describe('useAiEmbeddingState', () => {
  it('does not start polling when disabled', () => {
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
    const services = makeServices();

    renderHook(() => useAiEmbeddingState({
      locale: 'zh-CN',
      enabled: false,
      taskRunner: services.taskRunner,
      embeddingService: services.embeddingService,
      embeddingSearchService: services.embeddingSearchService,
      selectedUtterance: null,
      utterancesOnCurrentMedia: [],
      getUtteranceTextForLayer: () => '',
      formatTime: (seconds: number) => String(seconds),
    }));

    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(addEventListenerSpy).not.toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });

  it('surfaces query-embedding warnings instead of silently returning empty matches', async () => {
    const services = makeServices();
    services.embeddingSearchService.searchSimilarUtterances.mockResolvedValue({
      query: 'target',
      matches: [],
      warningCode: 'query-embedding-unavailable',
    });

    const utterance = { id: 'utt-1', startTime: 0, endTime: 1 };
    const { result } = renderHook(() => useAiEmbeddingState({
      locale: 'zh-CN',
      enabled: true,
      taskRunner: services.taskRunner,
      embeddingService: services.embeddingService,
      embeddingSearchService: services.embeddingSearchService,
      selectedUtterance: utterance,
      utterancesOnCurrentMedia: [utterance],
      getUtteranceTextForLayer: () => 'target',
      formatTime: (seconds: number) => String(seconds),
    }));

    await act(async () => {
      await result.current.handleFindSimilarUtterances();
    });

    expect(result.current.aiEmbeddingWarning).toContain('未生成可用 embedding');
    expect(result.current.aiEmbeddingProgressLabel).toContain('无法完成相似语句检索');
    expect(result.current.aiEmbeddingMatches).toEqual([]);
  });
});