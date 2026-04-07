/**
 * Embedding A/B 评测工具函数 | Embedding A/B evaluation utility functions.
 *
 * 支持插入自定义向量化函数以对比不同模型；默认使用 FNV-1a 降级向量进行框架验证。
 * Supports pluggable embed functions for model comparison; defaults to FNV-1a fallback vectors.
 */

// ── 类型定义 | Type definitions ───────────────────────────────────────────

/** 向量化函数签名（同步或异步）| Embed function signature (sync or async) */
export type EmbedFn = (text: string) => number[] | Promise<number[]>;

export interface RecallQuery {
  query: string;
  /** 在 corpus 中的索引（0-based）| Index in corpus (0-based) */
  relevant: number;
}

export interface EvalReport {
  /** 正向对平均余弦 | Mean cosine for positive pairs */
  meanPosCosine: number;
  /** 负向对平均余弦 | Mean cosine for negative pairs */
  meanNegCosine: number;
  recall5: number;
  mrr: number;
  ndcg10: number;
  /** 单次向量化平均耗时 ms | Mean embed latency in ms */
  meanLatencyMs: number;
}

// ── FNV-1a 降级向量 | FNV-1a fallback vector ──────────────────────────────

const DEFAULT_DIM = 64;

/** FNV-1a 哈希降级向量（与 embedding.worker.ts 中逻辑一致）| FNV-1a hash fallback vector */
export function fnv1aVector(text: string, dimension = DEFAULT_DIM): number[] {
  const vector = new Array<number>(dimension).fill(0);
  const normalized = text.toLowerCase().trim();
  if (!normalized) return vector;

  const tokens = normalized.split(/\s+/).filter(Boolean);
  let hash = 0x811c9dc5;
  for (const token of tokens) {
    for (let i = 0; i < token.length; i += 1) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    const index = (hash >>> 0) % dimension;
    const weight = ((hash >>> 8) % 1000) / 1000;
    vector[index] = (vector[index] ?? 0) + (0.5 + weight);
  }

  let sumSq = 0;
  for (const v of vector) sumSq += v * v;
  const norm = Math.sqrt(sumSq);
  return norm > 0 ? vector.map((v) => v / norm) : vector;
}

// ── 核心指标 | Core metrics ───────────────────────────────────────────────

/** 余弦相似度 | Cosine similarity */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    normA += (a[i] ?? 0) ** 2;
    normB += (b[i] ?? 0) ** 2;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

/**
 * 使用 FNV 降级向量计算两段文本的余弦相似度 | Cosine similarity using FNV fallback vectors.
 */
export function evaluateCosineSimilarity(textA: string, textB: string): number {
  return cosineSimilarity(fnv1aVector(textA), fnv1aVector(textB));
}

// ── Recall@K | Recall@K ───────────────────────────────────────────────────

/**
 * 计算 Recall@K（默认 K=5）| Compute Recall@K (default K=5).
 * 支持自定义向量化函数 | Accepts optional custom embed function.
 */
export async function recallK(
  queries: RecallQuery[],
  corpus: string[],
  k = 5,
  embed: EmbedFn = fnv1aVector,
): Promise<number> {
  if (queries.length === 0) return 0;
  const corpusVecs = await Promise.all(corpus.map((text) => embed(text)));
  let hits = 0;

  for (const { query, relevant } of queries) {
    const qVec = await embed(query);
    const scored = corpusVecs.map((docVec, i) => ({ i, score: cosineSimilarity(qVec, docVec) }));
    scored.sort((a, b) => b.score - a.score);
    const topK = scored.slice(0, k).map((x) => x.i);
    if (topK.includes(relevant)) hits += 1;
  }

  return hits / queries.length;
}

/** 同步版 Recall@5（向后兼容）| Sync Recall@5 (backward-compatible) */
export function recall5(queries: RecallQuery[], corpus: string[]): number {
  if (queries.length === 0) return 0;
  const corpusVecs = corpus.map((text) => fnv1aVector(text));
  let hits = 0;

  for (const { query, relevant } of queries) {
    const qVec = fnv1aVector(query);
    const scored = corpusVecs.map((docVec, i) => ({ i, score: cosineSimilarity(qVec, docVec) }));
    scored.sort((a, b) => b.score - a.score);
    const top5 = scored.slice(0, 5).map((x) => x.i);
    if (top5.includes(relevant)) hits += 1;
  }

  return hits / queries.length;
}

// ── MRR | Mean Reciprocal Rank ────────────────────────────────────────────

