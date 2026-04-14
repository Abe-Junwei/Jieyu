// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { EmbeddingService, type EmbeddingBuildSource } from '../embeddings/EmbeddingService';
import type { EmbeddingProvider } from '../embeddings/EmbeddingProvider';
import { useAiChat } from '../../hooks/useAiChat';

const hoisted = vi.hoisted(() => {
  const messageById = new Map<string, Record<string, unknown>>();
  const conversationById = new Map<string, Record<string, unknown>>();

  const doc = (row: Record<string, unknown>) => ({
    toJSON: () => ({ ...row }),
  });

  const aiMessagesInsert = vi.fn(async (row: Record<string, unknown>) => {
    const id = row.id as string;
    messageById.set(id, { ...(messageById.get(id) ?? {}), ...row });
  });

  const aiMessagesFindOne = vi.fn(({ selector }: { selector: { id?: string } }) => ({
    exec: async () => {
      const r = selector.id ? messageById.get(selector.id) : undefined;
      return r ? doc(r) : null;
    },
  }));

  const aiMessagesFindByIndex = vi.fn(async () => []);

  const aiConversationsInsert = vi.fn(async (row: Record<string, unknown>) => {
    conversationById.set(row.id as string, { ...row });
  });

  const aiConversationsFind = vi.fn(() => ({
    exec: async () => [...conversationById.values()].map((r) => doc(r)),
  }));

  const aiConversationsFindOne = vi.fn(({ selector }: { selector: { id?: string } }) => ({
    exec: async () => {
      const r = selector.id ? conversationById.get(selector.id) : undefined;
      return r ? doc(r) : null;
    },
  }));

  const taskById = new Map<string, Record<string, unknown>>();
  const aiTasksInsert = vi.fn(async (row: Record<string, unknown>) => {
    const id = row.id as string;
    taskById.set(id, { ...(taskById.get(id) ?? {}), ...row });
  });
  const aiTasksFindByIndex = vi.fn(async () => []);
  const aiTasksFindOne = vi.fn(({ selector }: { selector: { id?: string } }) => ({
    exec: async () => {
      const r = selector.id ? taskById.get(selector.id) : undefined;
      return r ? doc(r) : null;
    },
  }));
  const aiTasksUpdate = vi.fn(async (id: string, patch: Record<string, unknown>) => {
    const prev = taskById.get(id) ?? {};
    taskById.set(id, { ...prev, ...patch });
  });

  const mockDb = {
    collections: {
      ai_messages: {
        insert: aiMessagesInsert,
        findOne: aiMessagesFindOne,
        findByIndex: aiMessagesFindByIndex,
        removeBySelector: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
      },
      ai_conversations: {
        insert: aiConversationsInsert,
        find: aiConversationsFind,
        findOne: aiConversationsFindOne,
      },
      ai_tasks: {
        insert: aiTasksInsert,
        findByIndex: aiTasksFindByIndex,
        findOne: aiTasksFindOne,
        update: aiTasksUpdate,
      },
      embeddings: {
        findByIndexAnyOf: vi.fn().mockResolvedValue([]),
        bulkInsert: vi.fn().mockResolvedValue(undefined),
      },
      audit_logs: {
        insert: vi.fn().mockResolvedValue(undefined),
      },
    },
  };

  return {
    mockDb,
    aiMessagesInsert,
    resetStores: () => {
      messageById.clear();
      conversationById.clear();
      taskById.clear();
      aiMessagesInsert.mockClear();
      aiConversationsInsert.mockClear();
      aiMessagesFindOne.mockClear();
      aiMessagesFindByIndex.mockClear();
      aiConversationsFind.mockClear();
      aiConversationsFindOne.mockClear();
      aiTasksInsert.mockClear();
      aiTasksFindByIndex.mockClear();
      aiTasksFindOne.mockClear();
      aiTasksUpdate.mockClear();
    },
  };
});

