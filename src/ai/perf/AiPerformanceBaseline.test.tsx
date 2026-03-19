// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { db } from '../../../db';
import { EmbeddingService, type EmbeddingBuildSource } from '../embeddings/EmbeddingService';
import type { EmbeddingProvider } from '../embeddings/EmbeddingProvider';
import { useAiChat } from '../../hooks/useAiChat';

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

async function clearAiTables(): Promise<void> {
  await Promise.all([
    db.ai_messages.clear(),
    db.ai_conversations.clear(),
    db.ai_tasks.clear(),
    db.embeddings.clear(),
  ]);
}

describe('AI performance baseline', () => {
  beforeEach(async () => {
    await db.open();
    await clearAiTables();
  });

  afterEach(async () => {
    cleanup();
    vi.restoreAllMocks();
    await clearAiTables();
  });

  it('chat stream persistence interval significantly reduces ai_messages.put frequency', async () => {
    const runScenario = async (intervalMs: number): Promise<number> => {
      await clearAiTables();

      let putCount = 0;
      const originalPut = db.ai_messages.put.bind(db.ai_messages);
      const putSpy = vi.spyOn(db.ai_messages, 'put').mockImplementation((value, key) => {
        putCount += 1;
        return originalPut(value, key as string | undefined);
      });

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

      unmount();
      putSpy.mockRestore();
      return putCount;
    };

    const denseWrites = await runScenario(16);
    const sparseWrites = await runScenario(500);

    expect(denseWrites).toBeGreaterThan(sparseWrites);
    // Expect at least 40% reduction to ensure interval control has real effect.
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