/**
 * Mean Reciprocal Rank：每个查询的最佳命中位的倒数的平均。
 * MRR: mean of 1/rank for the first relevant hit per query.
 */
export async function mrr(
  queries: RecallQuery[],
  corpus: string[],
  embed: EmbedFn = fnv1aVector,
): Promise<number> {
  if (queries.length === 0) return 0;
  const corpusVecs = await Promise.all(corpus.map((text) => embed(text)));
  let sum = 0;

  for (const { query, relevant } of queries) {
    const qVec = await embed(query);
    const scored = corpusVecs.map((docVec, i) => ({ i, score: cosineSimilarity(qVec, docVec) }));
    scored.sort((a, b) => b.score - a.score);
    const rank = scored.findIndex((x) => x.i === relevant);
    if (rank >= 0) sum += 1 / (rank + 1);
  }

  return sum / queries.length;
}

// ── nDCG@K | Normalized Discounted Cumulative Gain ────────────────────────

/**
 * nDCG@K（默认 K=10）：基于二值相关度。
 * nDCG@K (default K=10) with binary relevance.
 */
export async function ndcgK(
  queries: RecallQuery[],
  corpus: string[],
  k = 10,
  embed: EmbedFn = fnv1aVector,
): Promise<number> {
  if (queries.length === 0) return 0;
  const corpusVecs = await Promise.all(corpus.map((text) => embed(text)));
  let sum = 0;

  for (const { query, relevant } of queries) {
    const qVec = await embed(query);
    const scored = corpusVecs.map((docVec, i) => ({ i, score: cosineSimilarity(qVec, docVec) }));
    scored.sort((a, b) => b.score - a.score);
    const topK = scored.slice(0, k);

    // DCG：只有一个相关文档（二值）| DCG: single relevant doc (binary)
    const rank = topK.findIndex((x) => x.i === relevant);
    const dcg = rank >= 0 ? 1 / Math.log2(rank + 2) : 0; // rank+2 因为 log2(1)=0 | +2 because log2(1)=0
    const idcg = 1 / Math.log2(2); // 理想情况：第 1 位命中 | Ideal: hit at position 1
    sum += idcg > 0 ? dcg / idcg : 0;
  }

  return sum / queries.length;
}

// ── 延迟测量 | Latency measurement ───────────────────────────────────────

/**
 * 测量单次向量化平均延迟（ms）| Measure mean single-embed latency in ms.
 * 预热 warmup 次后取 runs 次平均。
 */
export async function measureEmbedLatency(
  embed: EmbedFn,
  texts: string[],
  warmup = 2,
  runs = 5,
): Promise<number> {
  for (let w = 0; w < warmup; w += 1) {
    for (const t of texts) await embed(t);
  }
  const start = performance.now();
  for (let r = 0; r < runs; r += 1) {
    for (const t of texts) await embed(t);
  }
  const elapsed = performance.now() - start;
  return elapsed / (runs * texts.length);
}

// ── 综合报告 | Full evaluation report ─────────────────────────────────────

/**
 * 生成模型综合评测报告 | Generate a full evaluation report for a model.
 */
export async function runEvalReport(
  embed: EmbedFn,
  positivePairs: Array<{ query: string; document: string }>,
  negativePairs: Array<{ query: string; document: string }>,
  recallQueries: RecallQuery[],
  recallCorpus: string[],
): Promise<EvalReport> {
  // 余弦相似度 | Cosine similarity
  const posScores: number[] = [];
  for (const { query, document } of positivePairs) {
    const [qv, dv] = await Promise.all([embed(query), embed(document)]);
    posScores.push(cosineSimilarity(qv, dv));
  }
  const negScores: number[] = [];
  for (const { query, document } of negativePairs) {
    const [qv, dv] = await Promise.all([embed(query), embed(document)]);
    negScores.push(cosineSimilarity(qv, dv));
  }

  const mean = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  const [r5, mrrVal, ndcg10] = await Promise.all([
    recallK(recallQueries, recallCorpus, 5, embed),
    mrr(recallQueries, recallCorpus, embed),
    ndcgK(recallQueries, recallCorpus, 10, embed),
  ]);

  const sampleTexts = positivePairs.slice(0, 5).map((p) => p.query);
  const meanLatencyMs = await measureEmbedLatency(embed, sampleTexts);

  return {
    meanPosCosine: mean(posScores),
    meanNegCosine: mean(negScores),
    recall5: r5,
    mrr: mrrVal,
    ndcg10,
    meanLatencyMs,
  };
}
