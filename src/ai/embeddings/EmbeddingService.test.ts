// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../db';
import { EmbeddingService, type EmbeddingBuildSource } from './EmbeddingService';
import type { EmbeddingRuntime, EmbeddingRuntimeOptions } from './EmbeddingRuntime';

class FakeRuntime implements EmbeddingRuntime {
  constructor(
    private readonly vectors: number[][],
    private readonly shouldFail = false,
  ) {}

  async preload(options: EmbeddingRuntimeOptions): Promise<void> {
    options.onProgress?.({ stage: 'loading', loaded: 1, total: 1 });
    if (this.shouldFail) {
      throw new Error('runtime preload failed');
    }
  }

  async embed(texts: string[], options: EmbeddingRuntimeOptions): Promise<number[][]> {
    options.onProgress?.({ stage: 'embedding', processed: texts.length, totalItems: texts.length });
    if (this.shouldFail) {
      throw new Error('runtime embed failed');
    }
    return this.vectors.slice(0, texts.length);
  }

  terminate(): void {
    // no-op for test runtime
  }
}

async function clearEmbeddingTables(): Promise<void> {
  await Promise.all([
    db.ai_tasks.clear(),
    db.embeddings.clear(),
  ]);
}

describe('EmbeddingService', () => {
  beforeEach(async () => {
    await db.open();
    await clearEmbeddingTables();
  });

  afterEach(async () => {
    await clearEmbeddingTables();
  });

  it('builds embeddings and persists ai task done state', async () => {
    const service = new EmbeddingService(new FakeRuntime([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ]));

    const sources: EmbeddingBuildSource[] = [
      { sourceType: 'utterance', sourceId: 'utt_1', text: 'hello world' },
      { sourceType: 'note', sourceId: 'note_1', text: 'linguistic note' },
    ];

    const result = await service.buildEmbeddings(sources, {
      modelId: 'test-model',
      modelVersion: 'v-test',
      batchSize: 2,
    });

    expect(result.generated).toBe(2);
    expect(result.skipped).toBe(0);

    const task = await db.ai_tasks.get(result.taskId);
    expect(task?.status).toBe('done');

    const rows = await db.embeddings.toArray();
    expect(rows.length).toBe(2);
    expect(rows[0]?.model).toBe('test-model');
    expect(rows[0]?.modelVersion).toBe('v-test');
  });

  it('skips unchanged sources on re-run with same model/version', async () => {
    const service = new EmbeddingService(new FakeRuntime([
      [0.1, 0.2],
      [0.3, 0.4],
    ]));

    const sources: EmbeddingBuildSource[] = [
      { sourceType: 'utterance', sourceId: 'utt_1', text: 'hello world' },
      { sourceType: 'schema', sourceId: 'tier_def_1', text: 'tier description' },
    ];

    await service.buildEmbeddings(sources, {
      modelId: 'test-model',
      modelVersion: 'v-test',
      batchSize: 2,
    });

    const rerun = await service.buildEmbeddings(sources, {
      modelId: 'test-model',
      modelVersion: 'v-test',
      batchSize: 2,
    });

    expect(rerun.generated).toBe(0);
    expect(rerun.skipped).toBe(2);
    expect((await db.embeddings.toArray()).length).toBe(2);
  });

  it('marks ai task failed when runtime throws', async () => {
    const service = new EmbeddingService(new FakeRuntime([], true));

    await expect(service.buildEmbeddings([
      { sourceType: 'utterance', sourceId: 'utt_1', text: 'x' },
    ], {
      modelId: 'test-model',
      modelVersion: 'v-test',
    })).rejects.toThrow('runtime preload failed');

    const tasks = await db.ai_tasks.toArray();
    expect(tasks.length).toBe(1);
    expect(tasks[0]?.status).toBe('failed');
  });
});
