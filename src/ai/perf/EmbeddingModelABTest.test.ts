/**
 * EmbeddingModelABTest — Arctic-Embed-XS vs multilingual-E5-Small 对比评测
 * Compares Arctic-Embed-XS (22M, 384-dim) vs Xenova/multilingual-e5-small (118M, 384-dim).
 *
 * 评测指标 | Metrics:
 *   - cosine similarity on 30+ fixed query-document pairs
 *   - recall@5 across multilingual sets (zh/en/ja/low-resource)
 *   - MRR (Mean Reciprocal Rank)
 *   - nDCG@10 (Normalized Discounted Cumulative Gain)
 *   - latency measurement
 *
 * 运行方式 | How to run:
 *   npx vitest run src/ai/perf/EmbeddingModelABTest.test.ts
 *
 * 决策规则 | Decision rule:
 *   若 Arctic-Embed-XS recall@5 ≥ E5-Small recall@5 × 0.95 且模型加载时间 ≤ E5-Small × 0.5
 *   → 迁移为默认模型
 *   If Arctic recall@5 ≥ 95% of E5 AND load time ≤ 50% of E5 → migrate to Arctic as default.
 */

import { describe, expect, it } from 'vitest';
import {
  evaluateCosineSimilarity,
  recall5,
  recallK,
  mrr,
  ndcgK,
  measureEmbedLatency,
  runEvalReport,
  fnv1aVector,
} from './embeddingEvalUtils';
import type { EvalReport } from './embeddingEvalUtils';
import {
  ARCTIC_LOCAL_EMBEDDING_MODEL_ID,
  DEFAULT_LOCAL_EMBEDDING_MODEL_ID,
} from '../embeddings/localEmbeddingModelConfig';
import {
  createFeatureExtractionPipelineWithFallback,
  ARCTIC_LOAD_TIME_RATIO_THRESHOLD,
  ARCTIC_RECALL_RATIO_THRESHOLD,
  decideDefaultLocalEmbeddingModel,
} from './embeddingModelDecision';
import { configureTransformersEmbeddingRuntime } from '../embeddings/transformersRuntimeConfig';

const RUN_REAL_MODEL_EVAL = process.env.JIEYU_REAL_EMBEDDING_AB === '1';
const describeRealModelEval = RUN_REAL_MODEL_EVAL ? describe : describe.skip;

// ---------------------------------------------------------------------------
// 固定对照语料 | Fixed evaluation corpus
// ---------------------------------------------------------------------------

/** 相关对（同语义，期望高相似度）| Positive pairs (same semantics, expect high cosine) */
const POSITIVE_PAIRS: Array<{ query: string; document: string }> = [
  // 中文 | Chinese
  { query: '音位标注规则', document: '本手册介绍国际音标音位转写的标注规范' },
  { query: '田野调查录音', document: '田野调查时需录制当地语言发音人的自然语音' },
  { query: '低资源语言保护', document: '语言多样性保护是语言学研究的重要目标' },
  { query: '词类标注 POS', document: '词性标注（Part-of-Speech tagging）是 NLP 基础任务' },
  { query: '声调分析', document: '声调语言中音高变化携带词汇语义信息' },
  { query: '语素切分', document: '语素是最小的有意义的语言单位，形态学分析的基础' },
  { query: '语料库标注规范', document: '建立标注一致性需要文档化编码指南和定期校验' },
  // 英文 | English
  { query: 'forced alignment audio', document: 'Forced alignment maps phoneme boundaries to audio timestamps' },
  { query: 'transcription accuracy', document: 'Word error rate measures the quality of automatic speech recognition' },
  { query: 'language endangerment', document: 'Endangered languages face the risk of extinction within generations' },
  { query: 'orthography design', document: 'Developing a writing system involves choosing graphemes and phoneme mappings' },
  { query: 'corpus annotation', document: 'Annotated corpora provide ground truth for linguistic model training' },
  { query: 'code-switching detection', document: 'Code-switching occurs when speakers alternate between two or more languages' },
  { query: 'vowel harmony', document: 'Vowel harmony constrains which vowels can co-occur within a word' },
  // 日文 | Japanese
  { query: '音声認識', document: '音声認識は話し言葉をテキストに変換する技術です' },
  { query: '言語ドキュメンテーション', document: '言語変種の記録は消滅危機言語を保存するために重要です' },
  { query: '形態素解析', document: '形態素解析とは文を意味のある最小単位に分解する処理です' },
  // 低资源 | Low-resource stubs (concept-level)
  { query: 'gloss interlinear', document: 'Interlinear glossing shows morpheme-by-morpheme translation' },
  { query: 'phoneme inventory', document: 'The phoneme inventory lists all contrastive sounds in a language' },
  { query: 'tone marking diacritics', document: 'Diacritical marks represent tonal distinctions in many writing systems' },
  // 跨语言 | Cross-lingual
  { query: 'IPA transcription', document: 'IPA（国際音標）使用統一符號表示任意語言的發音' },
  { query: 'language documentation 语言记录', document: '语言田野记录需要系统化的方法论和工具链' },
];

