import { describe, it, expect } from 'vitest';
import {
  fnv1aVector,
  cosineSimilarity,
  evaluateCosineSimilarity,
  recallK,
  recall5,
  mrr,
  ndcgK,
  measureEmbedLatency,
  runEvalReport,
  type EmbedFn,
  type RecallQuery,
} from './embeddingEvalUtils';

// ── fnv1aVector | FNV-1a 降级向量 ────────────────────────────────────────

describe('fnv1aVector', () => {
  it('returns a vector of the correct dimension', () => {
    const vec = fnv1aVector('hello world');
    expect(vec).toHaveLength(64);
  });

  it('returns zero vector for empty text', () => {
    const vec = fnv1aVector('');
    expect(vec.every((v) => v === 0)).toBe(true);
  });

  it('returns zero vector for whitespace-only text', () => {
    const vec = fnv1aVector('   ');
    expect(vec.every((v) => v === 0)).toBe(true);
  });

  it('produces a unit-length vector for non-empty text', () => {
    const vec = fnv1aVector('test input');
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('is case-insensitive', () => {
    expect(fnv1aVector('Hello')).toEqual(fnv1aVector('hello'));
  });

  it('supports custom dimension', () => {
    expect(fnv1aVector('test', 128)).toHaveLength(128);
  });

  it('different texts produce different vectors', () => {
    const a = fnv1aVector('cat');
    const b = fnv1aVector('dog');
    expect(a).not.toEqual(b);
  });
});

// ── cosineSimilarity | 余弦相似度 ────────────────────────────────────────

describe('cosineSimilarity', () => {
  it('identical vectors → 1', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
  });

  it('orthogonal vectors → 0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('opposite vectors → -1', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it('zero vector → 0', () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
  });

  it('mismatched lengths → uses shorter length', () => {
    // [1,0] vs [1,0,999] → only first 2 dims used → cosine=1
    expect(cosineSimilarity([1, 0], [1, 0, 999])).toBeCloseTo(1);
  });
});

// ── evaluateCosineSimilarity | FNV 余弦快捷 ──────────────────────────────

describe('evaluateCosineSimilarity', () => {
  it('same text → 1', () => {
    expect(evaluateCosineSimilarity('hello', 'hello')).toBeCloseTo(1);
  });

  it('different texts → <1', () => {
    expect(evaluateCosineSimilarity('cat', 'airplane')).toBeLessThan(1);
  });
});

// ── recall5 (sync) | 同步 Recall@5 ───────────────────────────────────────

describe('recall5', () => {
  const corpus = ['alpha bravo', 'charlie delta', 'echo foxtrot', 'golf hotel', 'india juliet', 'kilo lima'];
  const queries: RecallQuery[] = [
    { query: 'alpha bravo', relevant: 0 },
    { query: 'echo foxtrot', relevant: 2 },
  ];

  it('finds exact matches in top 5', () => {
    expect(recall5(queries, corpus)).toBe(1);
  });

  it('returns 0 for empty queries', () => {
    expect(recall5([], corpus)).toBe(0);
  });
});

// ── recallK (async) | 异步 Recall@K ──────────────────────────────────────

describe('recallK', () => {
  const corpus = ['one', 'two', 'three', 'four', 'five', 'six'];
  const queries: RecallQuery[] = [{ query: 'one', relevant: 0 }];

  it('k=1 hitting top → 1', async () => {
    const result = await recallK(queries, corpus, 1);
    expect(result).toBe(1);
  });

  it('returns 0 for empty queries', async () => {
    expect(await recallK([], corpus)).toBe(0);
  });

  it('accepts custom embed function', async () => {
    // 定义让 "one" 和 corpus[0] 永远不匹配的坏向量化 | Bad embed that never matches
    const badEmbed: EmbedFn = () => [Math.random(), Math.random()];
    const result = await recallK(queries, corpus, 1, badEmbed);
    // 可能命中也可能不命中，但不应抛错 | May or may not hit, but should not throw
    expect(typeof result).toBe('number');
  });
});

