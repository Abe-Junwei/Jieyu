import { getDb } from '../../../db';
import type { EmbeddingSourceType } from '../../../db';
import type { EmbeddingProvider } from './EmbeddingProvider';
import MiniSearch from 'minisearch';
import { splitPdfCitationRef } from '../../utils/citationJumpUtils';
import { extractPdfSnippet, isPdfMediaItem } from './pdfTextUtils';
import { resolveFusionWeightsForScenario, type SearchFusionScenario } from './searchFusionProfiles';

export interface SearchSimilarUtterancesOptions {
  modelId?: string;
  modelVersion?: string;
  topK?: number;
  retries?: number;
  candidateSourceIds?: readonly string[];
  keywordWeight?: number;
  fullTextWeight?: number;
  /** 检索融合场景（qa|review|terminology|balanced），默认 balanced | Fusion scenario profile */
  fusionScenario?: SearchFusionScenario;
  /** 最低相似度阈值（0-1）；低于此值的匹配结果将被丢弃，默认 0.3 | Minimum similarity score threshold (0-1); matches below this are discarded */
  minScore?: number;
}

export interface SimilarUtteranceMatch {
  sourceType: EmbeddingSourceType;
  sourceId: string;
  score: number;
  model: string;
  modelVersion?: string;
}

export interface SearchSimilarUtterancesResult {
  query: string;
  matches: SimilarUtteranceMatch[];
}

const DEFAULT_MODEL_ID = 'Xenova/multilingual-e5-small';
const DEFAULT_MODEL_VERSION = '2026-03';
const DEFAULT_MIN_SCORE = 0.3;