vi.mock('../../db', () => ({
  getDb: vi.fn(() => Promise.resolve(hoisted.mockDb)),
  db: {
    open: vi.fn().mockResolvedValue(undefined),
    ai_messages: { clear: vi.fn().mockResolvedValue(undefined), put: vi.fn() },
    ai_conversations: { clear: vi.fn().mockResolvedValue(undefined) },
    ai_tasks: { clear: vi.fn().mockResolvedValue(undefined) },
    embeddings: { clear: vi.fn().mockResolvedValue(undefined) },
  },
}));

vi.mock('../../ai/ChatOrchestrator', () => {
  class MockChatOrchestrator {
    sendMessage(input: { userText?: string }) {
      const userText = input.userText ?? '';
      async function* stream() {
        if (userText.includes('__PERF_STREAM__')) {
          for (let i = 0; i < 80; i += 1) {
            yield { delta: 'x' };
            await new Promise((resolve) => setTimeout(resolve, 8));
          }
          yield { delta: '', done: true };
          return;
        }

        yield { delta: 'ok' };
        yield { delta: '', done: true };
      }
      return { messages: [], stream: stream() };
    }
  }

  return { ChatOrchestrator: MockChatOrchestrator };
});

class TimedRuntime implements EmbeddingProvider {
  readonly kind = 'local' as const;
  readonly label = 'TimedRuntime';
  readonly modelId = 'timed';

  async preload(): Promise<void> {
    // no-op for perf baseline
  }

  async embed(texts: string[]): Promise<number[][]> {
    await new Promise((resolve) => setTimeout(resolve, 3));
    return texts.map(() => [0.1, 0.2, 0.3]);
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  terminate(): void {
    // no-op
  }
}

describe('AI performance baseline', () => {
  beforeEach(() => {
    hoisted.resetStores();
  });

  afterEach(() => {
    cleanup();
  });

  it('chat stream persistence interval significantly reduces ai_messages.insert frequency', async () => {
    const runScenario = async (intervalMs: number): Promise<number> => {
      hoisted.resetStores();

      const { result, unmount } = renderHook(() => useAiChat({ streamPersistIntervalMs: intervalMs }));

      await waitFor(() => {
        expect(result.current.isBootstrapping).toBe(false);
      });

      await act(async () => {
        await result.current.send('__PERF_STREAM__');
      });

      await waitFor(() => {
        expect(result.current.isStreaming).toBe(false);
      });

      const insertCount = hoisted.aiMessagesInsert.mock.calls.length;
      unmount();
      return insertCount;
    };

    const denseWrites = await runScenario(16);
    const sparseWrites = await runScenario(500);

    expect(denseWrites).toBeGreaterThan(sparseWrites);
    expect(sparseWrites).toBeLessThan(Math.floor(denseWrites * 0.6));

    // eslint-disable-next-line no-console
    console.info('[AI Perf Baseline][chat]', { denseWrites, sparseWrites });
  }, 30000);

  it('embedding baseline reports elapsed and average batch durations', async () => {
    const service = new EmbeddingService(new TimedRuntime());
    const sources: EmbeddingBuildSource[] = Array.from({ length: 120 }, (_, index) => ({
      sourceType: 'utterance',
      sourceId: `utt_${index + 1}`,
      text: `sample text ${index + 1}`,
    }));

    const result = await service.buildEmbeddings(sources, {
      modelId: 'perf-model',
      modelVersion: 'perf-v1',
      batchSize: 12,
    });

    expect(result.total).toBe(120);
    expect(result.generated).toBe(120);
    expect(result.elapsedMs).toBeGreaterThan(0);
    expect(result.averageBatchMs).toBeGreaterThan(0);
    expect(result.elapsedMs).toBeLessThan(8000);

    // eslint-disable-next-line no-console
    console.info('[AI Perf Baseline][embedding]', {
      elapsedMs: result.elapsedMs,
      averageBatchMs: result.averageBatchMs,
      generated: result.generated,
      total: result.total,
    });
  }, 30000);
});
