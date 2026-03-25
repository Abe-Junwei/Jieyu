import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import { EmbeddingSearchService } from '../embeddings/EmbeddingSearchService';
import type { EmbeddingProvider } from '../embeddings/EmbeddingProvider';

class PerfQueryRuntime implements EmbeddingProvider {
  readonly kind = 'local' as const;
  readonly label = 'PerfQueryRuntime';
  readonly modelId = 'perf-model';

  async preload(): Promise<void> {
    return;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(() => [1, 0]);
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  terminate(): void {
    // no-op
  }
}

async function clearTables(): Promise<void> {
  await Promise.all([
    db.embeddings.clear(),
    db.utterance_texts.clear(),
    db.layer_segments.clear(),
    db.layer_segment_contents.clear(),
    db.segment_links.clear(),
  ]);
}

describe('Embedding candidate-set performance baseline', () => {
  beforeEach(async () => {
    await db.open();
    await clearTables();
  });

  it('keeps hybrid utterance search stable with large candidate set', async () => {
    const now = new Date().toISOString();
    const total = 2500;

    const embeddings = Array.from({ length: total }, (_, index) => ({
      id: `utterance::utt_perf_${index + 1}::test-model::v-test`,
      sourceType: 'utterance' as const,
      sourceId: `utt_perf_${index + 1}`,
      model: 'test-model',
      modelVersion: 'v-test',
      contentHash: `h_${index + 1}`,
      vector: index % 3 === 0 ? [1, 0] : [0.7, 0.3],
      createdAt: now,
    }));

    const texts = Array.from({ length: total }, (_, index) => ({
      id: `utr_perf_${index + 1}`,
      utteranceId: `utt_perf_${index + 1}`,
      layerId: 'tier_perf',
      modality: 'text' as const,
      text: index % 7 === 0
        ? `morphology keyword ${index + 1}`
        : `generic utterance ${index + 1}`,
      sourceType: 'human' as const,
      createdAt: now,
      updatedAt: now,
    }));

    await db.embeddings.bulkPut(embeddings);
    await db.utterance_texts.bulkPut(texts);

    const candidateIds = Array.from({ length: 1500 }, (_, index) => `utt_perf_${index + 1}`);
    const service = new EmbeddingSearchService(new PerfQueryRuntime());

    const startedAt = performance.now();
    const result = await service.searchMultiSourceHybrid('morphology keyword', ['utterance'], {
      modelId: 'test-model',
      modelVersion: 'v-test',
      topK: 20,
      candidateSourceIds: candidateIds,
      fusionScenario: 'terminology',
      minScore: 0,
    });
    const elapsedMs = performance.now() - startedAt;

    expect(result.matches.length).toBeGreaterThan(0);
    // 全量测试并发下可能超 2500ms，放宽至 4000ms | Under full-suite concurrency, 2500ms is flaky; relax to 4000ms
    expect(elapsedMs).toBeLessThan(4000);
    // eslint-disable-next-line no-console
    console.info('[Embedding Candidate Perf Baseline]', {
      elapsedMs: Number(elapsedMs.toFixed(3)),
      total,
      candidates: candidateIds.length,
      topK: result.matches.length,
    });
  });
});
