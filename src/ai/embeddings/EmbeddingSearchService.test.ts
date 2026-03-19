// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../db';
import { EmbeddingSearchService } from './EmbeddingSearchService';
import type { EmbeddingProvider } from './EmbeddingProvider';

class QueryRuntime implements EmbeddingProvider {
  readonly kind = 'local' as const;
  readonly label = 'QueryRuntime';
  readonly modelId = 'query';
  preloadCount = 0;

  constructor(private readonly queryVector: number[]) {}

  async preload(): Promise<void> {
    this.preloadCount += 1;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(() => this.queryVector);
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
    db.ai_tasks.clear(),
    db.embeddings.clear(),
    db.media_items.clear(),
    db.utterance_texts.clear(),
    db.user_notes.clear(),
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

  it('forwards runtime progress from preload/embed', async () => {
    await db.embeddings.put({
      id: 'utterance::utt_1::test-model::v-test',
      sourceType: 'utterance',
      sourceId: 'utt_1',
      model: 'test-model',
      modelVersion: 'v-test',
      contentHash: 'h1',
      vector: [1, 0],
      createdAt: new Date().toISOString(),
    });

    const service = new EmbeddingSearchService(new QueryRuntime([1, 0]));
    await service.searchSimilarUtterances('hello', {
      modelId: 'test-model',
      modelVersion: 'v-test',
    });
  });

  it('skips preload on repeated searches with same model', async () => {
    await db.embeddings.put({
      id: 'utterance::utt_1::test-model::v-test',
      sourceType: 'utterance',
      sourceId: 'utt_1',
      model: 'test-model',
      modelVersion: 'v-test',
      contentHash: 'h1',
      vector: [1, 0],
      createdAt: new Date().toISOString(),
    });

    const runtime = new QueryRuntime([1, 0]);
    const service = new EmbeddingSearchService(runtime);
    await service.searchSimilarUtterances('hello', { modelId: 'test-model', modelVersion: 'v-test' });
    await service.searchSimilarUtterances('world', { modelId: 'test-model', modelVersion: 'v-test' });

    expect(runtime.preloadCount).toBe(1);
  });

  it('re-preloads when model changes', async () => {
    await db.embeddings.bulkPut([
      {
        id: 'utterance::utt_1::model-a::v-test',
        sourceType: 'utterance',
        sourceId: 'utt_1',
        model: 'model-a',
        modelVersion: 'v-test',
        contentHash: 'h1',
        vector: [1, 0],
        createdAt: new Date().toISOString(),
      },
      {
        id: 'utterance::utt_1::model-b::v-test',
        sourceType: 'utterance',
        sourceId: 'utt_1',
        model: 'model-b',
        modelVersion: 'v-test',
        contentHash: 'h1',
        vector: [1, 0],
        createdAt: new Date().toISOString(),
      },
    ]);

    const runtime = new QueryRuntime([1, 0]);
    const service = new EmbeddingSearchService(runtime);
    await service.searchSimilarUtterances('hello', { modelId: 'model-a', modelVersion: 'v-test' });
    await service.searchSimilarUtterances('hello', { modelId: 'model-b', modelVersion: 'v-test' });

    expect(runtime.preloadCount).toBe(2);
  });

  it('resets preload cache on terminate', async () => {
    await db.embeddings.put({
      id: 'utterance::utt_1::test-model::v-test',
      sourceType: 'utterance',
      sourceId: 'utt_1',
      model: 'test-model',
      modelVersion: 'v-test',
      contentHash: 'h1',
      vector: [1, 0],
      createdAt: new Date().toISOString(),
    });

    const runtime = new QueryRuntime([1, 0]);
    const service = new EmbeddingSearchService(runtime);
    await service.searchSimilarUtterances('hello', { modelId: 'test-model', modelVersion: 'v-test' });
    service.terminate();
    await service.searchSimilarUtterances('again', { modelId: 'test-model', modelVersion: 'v-test' });

    expect(runtime.preloadCount).toBe(2);
  });

  it('re-preloads when modelVersion changes with same modelId', async () => {
    await db.embeddings.bulkPut([
      {
        id: 'utterance::utt_1::test-model::v1',
        sourceType: 'utterance',
        sourceId: 'utt_1',
        model: 'test-model',
        modelVersion: 'v1',
        contentHash: 'h1',
        vector: [1, 0],
        createdAt: new Date().toISOString(),
      },
      {
        id: 'utterance::utt_1::test-model::v2',
        sourceType: 'utterance',
        sourceId: 'utt_1',
        model: 'test-model',
        modelVersion: 'v2',
        contentHash: 'h1',
        vector: [1, 0],
        createdAt: new Date().toISOString(),
      },
    ]);

    const runtime = new QueryRuntime([1, 0]);
    const service = new EmbeddingSearchService(runtime);
    await service.searchSimilarUtterances('hello', { modelId: 'test-model', modelVersion: 'v1' });
    await service.searchSimilarUtterances('hello', { modelId: 'test-model', modelVersion: 'v2' });

    expect(runtime.preloadCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// searchMultiSource
// ---------------------------------------------------------------------------

describe('EmbeddingSearchService — searchMultiSource', () => {
  beforeEach(async () => {
    await db.open();
    await clearEmbeddingTables();
  });

  afterEach(async () => {
    await clearEmbeddingTables();
  });

  it('returns matches from multiple source types', async () => {
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
        id: 'note::note_1::test-model::v-test',
        sourceType: 'note',
        sourceId: 'note_1',
        model: 'test-model',
        modelVersion: 'v-test',
        contentHash: 'h2',
        vector: [0.9, 0.1],
        createdAt: new Date().toISOString(),
      },
    ]);

    const service = new EmbeddingSearchService(new QueryRuntime([1, 0]));
    const result = await service.searchMultiSource('hello', ['utterance', 'note'], {
      modelId: 'test-model',
      modelVersion: 'v-test',
      topK: 5,
    });

    expect(result.matches.length).toBe(2);
    expect(result.matches[0]?.sourceId).toBe('utt_1');
    expect(result.matches[1]?.sourceId).toBe('note_1');
  });

  it('returns empty when source types array is empty', async () => {
    const service = new EmbeddingSearchService(new QueryRuntime([1, 0]));
    const result = await service.searchMultiSource('hello', [], {
      modelId: 'test-model',
      modelVersion: 'v-test',
    });

    expect(result.matches).toEqual([]);
  });

  it('returns empty when query is blank', async () => {
    const service = new EmbeddingSearchService(new QueryRuntime([1, 0]));
    const result = await service.searchMultiSource('  ', ['utterance']);

    expect(result.matches).toEqual([]);
  });

  it('ranks results across source types by cosine score', async () => {
    await db.embeddings.bulkPut([
      {
        id: 'utterance::utt_1::test-model::v-test',
        sourceType: 'utterance',
        sourceId: 'utt_1',
        model: 'test-model',
        modelVersion: 'v-test',
        contentHash: 'h1',
        vector: [0.5, 0.5],
        createdAt: new Date().toISOString(),
      },
      {
        id: 'note::note_1::test-model::v-test',
        sourceType: 'note',
        sourceId: 'note_1',
        model: 'test-model',
        modelVersion: 'v-test',
        contentHash: 'h2',
        vector: [1, 0],
        createdAt: new Date().toISOString(),
      },
    ]);

    const service = new EmbeddingSearchService(new QueryRuntime([1, 0]));
    const result = await service.searchMultiSource('hello', ['utterance', 'note'], {
      modelId: 'test-model',
      modelVersion: 'v-test',
    });

    // note_1 should rank higher (exact match on [1,0])
    expect(result.matches[0]?.sourceId).toBe('note_1');
    expect(result.matches[1]?.sourceId).toBe('utt_1');
  });

  it('hybrid mode reranks by keyword overlap from source text', async () => {
    const now = new Date().toISOString();
    await db.embeddings.bulkPut([
      {
        id: 'utterance::utt_kw_1::test-model::v-test',
        sourceType: 'utterance',
        sourceId: 'utt_kw_1',
        model: 'test-model',
        modelVersion: 'v-test',
        contentHash: 'hkw1',
        vector: [0.4, 0.6],
        createdAt: now,
      },
      {
        id: 'note::note_kw_1::test-model::v-test',
        sourceType: 'note',
        sourceId: 'note_kw_1',
        model: 'test-model',
        modelVersion: 'v-test',
        contentHash: 'hkw2',
        vector: [0.95, 0.05],
        createdAt: now,
      },
    ]);

    await db.utterance_texts.put({
      id: 'utxt_kw_1',
      utteranceId: 'utt_kw_1',
      tierId: 'tier_1',
      modality: 'text',
      text: 'hello world from utterance',
      sourceType: 'human',
      createdAt: now,
      updatedAt: now,
    });

    await db.user_notes.put({
      id: 'note_kw_1',
      targetType: 'utterance',
      targetId: 'utt_kw_1',
      content: { en: 'irrelevant note text' },
      category: 'linguistic',
      createdAt: now,
      updatedAt: now,
    });

    const service = new EmbeddingSearchService(new QueryRuntime([1, 0]));
    const vectorOnly = await service.searchMultiSource('hello world', ['utterance', 'note'], {
      modelId: 'test-model',
      modelVersion: 'v-test',
      topK: 2,
    });
    expect(vectorOnly.matches[0]?.sourceId).toBe('note_kw_1');

    const hybrid = await service.searchMultiSourceHybrid('hello world', ['utterance', 'note'], {
      modelId: 'test-model',
      modelVersion: 'v-test',
      topK: 2,
      keywordWeight: 0.9,
    });
    expect(hybrid.matches[0]?.sourceId).toBe('utt_kw_1');
  });

  it('hybrid mode reranks with full-text score when keyword weight is disabled', async () => {
    const now = new Date().toISOString();
    await db.embeddings.bulkPut([
      {
        id: 'utterance::utt_ft_1::test-model::v-test',
        sourceType: 'utterance',
        sourceId: 'utt_ft_1',
        model: 'test-model',
        modelVersion: 'v-test',
        contentHash: 'hft1',
        vector: [0.45, 0.55],
        createdAt: now,
      },
      {
        id: 'note::note_ft_1::test-model::v-test',
        sourceType: 'note',
        sourceId: 'note_ft_1',
        model: 'test-model',
        modelVersion: 'v-test',
        contentHash: 'hft2',
        vector: [0.95, 0.05],
        createdAt: now,
      },
    ]);

    await db.utterance_texts.put({
      id: 'utxt_ft_1',
      utteranceId: 'utt_ft_1',
      tierId: 'tier_1',
      modality: 'text',
      text: 'rare morphology pattern for elicitation',
      sourceType: 'human',
      createdAt: now,
      updatedAt: now,
    });

    await db.user_notes.put({
      id: 'note_ft_1',
      targetType: 'utterance',
      targetId: 'utt_ft_1',
      content: { en: 'generic note' },
      category: 'linguistic',
      createdAt: now,
      updatedAt: now,
    });

    const service = new EmbeddingSearchService(new QueryRuntime([1, 0]));
    const result = await service.searchMultiSourceHybrid('morphology elicitation', ['utterance', 'note'], {
      modelId: 'test-model',
      modelVersion: 'v-test',
      topK: 2,
      keywordWeight: 0,
      fullTextWeight: 0.9,
    });

    expect(result.matches[0]?.sourceId).toBe('utt_ft_1');
  });

  it('hybrid mode recalls lexical candidates when vector candidates are missing', async () => {
    const now = new Date().toISOString();
    await db.utterance_texts.put({
      id: 'utxt_kw_only',
      utteranceId: 'utt_kw_only',
      tierId: 'tier_1',
      modality: 'text',
      text: 'field methods and morphology overview',
      sourceType: 'human',
      createdAt: now,
      updatedAt: now,
    });

    const service = new EmbeddingSearchService(new QueryRuntime([1, 0]));
    const result = await service.searchMultiSourceHybrid('morphology methods', ['utterance'], {
      modelId: 'test-model',
      modelVersion: 'v-test',
      topK: 3,
      keywordWeight: 0.9,
    });

    expect(result.matches[0]?.sourceType).toBe('utterance');
    expect(result.matches[0]?.sourceId).toBe('utt_kw_only');
  });

  it('hybrid mode recalls pdf candidates by extracted text', async () => {
    const now = new Date().toISOString();
    await db.media_items.put({
      id: 'media_pdf_1',
      textId: 'text_1',
      filename: 'grammar-notes.pdf',
      details: {
        mimeType: 'application/pdf',
        extractedText: 'Morphology paradigms and field methods documentation.',
      },
      isOfflineCached: true,
      createdAt: now,
    });

    const service = new EmbeddingSearchService(new QueryRuntime([1, 0]));
    const result = await service.searchMultiSourceHybrid('morphology methods', ['pdf'], {
      modelId: 'test-model',
      modelVersion: 'v-test',
      topK: 3,
      keywordWeight: 0.9,
    });

    expect(result.matches[0]?.sourceType).toBe('pdf');
    expect(result.matches[0]?.sourceId).toBe('media_pdf_1');
  });

  it('applies fusion scenario profiles correctly', async () => {
    const now = new Date().toISOString();

    await db.embeddings.bulkPut([
      {
        id: 'utterance::utt_1::test-model::v-test',
        sourceType: 'utterance',
        sourceId: 'utt_1',
        model: 'test-model',
        modelVersion: 'v-test',
        contentHash: 'h1',
        vector: [1, 0],
        createdAt: now,
      },
    ]);

    const service = new EmbeddingSearchService(new QueryRuntime([1, 0]));

    // 测试 QA 模式 | Test QA profile
    const qaResult = await service.searchMultiSourceHybrid('hello world', ['utterance'], {
      modelId: 'test-model',
      modelVersion: 'v-test',
      topK: 1,
      fusionScenario: 'qa',
    });
    expect(qaResult.matches.length).toBeGreaterThan(0);

    // 测试术语模式 | Test terminology profile
    const termResult = await service.searchMultiSourceHybrid('hello world', ['utterance'], {
      modelId: 'test-model',
      modelVersion: 'v-test',
      topK: 1,
      fusionScenario: 'terminology',
    });
    expect(termResult.matches.length).toBeGreaterThan(0);

    // 验证手动参数覆盖模板 | Verify manual parameters override profile
    const overrideResult = await service.searchMultiSourceHybrid('hello world', ['utterance'], {
      modelId: 'test-model',
      modelVersion: 'v-test',
      topK: 1,
      fusionScenario: 'qa',
      keywordWeight: 0.8, // 手动覆盖 QA 模板的 0.25 | Override QA's 0.25
    });
    expect(overrideResult.matches.length).toBeGreaterThan(0);
  });
});