/** 不相关对（期望低相似度，< 0.35）| Negative pairs (expect low cosine) */
const NEGATIVE_PAIRS: Array<{ query: string; document: string }> = [
  { query: '食谱：红烧肉做法', document: 'Forced alignment maps phoneme boundaries to audio timestamps' },
  { query: '股票投资策略', document: '音位标注规则' },
  { query: 'weather forecast', document: '词类标注 POS 标注规范' },
  { query: '机器学习超参数调优', document: 'The Great Wall of China was built over many centuries' },
  { query: '法律合同条款', document: 'forced alignment audio transcription' },
  { query: '足球比赛战术', document: 'Interlinear glossing shows morpheme-by-morpheme translation' },
  { query: '意大利面烹饪', document: '言語ドキュメンテーションの方法論' },
  { query: 'cryptocurrency trading', document: '语素切分与形态学分析' },
];

// ---------------------------------------------------------------------------
// Recall@5 评测集 | Recall@5 evaluation sets
// ---------------------------------------------------------------------------

const RECALL_CORPUS = [
  '音位标注规则手册',
  '田野调查录音指南',
  '低资源语言保护策略',
  'Forced alignment maps audio boundaries',
  'Word error rate for speech recognition',
  '声调语言研究综述',
  '词性标注与依存句法',
  'Language endangerment and revitalization',
  'Orthography design principles',
  'Interlinear glossing conventions',
  '语料库建设与标注一致性',
  'Code-switching in multilingual communities',
  '形態素解析ツール比較',
  'Vowel harmony in Turkic languages',
  'Voice activity detection for field recordings',
];

const RECALL_QUERIES: Array<{ query: string; relevant: number }> = [
  { query: '音位', relevant: 0 },
  { query: '田野录音', relevant: 1 },
  { query: '濒危语言', relevant: 2 },
  { query: 'audio alignment', relevant: 3 },
  { query: 'speech recognition WER', relevant: 4 },
  { query: '声调音高', relevant: 5 },
  { query: '写字法设计', relevant: 8 },
  { query: 'morpheme analysis', relevant: 12 },
];

// ---------------------------------------------------------------------------
// Helper: simulate async cosine measure using sync utils
// These tests use pre-computed mock embeddings via the utils module.
// ---------------------------------------------------------------------------

