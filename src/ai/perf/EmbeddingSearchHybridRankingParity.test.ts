// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import type { EmbeddingProvider } from '../embeddings/EmbeddingProvider';
import {
  EmbeddingSearchService,
  type EmbeddingSearchHybridPerfPhase,
} from '../embeddings/EmbeddingSearchService';

class ParityQueryRuntime implements EmbeddingProvider {
  readonly kind = 'local' as const;
  readonly label = 'ParityQueryRuntime';
  readonly modelId = 'parity-model';

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

async function clearEmbeddingTables(): Promise<void> {
  await Promise.all([
    db.embeddings.clear(),
    db.layer_units.clear(),
    db.layer_unit_contents.clear(),
    db.unit_relations.clear(),
  ]);
}

async function putCanonicalUnitSegmentation(input: {
  unitId: string;
  segmentId: string;
  contentId: string;
  layerId: string;
  text: string;
  now: string;
}): Promise<void> {
  await db.layer_units.put({
    id: input.segmentId,
    textId: 'text_1',
    mediaId: 'media_1',
    layerId: input.layerId,
    unitType: 'segment',
    parentUnitId: input.unitId,
    rootUnitId: input.unitId,
    startTime: 0,
    endTime: 1,
    createdAt: input.now,
    updatedAt: input.now,
  });
  await db.layer_unit_contents.put({
    id: input.contentId,
    textId: 'text_1',
    unitId: input.segmentId,
    layerId: input.layerId,
    contentRole: 'primary_text',
    modality: 'text',
    text: input.text,
    sourceType: 'human',
    createdAt: input.now,
    updatedAt: input.now,
  });
}

const coverageRelaxed = process.env.npm_lifecycle_event === 'test:coverage';

describe('EmbeddingSearchService hybrid ranking parity (perf / regression)', () => {
  beforeEach(async () => {
    await db.open();
    await clearEmbeddingTables();
  });

  afterEach(async () => {
    await clearEmbeddingTables();
  });

  it('reports coarse hybrid phase timings when onSearchPerfPhase is set', async () => {
    const now = new Date().toISOString();
    await db.embeddings.put({
      id: 'unit::utt_phase::test-model::v-test',
      sourceType: 'unit',
      sourceId: 'utt_phase',
      model: 'test-model',
      modelVersion: 'v-test',
      contentHash: 'h1',
      vector: [1, 0],
      createdAt: now,
    });
    await putCanonicalUnitSegmentation({
      unitId: 'utt_phase',
      segmentId: 'segv2_tier_1_utt_phase',
      contentId: 'utxt_phase',
      layerId: 'tier_1',
      text: 'morphology keyword phase marker',
      now,
    });

    const phases: Partial<Record<EmbeddingSearchHybridPerfPhase, number>> = {};
    const service = new EmbeddingSearchService(new ParityQueryRuntime());
    await service.searchMultiSourceHybrid('morphology keyword', ['unit'], {
      modelId: 'test-model',
      modelVersion: 'v-test',
      topK: 5,
      fusionScenario: 'terminology',
      minScore: 0,
      onSearchPerfPhase: (phase, ms) => {
        phases[phase] = ms;
      },
    });

    expect(phases['vector-retrieval']).toBeDefined();
    expect(phases['vector-retrieval']!).toBeGreaterThanOrEqual(0);
    expect(phases['text-and-keyword-pool']).toBeDefined();
    expect(phases['text-and-keyword-pool']!).toBeGreaterThanOrEqual(0);
    expect(phases['minisearch-and-rerank']).toBeDefined();
    expect(phases['minisearch-and-rerank']!).toBeGreaterThanOrEqual(0);
  });

  it(
    'ranks lexical-only parity target first among a large candidate set (terminology hybrid)',
    async () => {
      const now = new Date().toISOString();
      const filler = 180;
      const embeddings = Array.from({ length: filler }, (_, index) => ({
        id: `unit::utt_fill_${index}::test-model::v-test`,
        sourceType: 'unit' as const,
        sourceId: `utt_fill_${index}`,
        model: 'test-model',
        modelVersion: 'v-test',
        contentHash: `hf_${index}`,
        vector: [1, 0],
        createdAt: now,
      }));
      embeddings.push({
        id: 'unit::utt_parity_unique::test-model::v-test',
        sourceType: 'unit',
        sourceId: 'utt_parity_unique',
        model: 'test-model',
        modelVersion: 'v-test',
        contentHash: 'h_unique',
        vector: [0.05, 0.995],
        createdAt: now,
      });
      await db.embeddings.bulkPut(embeddings);

      await putCanonicalUnitSegmentation({
        unitId: 'utt_parity_unique',
        segmentId: 'segv2_tier_1_utt_parity_unique',
        contentId: 'utxt_parity_unique',
        layerId: 'tier_1',
        text: 'noise before zzparityfixturetoken99 after',
        now,
      });

      const candidateIds = [
        ...Array.from({ length: filler }, (_, index) => `utt_fill_${index}`),
        'utt_parity_unique',
      ];

      const service = new EmbeddingSearchService(new ParityQueryRuntime());
      const hybrid = await service.searchMultiSourceHybrid('zzparityfixturetoken99', ['unit'], {
        modelId: 'test-model',
        modelVersion: 'v-test',
        topK: 5,
        fusionScenario: 'terminology',
        minScore: 0,
        candidateSourceIds: candidateIds,
      });

      expect(hybrid.matches[0]?.sourceId).toBe('utt_parity_unique');

      const vectorOnly = await service.searchMultiSource('zzparityfixturetoken99', ['unit'], {
        modelId: 'test-model',
        modelVersion: 'v-test',
        topK: 5,
        minScore: 0,
        candidateSourceIds: candidateIds,
      });
      expect(vectorOnly.matches[0]?.sourceId).not.toBe('utt_parity_unique');

      const perfBudgetMs = coverageRelaxed ? 120_000 : 12_000;
      const started = performance.now();
      await service.searchMultiSourceHybrid('zzparityfixturetoken99', ['unit'], {
        modelId: 'test-model',
        modelVersion: 'v-test',
        topK: 8,
        fusionScenario: 'terminology',
        minScore: 0,
        candidateSourceIds: candidateIds,
      });
      expect(performance.now() - started).toBeLessThan(perfBudgetMs);
    },
    coverageRelaxed ? 180_000 : 20_000,
  );
});