// ── mrr | Mean Reciprocal Rank ────────────────────────────────────────────

describe('mrr', () => {
  it('returns 0 for empty queries', async () => {
    expect(await mrr([], ['a'])).toBe(0);
  });

  it('perfect rank-1 → MRR=1', async () => {
    const corpus = ['alpha', 'bravo'];
    const queries: RecallQuery[] = [{ query: 'alpha', relevant: 0 }];
    const result = await mrr(queries, corpus);
    expect(result).toBeCloseTo(1);
  });
});

// ── ndcgK | nDCG@K ───────────────────────────────────────────────────────

describe('ndcgK', () => {
  it('returns 0 for empty queries', async () => {
    expect(await ndcgK([], ['a'])).toBe(0);
  });

  it('perfect rank-1 → nDCG=1', async () => {
    const corpus = ['alpha', 'bravo'];
    const queries: RecallQuery[] = [{ query: 'alpha', relevant: 0 }];
    const result = await ndcgK(queries, corpus, 10);
    expect(result).toBeCloseTo(1);
  });
});

// ── measureEmbedLatency | 延迟测量 ───────────────────────────────────────

describe('measureEmbedLatency', () => {
  it('returns a non-negative number', async () => {
    const latency = await measureEmbedLatency(fnv1aVector, ['hello', 'world'], 1, 2);
    expect(latency).toBeGreaterThanOrEqual(0);
  });

  it('works with async embed', async () => {
    const asyncEmbed: EmbedFn = async (t) => fnv1aVector(t);
    const latency = await measureEmbedLatency(asyncEmbed, ['test'], 0, 1);
    expect(latency).toBeGreaterThanOrEqual(0);
  });
});

// ── runEvalReport | 综合报告 ─────────────────────────────────────────────

describe('runEvalReport', () => {
  const posPairs = [
    { query: 'alpha bravo', document: 'alpha bravo' },
    { query: 'charlie delta', document: 'charlie delta' },
  ];
  const negPairs = [
    { query: 'alpha bravo', document: 'xray yankee' },
  ];
  const corpus = ['alpha bravo', 'charlie delta', 'echo foxtrot'];
  const recallQueries: RecallQuery[] = [
    { query: 'alpha bravo', relevant: 0 },
    { query: 'charlie delta', relevant: 1 },
  ];

  it('returns all expected fields', async () => {
    const report = await runEvalReport(fnv1aVector, posPairs, negPairs, recallQueries, corpus);
    expect(report).toHaveProperty('meanPosCosine');
    expect(report).toHaveProperty('meanNegCosine');
    expect(report).toHaveProperty('recall5');
    expect(report).toHaveProperty('mrr');
    expect(report).toHaveProperty('ndcg10');
    expect(report).toHaveProperty('meanLatencyMs');
  });

  it('positive cosine > negative cosine for distinct pairs', async () => {
    const report = await runEvalReport(fnv1aVector, posPairs, negPairs, recallQueries, corpus);
    expect(report.meanPosCosine).toBeGreaterThan(report.meanNegCosine);
  });

  it('identical positive pairs → meanPosCosine ≈ 1', async () => {
    const report = await runEvalReport(fnv1aVector, posPairs, negPairs, recallQueries, corpus);
    expect(report.meanPosCosine).toBeCloseTo(1, 1);
  });

  it('recall5 = 1 when queries match corpus entries', async () => {
    const report = await runEvalReport(fnv1aVector, posPairs, negPairs, recallQueries, corpus);
    expect(report.recall5).toBe(1);
  });

  it('handles empty positive/negative pairs', async () => {
    const report = await runEvalReport(fnv1aVector, [], [], recallQueries, corpus);
    expect(report.meanPosCosine).toBe(0);
    expect(report.meanNegCosine).toBe(0);
  });

  it('works with custom async embed', async () => {
    const asyncEmbed: EmbedFn = async (t) => fnv1aVector(t);
    const report = await runEvalReport(asyncEmbed, posPairs, negPairs, recallQueries, corpus);
    expect(report.recall5).toBe(1);
  });
});