function normalizeTopK(input: number | undefined): number {
  if (!Number.isFinite(input)) return 5;
  return Math.min(20, Math.max(1, Math.floor(input ?? 5)));
}

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function tokenizeQuery(text: string): string[] {
  const lowered = text.toLowerCase();
  // 中文按字 + 拉丁文本按词的混合轻量切分 | Lightweight mixed tokenizer for CJK + latin words.
  const cjkChars = lowered.match(/[\u4e00-\u9fff]/g) ?? [];
  const latinWords = lowered.split(/[^\p{L}\p{N}]+/u).filter((item) => item.length >= 2);
  return [...new Set([...cjkChars, ...latinWords])];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function normalizeKeywordWeight(input: number | undefined): number {
  if (!Number.isFinite(input)) return 0.3;
  return clamp01(input ?? 0.3);
}

function normalizeFullTextWeight(input: number | undefined): number {
  if (!Number.isFinite(input)) return 0.2;
  return clamp01(input ?? 0.2);
}

function extractNoteText(content: Record<string, string> | undefined): string {
  if (!content) return '';
  return content.und ?? content.en ?? Object.values(content).find((v) => v.trim()) ?? '';
}

function calcKeywordScore(rawText: string, queryTokens: readonly string[]): number {
  const lowered = rawText.trim().toLowerCase();
  if (!lowered || queryTokens.length === 0) return 0;
  let hitCount = 0;
  for (const token of queryTokens) {
    if (lowered.includes(token)) hitCount += 1;
  }
  return hitCount / queryTokens.length;
}

function buildFullTextScoreMap(
  query: string,
  candidates: ReadonlyMap<string, { rawText: string }>,
): Map<string, number> {
  const docs = Array.from(candidates.entries())
    .map(([id, value]) => ({ id, text: value.rawText.trim() }))
    .filter((doc) => doc.text.length > 0);
  if (docs.length === 0) return new Map();

  const miniSearch = new MiniSearch<{ id: string; text: string }>({
    fields: ['text'],
    storeFields: ['id'],
    idField: 'id',
    searchOptions: {
      prefix: true,
      fuzzy: 0.2,
      boost: { text: 2 },
    },
    tokenize: (text) => {
      const lowered = text.toLowerCase();
      const cjkChars = lowered.match(/[\u4e00-\u9fff]/g) ?? [];
      const latinWords = lowered.split(/[^\p{L}\p{N}]+/u).filter((item) => item.length >= 2);
      return [...new Set([...cjkChars, ...latinWords])];
    },
    processTerm: (term) => term.trim(),
  });

  miniSearch.addAll(docs);
  const results = miniSearch.search(query);
  if (results.length === 0) return new Map();

  const maxScore = Math.max(...results.map((item) => item.score));
  if (!Number.isFinite(maxScore) || maxScore <= 0) return new Map();

  const scoreMap = new Map<string, number>();
  for (const item of results) {
    const normalized = clamp01(item.score / maxScore);
    scoreMap.set(item.id as string, normalized);
  }
  return scoreMap;
}

function cosineSimilarity(a: number[], b: number[]): number {
  const size = Math.min(a.length, b.length);
  if (size === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < size; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }

  if (normA <= 0 || normB <= 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class EmbeddingSearchService {
  private preloadedCacheKey: string | null = null;

  constructor(private readonly provider: EmbeddingProvider) {}

  private async ensurePreloaded(cacheKey: string): Promise<void> {
    if (this.preloadedCacheKey === cacheKey) return;

    let usingFallback = false;
    await this.provider.preload?.({
      onProgress: (progress) => {
        if (progress.usingFallback) {
          usingFallback = true;
        }
      },
    });

    this.preloadedCacheKey = usingFallback ? null : cacheKey;
  }

  async searchSimilarUtterances(
    query: string,
    options?: SearchSimilarUtterancesOptions,
  ): Promise<SearchSimilarUtterancesResult> {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) {
      return { query: '', matches: [] };
    }

    const modelId = options?.modelId ?? DEFAULT_MODEL_ID;
    const modelVersion = options?.modelVersion ?? DEFAULT_MODEL_VERSION;
    const topK = normalizeTopK(options?.topK);
    const minScore = options?.minScore ?? DEFAULT_MIN_SCORE;

    const cacheKey = `${modelId}::${modelVersion}`;
    await this.ensurePreloaded(cacheKey);

    const [queryVector] = await this.provider.embed([normalizedQuery]);
    if (!queryVector || queryVector.length === 0) {
      return { query: normalizedQuery, matches: [] };
    }

    const db = await getDb();
    const embeddingRows = await db.collections.embeddings.findByIndex('sourceType', 'utterance');
    const candidateSet = options?.candidateSourceIds
      ? new Set(options.candidateSourceIds)
      : null;

    const scored: SimilarUtteranceMatch[] = [];
    for (const row of embeddingRows) {
      const item = row.toJSON();
      if (item.model !== modelId) continue;
      if ((item.modelVersion ?? DEFAULT_MODEL_VERSION) !== modelVersion) continue;
      if (candidateSet && !candidateSet.has(item.sourceId)) continue;

      const score = cosineSimilarity(queryVector, item.vector);
      if (!Number.isFinite(score)) continue;
      scored.push({
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        score,
        model: item.model,
        ...(item.modelVersion ? { modelVersion: item.modelVersion } : {}),
      });
    }

    scored.sort((a, b) => b.score - a.score);

    // Filter by minimum similarity threshold to discard hallucinated/low-quality matches
    const minScoreMatches = scored.filter((m) => m.score >= minScore);
    return {
      query: normalizedQuery,
      matches: minScoreMatches.slice(0, topK),
    };
  }

  /**
   * Search across multiple source types (e.g. 'utterance' + 'note') and
   * return a unified ranked result set.
   */
  async searchMultiSource(
    query: string,
    sourceTypes: readonly EmbeddingSourceType[],
    options?: SearchSimilarUtterancesOptions,
  ): Promise<SearchSimilarUtterancesResult> {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery || sourceTypes.length === 0) {
      return { query: normalizedQuery || '', matches: [] };
    }

    const modelId = options?.modelId ?? DEFAULT_MODEL_ID;
    const modelVersion = options?.modelVersion ?? DEFAULT_MODEL_VERSION;
    const topK = normalizeTopK(options?.topK);
    const minScore = options?.minScore ?? DEFAULT_MIN_SCORE;

    const cacheKey = `${modelId}::${modelVersion}`;
    await this.ensurePreloaded(cacheKey);

    const [queryVector] = await this.provider.embed([normalizedQuery]);
    if (!queryVector || queryVector.length === 0) {
      return { query: normalizedQuery, matches: [] };
    }

    const db = await getDb();
    const scored: SimilarUtteranceMatch[] = [];
    const candidateSet = options?.candidateSourceIds
      ? new Set(options.candidateSourceIds)
      : null;

    for (const sourceType of sourceTypes) {
      // B-08 fix: use compound [sourceType+model] index for direct seek instead of scan + JS filter
      const rows = await db.dexie.embeddings
        .where('[sourceType+model]')
        .equals([sourceType, modelId])
        .toArray();
      for (const row of rows) {
        const item = row;
        if ((item.modelVersion ?? DEFAULT_MODEL_VERSION) !== modelVersion) continue;
        if (candidateSet && !candidateSet.has(item.sourceId)) continue;

        const score = cosineSimilarity(queryVector, item.vector);
        if (!Number.isFinite(score)) continue;
        scored.push({
          sourceType: item.sourceType,
          sourceId: item.sourceId,
          score,
          model: item.model,
          ...(item.modelVersion ? { modelVersion: item.modelVersion } : {}),
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);

    const minScoreMatches = scored.filter((m) => m.score >= minScore);
    return {
      query: normalizedQuery,
      matches: minScoreMatches.slice(0, topK),
    };
  }

  /**
   * Hybrid retrieval: vector similarity + lightweight keyword overlap reranking.
   */
  async searchMultiSourceHybrid(
    query: string,
    sourceTypes: readonly EmbeddingSourceType[],
    options?: SearchSimilarUtterancesOptions,
  ): Promise<SearchSimilarUtterancesResult> {
    const topK = normalizeTopK(options?.topK);
    const minScore = options?.minScore ?? DEFAULT_MIN_SCORE;
    const base = await this.searchMultiSource(query, sourceTypes, {
      ...options,
      topK: Math.max(topK * 3, 12),
    });

    // 根据场景模板获取默认权重，允许手动参数覆盖 | Get default weights from scenario profile, allow manual override
    let keywordWeight: number;
    let fullTextWeight: number;

    if (options?.fusionScenario && !Number.isFinite(options.keywordWeight) && !Number.isFinite(options.fullTextWeight)) {
      // 场景模式：使用模板权重 | Use profile weights
      const profile = resolveFusionWeightsForScenario(options.fusionScenario);
      keywordWeight = normalizeKeywordWeight(profile.keywordWeight);
      fullTextWeight = normalizeFullTextWeight(profile.fullTextWeight);
    } else {
      // 手动模式：使用提供的权重或默认值 | Use provided or default weights
      keywordWeight = normalizeKeywordWeight(options?.keywordWeight);
      fullTextWeight = normalizeFullTextWeight(options?.fullTextWeight);
    }

    if (keywordWeight <= 0 && fullTextWeight <= 0) {
      return {
        query: base.query,
        matches: base.matches.slice(0, topK),
      };
    }

    const queryTokens = tokenizeQuery(base.query);
    if (queryTokens.length === 0) {
      return {
        query: base.query,
        matches: base.matches.slice(0, topK),
      };
    }

    const db = await getDb();
    const modelId = options?.modelId ?? DEFAULT_MODEL_ID;
    const modelVersion = options?.modelVersion ?? DEFAULT_MODEL_VERSION;
    const candidateSet = options?.candidateSourceIds
      ? new Set(options.candidateSourceIds)
      : null;

    const fusedCandidates = new Map<string, { match: SimilarUtteranceMatch; rawText: string }>();
    for (const match of base.matches) {
      const sourceKey = `${match.sourceType}:${match.sourceId}`;
      if (fusedCandidates.has(sourceKey)) continue;

      if (match.sourceType === 'utterance') {
        const textRows = await db.collections.utterance_texts.findByIndex('utteranceId', match.sourceId);
        const texts = textRows
          .map((row) => row.toJSON().text?.trim() ?? '')
          .filter((text) => text.length > 0);
        fusedCandidates.set(sourceKey, { match, rawText: texts.join(' ') });
        continue;
      }

      if (match.sourceType === 'note') {
        const noteRows = await db.collections.user_notes.findByIndex('id', match.sourceId);
        const note = noteRows[0]?.toJSON();
        const content = note?.content as Record<string, string> | undefined;
        fusedCandidates.set(sourceKey, { match, rawText: extractNoteText(content).trim() });
        continue;
      }

      if (match.sourceType === 'pdf') {
        const { baseRef } = splitPdfCitationRef(match.sourceId);
        const mediaRows = await db.collections.media_items.findByIndex('id', baseRef);
        const media = mediaRows[0]?.toJSON();
        const details = media?.details as Record<string, unknown> | undefined;
        fusedCandidates.set(sourceKey, { match, rawText: extractPdfSnippet(details, 1000) });
        continue;
      }

      fusedCandidates.set(sourceKey, { match, rawText: '' });
    }

    if (sourceTypes.includes('utterance')) {
      // B-02 fix: only load utterance_texts for candidate IDs when candidateSet is provided,
      // instead of unconditionally loading ALL rows and then filtering in JS.
      const utteranceRows = candidateSet
        ? await db.collections.utterance_texts.findByIndexAnyOf('utteranceId', [...candidateSet])
        : await db.collections.utterance_texts.find().exec();
      const merged = new Map<string, string[]>();
      for (const row of utteranceRows) {
        const item = row.toJSON();
        const text = item.text?.trim();
        if (!text) continue;
        const list = merged.get(item.utteranceId) ?? [];
        list.push(text);
        merged.set(item.utteranceId, list);
      }

      for (const [sourceId, chunks] of merged.entries()) {
        const sourceKey = `utterance:${sourceId}`;
        if (fusedCandidates.has(sourceKey)) continue;
        const rawText = chunks.join(' ');
        if (calcKeywordScore(rawText, queryTokens) <= 0) continue;
        fusedCandidates.set(sourceKey, {
          match: {
            sourceType: 'utterance',
            sourceId,
            score: 0,
            model: modelId,
            ...(modelVersion ? { modelVersion } : {}),
          },
          rawText,
        });
      }
    }

    if (sourceTypes.includes('note')) {
      const noteRows = await db.collections.user_notes.find().exec();
      for (const row of noteRows) {
        const note = row.toJSON();
        if (candidateSet && !candidateSet.has(note.id)) continue;
        const sourceKey = `note:${note.id}`;
        if (fusedCandidates.has(sourceKey)) continue;

        const content = note.content as Record<string, string> | undefined;
        const rawText = extractNoteText(content).trim();
        if (calcKeywordScore(rawText, queryTokens) <= 0) continue;
        fusedCandidates.set(sourceKey, {
          match: {
            sourceType: 'note',
            sourceId: note.id,
            score: 0,
            model: modelId,
            ...(modelVersion ? { modelVersion } : {}),
          },
          rawText,
        });
      }
    }

    if (sourceTypes.includes('pdf')) {
      const mediaRows = await db.collections.media_items.find().exec();
      for (const row of mediaRows) {
        const media = row.toJSON();
        if (!isPdfMediaItem(media)) continue;
        if (candidateSet && !candidateSet.has(media.id)) continue;
        const sourceKey = `pdf:${media.id}`;
        if (fusedCandidates.has(sourceKey)) continue;

        const details = media.details as Record<string, unknown> | undefined;
        const rawText = extractPdfSnippet(details, 1000);
        if (calcKeywordScore(rawText, queryTokens) <= 0) continue;
        fusedCandidates.set(sourceKey, {
          match: {
            sourceType: 'pdf',
            sourceId: media.id,
            score: 0,
            model: modelId,
            ...(modelVersion ? { modelVersion } : {}),
          },
          rawText,
        });
      }
    }

    const fullTextScoreMap = buildFullTextScoreMap(base.query, fusedCandidates);
    const combinedWeight = keywordWeight + fullTextWeight;
    const vectorWeight = combinedWeight >= 1 ? 0 : (1 - combinedWeight);

    const reranked = Array.from(fusedCandidates.entries())
      .map(([candidateId, { match, rawText }]) => {
        const keywordScore = calcKeywordScore(rawText, queryTokens);
        const fullTextScore = fullTextScoreMap.get(candidateId) ?? 0;
        const fusedScore = vectorWeight * match.score + keywordWeight * keywordScore + fullTextWeight * fullTextScore;
        return { match, fusedScore };
      })
      .filter((item) => item.fusedScore >= minScore)
      .sort((a, b) => b.fusedScore - a.fusedScore)
      .map((item) => item.match)
      .slice(0, topK);

    return {
      query: base.query,
      matches: reranked,
    };
  }

  terminate(): void {
    this.preloadedCacheKey = null;
    this.provider.terminate();
  }
}
