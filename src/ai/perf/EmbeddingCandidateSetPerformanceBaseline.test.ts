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
    db.layer_units.clear(),
    db.layer_unit_contents.clear(),
    db.unit_relations.clear(),
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

    const segments = Array.from({ length: total }, (_, index) => ({
      id: `segv2_tier_perf_utt_perf_${index + 1}`,
      textId: 'text_perf',
      mediaId: 'media_perf',
      layerId: 'tier_perf',
      unitType: 'segment' as const,
      parentUnitId: `utt_perf_${index + 1}`,
      rootUnitId: `utt_perf_${index + 1}`,
      startTime: index,
      endTime: index + 0.8,
      createdAt: now,
      updatedAt: now,
    }));
    const texts = Array.from({ length: total }, (_, index) => ({
      id: `utr_perf_${index + 1}`,
      textId: 'text_perf',
      unitId: `segv2_tier_perf_utt_perf_${index + 1}`,
      layerId: 'tier_perf',
      contentRole: 'primary_text' as const,
      modality: 'text' as const,
      text: index % 7 === 0
        ? `morphology keyword ${index + 1}`
        : `generic utterance ${index + 1}`,
      sourceType: 'human' as const,
      createdAt: now,
      updatedAt: now,
    }));

    await db.embeddings.bulkPut(embeddings);
  await db.layer_units.bulkPut(segments);
  await db.layer_unit_contents.bulkPut(texts);

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
    // 全量测试并发下 IndexedDB + embedding query 会明显放大抖动，保留 8.25s 基线以监控真实退化
    // Under full-suite concurrency, IndexedDB + embedding query jitter grows significantly; keep an 8.25s baseline to catch real regressions.
    expect(elapsedMs).toBeLessThan(8250);
    // eslint-disable-next-line no-console
    console.info('[Embedding Candidate Perf Baseline]', {
      elapsedMs: Number(elapsedMs.toFixed(3)),
      total,
      candidates: candidateIds.length,
      topK: result.matches.length,
    });
  }, 15000);
});
