// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../db';
import { EmbeddingSearchService } from './EmbeddingSearchService';
import type { EmbeddingRuntime, EmbeddingRuntimeOptions } from './EmbeddingRuntime';

class QueryRuntime implements EmbeddingRuntime {
  constructor(private readonly queryVector: number[]) {}

  async preload(_options: EmbeddingRuntimeOptions): Promise<void> {
    // no-op
  }

  async embed(texts: string[], _options: EmbeddingRuntimeOptions): Promise<number[][]> {
    return texts.map(() => this.queryVector);
  }

  terminate(): void {
    // no-op
  }
}

async function clearEmbeddingTables(): Promise<void> {
  await Promise.all([
    db.ai_tasks.clear(),
    db.embeddings.clear(),
  ]);
}

describe('EmbeddingSearchService', () => {
  beforeEach(async () => {
    await db.open();
    await clearEmbeddingTables();
  });

  afterEach(async () => {
    await clearEmbeddingTables();
  });

  it('returns top-k utterance matches by cosine score', async () => {
    await db.embeddings.bulkPut([
      {
        id: 'utterance::utt_1::test-model::v-test',
        sourceType: 'utterance',
        sourceId: 'utt_1',
        model: 'test-model',
        modelVersion: 'v-test',
        contentHash: 'h1',
        vector: [1, 0],
        createdAt: new Date().toISOString(),
      },
      {
        id: 'utterance::utt_2::test-model::v-test',
        sourceType: 'utterance',
        sourceId: 'utt_2',
        model: 'test-model',
        modelVersion: 'v-test',
        contentHash: 'h2',
        vector: [0.8, 0.2],
        createdAt: new Date().toISOString(),
      },
      {
        id: 'utterance::utt_3::test-model::v-test',
        sourceType: 'utterance',
        sourceId: 'utt_3',
        model: 'test-model',
        modelVersion: 'v-test',
        contentHash: 'h3',
        vector: [0, 1],
        createdAt: new Date().toISOString(),
      },
    ]);

    const service = new EmbeddingSearchService(new QueryRuntime([1, 0]));
    const result = await service.searchSimilarUtterances('hello', {
      modelId: 'test-model',
      modelVersion: 'v-test',
      topK: 2,
    });

    expect(result.matches.length).toBe(2);
    expect(result.matches[0]?.sourceId).toBe('utt_1');
    expect(result.matches[1]?.sourceId).toBe('utt_2');
    expect(result.matches[0]?.score).toBeGreaterThan(result.matches[1]?.score ?? 0);
  });

  it('filters by candidate source ids', async () => {
    await db.embeddings.bulkPut([
      {
        id: 'utterance::utt_1::test-model::v-test',
        sourceType: 'utterance',
        sourceId: 'utt_1',
        model: 'test-model',
        modelVersion: 'v-test',
        contentHash: 'h1',
        vector: [1, 0],
        createdAt: new Date().toISOString(),
      },
      {
        id: 'utterance::utt_2::test-model::v-test',
        sourceType: 'utterance',
        sourceId: 'utt_2',
        model: 'test-model',
        modelVersion: 'v-test',
        contentHash: 'h2',
        vector: [0.9, 0.1],
        createdAt: new Date().toISOString(),
      },
    ]);

    const service = new EmbeddingSearchService(new QueryRuntime([1, 0]));
    const result = await service.searchSimilarUtterances('hello', {
      modelId: 'test-model',
      modelVersion: 'v-test',
      topK: 5,
      candidateSourceIds: ['utt_2'],
    });

    expect(result.matches.map((item) => item.sourceId)).toEqual(['utt_2']);
  });

  it('returns empty when query is blank', async () => {
    const service = new EmbeddingSearchService(new QueryRuntime([1, 0]));
    const result = await service.searchSimilarUtterances('   ', {
      modelId: 'test-model',
      modelVersion: 'v-test',
    });

    expect(result.matches).toEqual([]);
  });
});
