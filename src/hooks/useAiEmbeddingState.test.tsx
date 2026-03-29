// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
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
});