describe('EmbeddingModel A/B 评测 | Arctic-Embed-XS vs E5-Small', () => {
  it('余弦相似度框架结构验证 | cosine similarity framework smoke test', () => {
    // FNV-1a 哈希降级向量不具备语义区分能力，无法保证正向对余弦 > 负向对余弦。
    // FNV-1a fallback vectors are not semantically meaningful.
    // This test validates that the evaluation harness produces valid cosine values [-1, 1]
    // and exhibits value variance — real semantic comparison requires actual model embeddings.
    const posCosines = POSITIVE_PAIRS.map(({ query, document }) =>
      evaluateCosineSimilarity(query, document),
    );
    const negCosines = NEGATIVE_PAIRS.map(({ query, document }) =>
      evaluateCosineSimilarity(query, document),
    );

    const allValues = [...posCosines, ...negCosines];

    // 所有余弦值应在 [-1, 1] 范围内 | All cosine values must be in [-1, 1]
    for (const v of allValues) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }

    // 应有值差异（向量非全零）| Values must have some variance (non-zero vectors)
    const max = Math.max(...allValues);
    const min = Math.min(...allValues);
    expect(max).toBeGreaterThan(min);
  });

  it('Recall@5 在固定语料上有效 | recall@5 valid on fixed corpus', () => {
    const result = recall5(RECALL_QUERIES, RECALL_CORPUS);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('决策规则验证框架 | decision rule framework smoke test', () => {
    const e5Recall = recall5(RECALL_QUERIES, RECALL_CORPUS);
    const arcticRecall = recall5(RECALL_QUERIES, RECALL_CORPUS);

    const result = decideDefaultLocalEmbeddingModel({
      baselineRecall5: e5Recall,
      baselineLoadMs: 100,
      candidateRecall5: arcticRecall,
      candidateLoadMs: 50,
    });

    expect(result.qualityPass).toBe(true);
    expect(result.latencyPass).toBe(true);
    expect(result.selectedModelId).toBe(ARCTIC_LOCAL_EMBEDDING_MODEL_ID);
  });

  it('质量门槛不达标时保留 E5 | keep E5 when quality gate fails', () => {
    const result = decideDefaultLocalEmbeddingModel({
      baselineRecall5: 1,
      baselineLoadMs: 100,
      candidateRecall5: 0.8,
      candidateLoadMs: 10,
    });

    expect(result.qualityPass).toBe(false);
    expect(result.latencyPass).toBe(true);
    expect(result.selectedModelId).toBe(DEFAULT_LOCAL_EMBEDDING_MODEL_ID);
  });

  // ── MRR 验证 | MRR validation ──────────────────────────────────────────

  it('MRR 在 [0,1] 范围内 | MRR within valid range', async () => {
    const result = await mrr(RECALL_QUERIES, RECALL_CORPUS);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  // ── nDCG@10 验证 | nDCG@10 validation ──────────────────────────────────

  it('nDCG@10 在 [0,1] 范围内 | nDCG@10 within valid range', async () => {
    const result = await ndcgK(RECALL_QUERIES, RECALL_CORPUS, 10);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  // ── Recall@K 泛化 | Recall@K generalization ────────────────────────────

  it('recallK(k=1) ≤ recallK(k=10) | monotonicity with k', async () => {
    const r1 = await recallK(RECALL_QUERIES, RECALL_CORPUS, 1);
    const r10 = await recallK(RECALL_QUERIES, RECALL_CORPUS, 10);
    expect(r1).toBeLessThanOrEqual(r10);
  });

  // ── 自定义 embedFn 接入 | Custom embed function pluggability ──────────

  it('recallK 接受自定义向量化函数 | recallK accepts custom embedFn', async () => {
    const customEmbed = (text: string) => fnv1aVector(text, 128);
    const result = await recallK(RECALL_QUERIES, RECALL_CORPUS, 5, customEmbed);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  // ── 延迟测量 | Latency measurement ─────────────────────────────────────

  it('FNV 延迟 < 1ms | FNV fallback latency < 1ms per embedding', async () => {
    const sampleTexts = POSITIVE_PAIRS.slice(0, 5).map((p) => p.query);
    const latencyMs = await measureEmbedLatency(fnv1aVector, sampleTexts, 2, 3);
    expect(latencyMs).toBeLessThan(1);
  });

  // ── 综合报告 | Full evaluation report ──────────────────────────────────

  it('runEvalReport 返回完整报告结构 | runEvalReport returns valid report', async () => {
    const report: EvalReport = await runEvalReport(
      fnv1aVector,
      POSITIVE_PAIRS,
      NEGATIVE_PAIRS,
      RECALL_QUERIES,
      RECALL_CORPUS,
    );

    expect(report.meanPosCosine).toBeGreaterThanOrEqual(-1);
    expect(report.meanPosCosine).toBeLessThanOrEqual(1);
    expect(report.meanNegCosine).toBeGreaterThanOrEqual(-1);
    expect(report.meanNegCosine).toBeLessThanOrEqual(1);
    expect(report.recall5).toBeGreaterThanOrEqual(0);
    expect(report.mrr).toBeGreaterThanOrEqual(0);
    expect(report.ndcg10).toBeGreaterThanOrEqual(0);
    expect(report.meanLatencyMs).toBeGreaterThanOrEqual(0);
  });
});

interface RealModelRuntime {
  loadMs: number;
  embed: (text: string) => Promise<number[]>;
}

async function loadRealEmbeddingRuntime(modelId: string): Promise<RealModelRuntime> {
  const transformers = await import('@huggingface/transformers');
  const runtimeConfig = await configureTransformersEmbeddingRuntime({ transformers });

  const startedAt = performance.now();
  const extractorState = await createFeatureExtractionPipelineWithFallback({
    transformers,
    modelId,
    preferredDevice: runtimeConfig.device,
  });
  const loadMs = performance.now() - startedAt;
  const extractor = extractorState.pipeline;

  return {
    loadMs,
    embed: async (text: string): Promise<number[]> => {
      const tensor = await extractor(text, {
        pooling: 'mean',
        normalize: true,
      }) as { data?: Float32Array | number[] };
      if (Array.isArray(tensor.data)) return tensor.data;
      if (tensor.data instanceof Float32Array) return Array.from(tensor.data);
      return [];
    },
  };
}

describeRealModelEval('EmbeddingModel A/B 实模型评测 | Arctic-Embed-XS vs E5-Small', () => {
  it('固定语料决策保持 E5 默认 | fixed-corpus decision keeps E5 as default', { timeout: 600_000 }, async () => {
    const [e5Runtime, arcticRuntime] = await Promise.all([
      loadRealEmbeddingRuntime(DEFAULT_LOCAL_EMBEDDING_MODEL_ID),
      loadRealEmbeddingRuntime(ARCTIC_LOCAL_EMBEDDING_MODEL_ID),
    ]);

    const [e5Report, arcticReport] = await Promise.all([
      runEvalReport(
        e5Runtime.embed,
        POSITIVE_PAIRS,
        NEGATIVE_PAIRS,
        RECALL_QUERIES,
        RECALL_CORPUS,
      ),
      runEvalReport(
        arcticRuntime.embed,
        POSITIVE_PAIRS,
        NEGATIVE_PAIRS,
        RECALL_QUERIES,
        RECALL_CORPUS,
      ),
    ]);

    const result = decideDefaultLocalEmbeddingModel({
      baselineRecall5: e5Report.recall5,
      baselineLoadMs: e5Runtime.loadMs,
      candidateRecall5: arcticReport.recall5,
      candidateLoadMs: arcticRuntime.loadMs,
    });

    expect(result.qualityPass).toBe(arcticReport.recall5 >= e5Report.recall5 * ARCTIC_RECALL_RATIO_THRESHOLD);
    expect(result.latencyPass).toBe(arcticRuntime.loadMs <= e5Runtime.loadMs * ARCTIC_LOAD_TIME_RATIO_THRESHOLD);
    expect(result.selectedModelId).toBe(DEFAULT_LOCAL_EMBEDDING_MODEL_ID);
  });
});
