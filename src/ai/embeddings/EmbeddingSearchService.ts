import { getDb } from '../../../db';
import {
  WorkerEmbeddingRuntime,
  type EmbeddingRuntime,
  type EmbeddingRuntimeOptions,
} from './EmbeddingRuntime';

export interface SearchSimilarUtterancesOptions {
  modelId?: string;
  modelVersion?: string;
  topK?: number;
  retries?: number;
  candidateSourceIds?: readonly string[];
}

export interface SimilarUtteranceMatch {
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

function normalizeTopK(input: number | undefined): number {
  if (!Number.isFinite(input)) return 5;
  return Math.min(20, Math.max(1, Math.floor(input ?? 5)));
}

function normalizeRetries(input: number | undefined): number {
  if (!Number.isFinite(input)) return 2;
  return Math.min(3, Math.max(1, Math.floor(input ?? 2)));
}

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
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
  constructor(private readonly runtime: EmbeddingRuntime = new WorkerEmbeddingRuntime()) {}

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
    const retries = normalizeRetries(options?.retries);

    const runtimeOptions: EmbeddingRuntimeOptions = {
      modelId,
      retries,
    };

    const [queryVector] = await this.runtime.embed([normalizedQuery], runtimeOptions);
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
        sourceId: item.sourceId,
        score,
        model: item.model,
        ...(item.modelVersion ? { modelVersion: item.modelVersion } : {}),
      });
    }

    scored.sort((a, b) => b.score - a.score);

    return {
      query: normalizedQuery,
      matches: scored.slice(0, topK),
    };
  }

  terminate(): void {
    this.runtime.terminate();
  }
}
