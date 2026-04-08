import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkerEmbeddingRuntime } from './EmbeddingRuntime';

type WorkerMessageHandler = (event: MessageEvent<unknown>) => void;

class FakeEmbeddingWorker {
  onmessage: WorkerMessageHandler | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;

  postMessage(message: { type: string; requestId: string }): void {
    if (message.type === 'preload') {
      queueMicrotask(() => {
        this.onmessage?.({
          data: {
            type: 'progress',
            requestId: message.requestId,
            progress: { stage: 'loading', loaded: 1, total: 2 },
          },
        } as MessageEvent);
      });
      queueMicrotask(() => {
        this.onmessage?.({
          data: {
            type: 'result',
            requestId: message.requestId,
            ok: true,
            vectors: [],
          },
        } as MessageEvent);
      });
      return;
    }

    queueMicrotask(() => {
      this.onmessage?.({
        data: {
          type: 'progress',
          requestId: message.requestId,
          progress: { stage: 'embedding', processed: 1, totalItems: 1 },
        },
      } as MessageEvent);
    });
    queueMicrotask(() => {
      this.onmessage?.({
        data: {
          type: 'result',
          requestId: message.requestId,
          ok: true,
          vectors: [[1, 0, 0]],
        },
      } as MessageEvent);
    });
  }

  terminate(): void {}
}

describe('WorkerEmbeddingRuntime', () => {
  let originalWorker: typeof Worker;

  beforeEach(() => {
    originalWorker = globalThis.Worker;
    globalThis.Worker = FakeEmbeddingWorker as unknown as typeof Worker;
  });

  afterEach(() => {
    globalThis.Worker = originalWorker;
    vi.restoreAllMocks();
  });

  it('forwards progress and resolves preload/embed worker requests', async () => {
    const runtime = new WorkerEmbeddingRuntime();
    const onProgress = vi.fn();

    await runtime.preload({ modelId: 'demo-model', onProgress });
    const vectors = await runtime.embed(['hello'], { modelId: 'demo-model', onProgress });

    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ stage: 'loading', loaded: 1, total: 2 }));
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ stage: 'embedding', processed: 1, totalItems: 1 }));
    expect(vectors).toEqual([[1, 0, 0]]);

    runtime.terminate();
  });

  it('rejects pending requests when the worker errors', async () => {
    class ErrorWorker extends FakeEmbeddingWorker {
      override postMessage(): void {
        queueMicrotask(() => {
          this.onerror?.({ message: 'worker exploded' } as ErrorEvent);
        });
      }
    }

    globalThis.Worker = ErrorWorker as unknown as typeof Worker;
    const runtime = new WorkerEmbeddingRuntime();

    await expect(runtime.preload({ modelId: 'demo-model' })).rejects.toThrow('worker exploded');
    runtime.terminate();
  });
});