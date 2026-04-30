// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_TASKS_UPDATED_EVENT } from '../ai/tasks/taskRefreshEvents';
import { useAiEmbeddingState } from './useAiEmbeddingState';

const { aiTaskRows } = vi.hoisted(() => ({
  aiTaskRows: new Map<string, {
    id: string;
    taskType: 'embed' | 'gloss' | 'agent_loop';
    status: 'pending' | 'running' | 'done' | 'failed';
    updatedAt: string;
    modelId?: string;
    errorMessage?: string;
    resumable?: boolean;
    checkpointJson?: string;
    lastHeartbeatAt?: string;
    completedAt?: string;
  }>(),
}));

vi.mock('../db', () => ({
  getDb: vi.fn(async () => ({
    collections: {
      ai_tasks: {
        find: () => ({
          exec: async () => Array.from(aiTaskRows.values()).map((row) => ({
            toJSON: () => ({ ...row }),
          })),
        }),
        findOne: ({ selector }: { selector: { id: string } }) => ({
          exec: async () => {
            const row = aiTaskRows.get(selector.id);
            return row ? { toJSON: () => ({ ...row }) } : null;
          },
        }),
        update: async (id: string, patch: Record<string, unknown>) => {
          const row = aiTaskRows.get(id);
          if (!row) return;
          aiTaskRows.set(id, {
            ...row,
            ...patch,
          });
        },
      },
    },
  })),
}));

afterEach(() => {
  vi.restoreAllMocks();
  aiTaskRows.clear();
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
      searchSimilarUnits: vi.fn(),
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
      selectedUnit: null,
      unitsOnCurrentMedia: [],
      getUnitTextForLayer: () => '',
      formatTime: (seconds: number) => String(seconds),
    }));

    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(addEventListenerSpy).not.toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });

  it('surfaces query-embedding warnings instead of silently returning empty matches', async () => {
    const services = makeServices();
    services.embeddingSearchService.searchSimilarUnits.mockResolvedValue({
      query: 'target',
      matches: [],
      warningCode: 'query-embedding-unavailable',
    });

    const unit = { id: 'utt-1', startTime: 0, endTime: 1 };
    const { result } = renderHook(() => useAiEmbeddingState({
      locale: 'zh-CN',
      enabled: true,
      taskRunner: services.taskRunner,
      embeddingService: services.embeddingService,
      embeddingSearchService: services.embeddingSearchService,
      selectedUnit: unit,
      unitsOnCurrentMedia: [unit],
      getUnitTextForLayer: () => 'target',
      formatTime: (seconds: number) => String(seconds),
    }));

    await act(async () => {
      await result.current.handleFindSimilarUnits();
    });

    expect(result.current.aiEmbeddingWarning).toContain('未生成可用 embedding');
    expect(result.current.aiEmbeddingProgressLabel).toContain('无法完成相似语段检索');
    expect(result.current.aiEmbeddingMatches).toEqual([]);
  });

  it('falls back to durable task cancellation when taskRunner cannot cancel agent_loop checkpoint task', async () => {
    const services = makeServices();
    services.taskRunner.cancel.mockReturnValue(false);
    aiTaskRows.set('task-loop-1', {
      id: 'task-loop-1',
      taskType: 'agent_loop',
      status: 'pending',
      updatedAt: '2026-04-27T00:00:00.000Z',
      resumable: true,
      checkpointJson: '{"kind":"agent_loop_token_budget_warning"}',
    });

    const { result } = renderHook(() => useAiEmbeddingState({
      locale: 'zh-CN',
      enabled: true,
      taskRunner: services.taskRunner,
      embeddingService: services.embeddingService,
      embeddingSearchService: services.embeddingSearchService,
      selectedUnit: null,
      unitsOnCurrentMedia: [],
      getUnitTextForLayer: () => '',
      formatTime: (seconds: number) => String(seconds),
    }));

    await act(async () => {
      await result.current.handleCancelAiTask('task-loop-1');
    });

    const updated = aiTaskRows.get('task-loop-1');
    expect(updated?.status).toBe('failed');
    expect(updated?.resumable).toBe(false);
    expect(updated?.errorMessage).toBe('cancelled_by_user');
    expect(result.current.aiEmbeddingLastError).toBeNull();
  });

  it('falls back to durable task retry when taskRunner has no retry input for failed agent_loop checkpoint task', async () => {
    const services = makeServices();
    services.taskRunner.retry.mockResolvedValue(null);
    aiTaskRows.set('task-loop-failed', {
      id: 'task-loop-failed',
      taskType: 'agent_loop',
      status: 'failed',
      updatedAt: '2026-04-27T00:00:00.000Z',
      resumable: false,
      checkpointJson: '{"kind":"agent_loop_token_budget_warning"}',
      errorMessage: 'token budget exhausted',
    });

    const { result } = renderHook(() => useAiEmbeddingState({
      locale: 'zh-CN',
      enabled: true,
      taskRunner: services.taskRunner,
      embeddingService: services.embeddingService,
      embeddingSearchService: services.embeddingSearchService,
      selectedUnit: null,
      unitsOnCurrentMedia: [],
      getUnitTextForLayer: () => '',
      formatTime: (seconds: number) => String(seconds),
    }));

    await act(async () => {
      await result.current.handleRetryAiTask('task-loop-failed');
    });

    const updated = aiTaskRows.get('task-loop-failed');
    expect(updated?.status).toBe('pending');
    expect(updated?.resumable).toBe(true);
    expect(result.current.aiEmbeddingLastError).toBeNull();
    expect(result.current.aiEmbeddingProgressLabel).toContain('task-loop-failed');
  });

  it('refreshes task list immediately when ai task update event is dispatched', async () => {
    const services = makeServices();
    aiTaskRows.set('task-initial', {
      id: 'task-initial',
      taskType: 'embed',
      status: 'pending',
      updatedAt: '2026-04-28T00:00:00.000Z',
    });

    const { result } = renderHook(() => useAiEmbeddingState({
      locale: 'zh-CN',
      enabled: true,
      taskRunner: services.taskRunner,
      embeddingService: services.embeddingService,
      embeddingSearchService: services.embeddingSearchService,
      selectedUnit: null,
      unitsOnCurrentMedia: [],
      getUnitTextForLayer: () => '',
      formatTime: (seconds: number) => String(seconds),
    }));

    await act(async () => {
      window.dispatchEvent(new CustomEvent(AI_TASKS_UPDATED_EVENT));
    });

    expect(result.current.aiEmbeddingTasks.map((item) => item.id)).toContain('task-initial');

    aiTaskRows.set('task-initial', {
      id: 'task-initial',
      taskType: 'embed',
      status: 'failed',
      updatedAt: '2026-04-28T00:00:01.000Z',
      errorMessage: 'cancelled_by_user',
    });

    await act(async () => {
      window.dispatchEvent(new CustomEvent(AI_TASKS_UPDATED_EVENT));
    });

    expect(result.current.aiEmbeddingTasks.find((item) => item.id === 'task-initial')).toMatchObject({
      status: 'failed',
      errorMessage: 'cancelled_by_user',
    });
  });
});