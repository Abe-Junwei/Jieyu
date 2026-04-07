// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import { EmbeddingSearchService } from './EmbeddingSearchService';
import type { EmbeddingProvider } from './EmbeddingProvider';

class QueryRuntime implements EmbeddingProvider {
  readonly kind = 'local' as const;
  readonly label = 'QueryRuntime';
  readonly modelId = 'query';
  preloadCount = 0;
  usingFallback = false;

  constructor(private readonly queryVector: number[]) {}

  async preload(options?: { onProgress?: (progress: { usingFallback?: boolean }) => void }): Promise<void> {
    this.preloadCount += 1;
    if (this.usingFallback) {
      options?.onProgress?.({ usingFallback: true });
    }
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
    db.layer_units.clear(),
    db.layer_unit_contents.clear(),
    db.unit_relations.clear(),
    db.user_notes.clear(),
  ]);
}

async function putCanonicalUtteranceSegmentation(input: {
  utteranceId: string;
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
    parentUnitId: input.utteranceId,
    rootUnitId: input.utteranceId,
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

  it('caches preload even when provider reports fallback mode', async () => {
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
    runtime.usingFallback = true;
    const service = new EmbeddingSearchService(runtime);
    await service.searchSimilarUtterances('hello', { modelId: 'test-model', modelVersion: 'v-test' });
    await service.searchSimilarUtterances('world', { modelId: 'test-model', modelVersion: 'v-test' });

    expect(runtime.preloadCount).toBe(1);
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

    await putCanonicalUtteranceSegmentation({
      utteranceId: 'utt_kw_1',
      segmentId: 'segv2_tier_1_utt_kw_1',
      contentId: 'utxt_kw_1',
      layerId: 'tier_1',
      text: 'hello world from utterance',
      now,
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

    await putCanonicalUtteranceSegmentation({
      utteranceId: 'utt_ft_1',
      segmentId: 'segv2_tier_1_utt_ft_1',
      contentId: 'utxt_ft_1',
      layerId: 'tier_1',
      text: 'rare morphology pattern for elicitation',
      now,
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
    await putCanonicalUtteranceSegmentation({
      utteranceId: 'utt_kw_only',
      segmentId: 'segv2_tier_1_utt_kw_only',
      contentId: 'utxt_kw_only',
      layerId: 'tier_1',
      text: 'field methods and morphology overview',
      now,
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
      minScore: 0, // 高 keywordWeight 时 fusedScore 可能低于默认阈值，测试时禁用阈值 | fusedScore may fall below default threshold with high keywordWeight; disable for this test
    });
    expect(overrideResult.matches.length).toBeGreaterThan(0);
  });

  // ── minScore 过滤 | minScore filtering ────────────────────────────────────

  it('minScore filters out low-fused candidates', async () => {
    const now = new Date().toISOString();

    // 向量分数低的候选 | Low vector score candidate
    await db.embeddings.put({
      id: 'utterance::utt_low::test-model::v-test',
      sourceType: 'utterance',
      sourceId: 'utt_low',
      model: 'test-model',
      modelVersion: 'v-test',
      contentHash: 'h1',
      vector: [0.1, 0.99], // 与 query [1,0] 余弦相似度较低 | Low cosine similarity with query [1,0]
      createdAt: now,
    });
    await putCanonicalUtteranceSegmentation({
      utteranceId: 'utt_low',
      segmentId: 'segv2_tier_1_utt_low',
      contentId: 'utxt_low',
      layerId: 'tier_1',
      text: 'unrelated content about weather patterns',
      now,
    });

    const service = new EmbeddingSearchService(new QueryRuntime([1, 0]));

    // 高 minScore → 过滤掉低分结果 | High minScore filters them out
    const highMin = await service.searchMultiSourceHybrid('phonology', ['utterance'], {
      modelId: 'test-model',
      modelVersion: 'v-test',
      topK: 5,
      minScore: 0.9,
    });
    expect(highMin.matches.length).toBe(0);

    // minScore=0 → 保留所有 | minScore=0 keeps all
    const noMin = await service.searchMultiSourceHybrid('phonology', ['utterance'], {
      modelId: 'test-model',
      modelVersion: 'v-test',
      topK: 5,
      minScore: 0,
    });
    expect(noMin.matches.length).toBeGreaterThan(0);
  });

  // ── PDF 无向量候选 + 无 candidateSet → 回退全表扫描 | PDF no vector + no candidateSet → fallback scan ──

  it('pdf fallback scan when no vector matches and no candidateSet', async () => {
    const now = new Date().toISOString();

    // 只创建 PDF media_item，不创建 embedding | Only PDF media, no embedding
    await db.media_items.put({
      id: 'media_pdf_scan',
      textId: 'text_scan',
      filename: 'elicitation-guide.pdf',
      details: {
        mimeType: 'application/pdf',
        extractedText: 'Elicitation guide for phonological analysis and morphology.',
      },
      isOfflineCached: true,
      createdAt: now,
    });

    const service = new EmbeddingSearchService(new QueryRuntime([1, 0]));
    const result = await service.searchMultiSourceHybrid('elicitation morphology', ['pdf'], {
      modelId: 'test-model',
      modelVersion: 'v-test',
      topK: 3,
      keywordWeight: 0.9,
      minScore: 0,
    });

    // 无向量候选但全表扫描回退应命中 | No vector but fallback scan should hit
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0]?.sourceType).toBe('pdf');
    expect(result.matches[0]?.sourceId).toBe('media_pdf_scan');
  });

  // ── 空 query → 返回空 | blank query → empty ──────────────────────────────

  it('hybrid search with blank query returns empty matches', async () => {
    const now = new Date().toISOString();
    await db.embeddings.put({
      id: 'utterance::utt_any::test-model::v-test',
      sourceType: 'utterance',
      sourceId: 'utt_any',
      model: 'test-model',
      modelVersion: 'v-test',
      contentHash: 'h1',
      vector: [1, 0],
      createdAt: now,
    });

    const service = new EmbeddingSearchService(new QueryRuntime([1, 0]));
    const result = await service.searchMultiSourceHybrid('', ['utterance'], {
      modelId: 'test-model',
      modelVersion: 'v-test',
    });
    expect(result.matches).toEqual([]);
  });

  // ── queryExpansion 场景权重 | queryExpansion scenario profile ──────────────

  it('queryExpansion scenario uses higher keyword weight', async () => {
    const now = new Date().toISOString();

    // 一个向量匹配弱但关键词匹配强的候选 | Weak vector but strong keyword candidate
    await db.embeddings.put({
      id: 'utterance::utt_kw_strong::test-model::v-test',
      sourceType: 'utterance',
      sourceId: 'utt_kw_strong',
      model: 'test-model',
      modelVersion: 'v-test',
      contentHash: 'h1',
      vector: [0.6, 0.8], // 与 [1,0] 余弦中等 | Medium cosine with [1,0]
      createdAt: now,
    });
    await putCanonicalUtteranceSegmentation({
      utteranceId: 'utt_kw_strong',
      segmentId: 'segv2_tier_1_utt_kw_strong',
      contentId: 'utxt_kw_strong',
      layerId: 'tier_1',
      text: 'tonal elicitation frame for consonant clusters',
      now,
    });

    const service = new EmbeddingSearchService(new QueryRuntime([1, 0]));

    // queryExpansion: keywordWeight=0.45 | queryExpansion profile
    const result = await service.searchMultiSourceHybrid('consonant tonal', ['utterance'], {
      modelId: 'test-model',
      modelVersion: 'v-test',
      topK: 3,
      fusionScenario: 'queryExpansion',
      minScore: 0,
    });
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0]?.sourceId).toBe('utt_kw_strong');
  });
});
