/**
 * STT 评测工具 — 语音转写准确率可回归基线
 * STT evaluation utilities — regressionable accuracy baselines.
 *
 * 提供 WER/CER 计算与批量评测报告生成，可用于不同 STT 引擎的 A/B 对比。
 * Provides WER/CER computation and batch eval report generation for STT A/B comparisons.
 */

// ── 类型定义 | Type definitions ───────────────────────────────────────────

/** 单条测试用例 | Single evaluation sample */
export interface SttEvalSample {
  /** 参考文本（人工标注）| Reference transcript (ground truth) */
  reference: string;
  /** 假设文本（STT 输出）| Hypothesis transcript (STT output) */
  hypothesis: string;
  /** 可选标签（语言、口音等）| Optional tag (language, accent, etc.) */
  tag?: string;
}

/** 单条评测结果 | Per-sample evaluation result */
export interface SttSampleResult {
  wer: number;
  cer: number;
  /** 参考词/字数 | Number of reference words/chars */
  refWordCount: number;
  refCharCount: number;
  tag?: string;
}

/** 批量评测报告 | Batch evaluation report */
export interface SttEvalReport {
  /** 样本数 | Sample count */
  sampleCount: number;
  /** 宏平均 WER (0-1+) | Macro-averaged WER */
  meanWer: number;
  /** 宏平均 CER (0-1+) | Macro-averaged CER */
  meanCer: number;
  /** 微平均 WER（按词数加权）| Micro-averaged WER (word-count weighted) */
  weightedWer: number;
  /** 微平均 CER（按字数加权）| Micro-averaged CER (char-count weighted) */
  weightedCer: number;
  /** 完全匹配率 | Sentence accuracy (exact match ratio) */
  sentenceAccuracy: number;
  /** 按 tag 分组的宏平均 WER | Per-tag macro WER */
  perTagWer: Record<string, number>;
  /** 每条样本结果 | Per-sample results */
  samples: SttSampleResult[];
}

// ── 编辑距离 | Edit distance (Levenshtein) ────────────────────────────────

/**
 * 最小编辑距离（插入/删除/替换各权重 1）| Minimum edit distance (ins/del/sub=1).
 */
export function editDistance<T>(ref: readonly T[], hyp: readonly T[]): number {
  const m = ref.length;
  const n = hyp.length;
  // 单行 DP 优化 | Single-row DP
  const prev = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    let diagPrev = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = prev[j]!;
      if (ref[i - 1] === hyp[j - 1]) {
        prev[j] = diagPrev;
      } else {
        prev[j] = 1 + Math.min(diagPrev, prev[j - 1]!, prev[j]!);
      }
      diagPrev = temp;
    }
  }
  return prev[n]!;
}

// ── 文本归一化 | Text normalization ───────────────────────────────────────

/**
 * 归一化文本用于 WER/CER 对齐：小写、去标点、合并空格。
 * Normalize text for WER/CER alignment: lowercase, strip punctuation, collapse whitespace.
 */
export function normalizeForEval(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── WER / CER ─────────────────────────────────────────────────────────────

/**
 * 词错误率 | Word Error Rate.
 * WER = editDistance(refWords, hypWords) / refWords.length
 */
export function wer(reference: string, hypothesis: string): number {
  const refNorm = normalizeForEval(reference);
  const hypNorm = normalizeForEval(hypothesis);
  const refWords = refNorm ? refNorm.split(' ') : [];
  const hypWords = hypNorm ? hypNorm.split(' ') : [];
  if (refWords.length === 0) return hypWords.length > 0 ? 1 : 0;
  return editDistance(refWords, hypWords) / refWords.length;
}

/**
 * 字错误率 | Character Error Rate.
 * CER = editDistance(refChars, hypChars) / refChars.length
 */
export function cer(reference: string, hypothesis: string): number {
  const refChars = [...normalizeForEval(reference).replace(/\s/g, '')];
  const hypChars = [...normalizeForEval(hypothesis).replace(/\s/g, '')];
  if (refChars.length === 0) return hypChars.length > 0 ? 1 : 0;
  return editDistance(refChars, hypChars) / refChars.length;
}

// ── 批量评测 | Batch evaluation ───────────────────────────────────────────

/**
 * 评测一批转写样本 | Evaluate a batch of transcription samples.
 */
export function evaluateSttSample(sample: SttEvalSample): SttSampleResult {
  const refNorm = normalizeForEval(sample.reference);
  const refWords = refNorm ? refNorm.split(' ') : [];
  const refChars = [...refNorm.replace(/\s/g, '')];
  return {
    wer: wer(sample.reference, sample.hypothesis),
    cer: cer(sample.reference, sample.hypothesis),
    refWordCount: refWords.length,
    refCharCount: refChars.length,
    ...(sample.tag !== undefined && { tag: sample.tag }),
  };
}

/**
 * 生成完整 STT 评测报告 | Generate a full STT evaluation report.
 */
export function runSttEvalReport(samples: SttEvalSample[]): SttEvalReport {
  const results = samples.map(evaluateSttSample);
  const n = results.length;
  if (n === 0) {
    return {
      sampleCount: 0,
      meanWer: 0,
      meanCer: 0,
      weightedWer: 0,
      weightedCer: 0,
      sentenceAccuracy: 0,
      perTagWer: {},
      samples: [],
    };
  }

  // 宏平均 | Macro average
  const meanWer = results.reduce((sum, r) => sum + r.wer, 0) / n;
  const meanCer = results.reduce((sum, r) => sum + r.cer, 0) / n;

  // 微平均 | Micro average (weighted by ref length)
  const totalRefWords = results.reduce((sum, r) => sum + r.refWordCount, 0);
  const totalRefChars = results.reduce((sum, r) => sum + r.refCharCount, 0);
  const weightedWer = totalRefWords > 0
    ? results.reduce((sum, r) => sum + r.wer * r.refWordCount, 0) / totalRefWords
    : 0;
  const weightedCer = totalRefChars > 0
    ? results.reduce((sum, r) => sum + r.cer * r.refCharCount, 0) / totalRefChars
    : 0;

  // 完全匹配 | Exact match
  const exactMatches = results.filter((r) => r.wer === 0).length;
  const sentenceAccuracy = exactMatches / n;

  // 按 tag 分组 | Per-tag grouping
  const tagGroups = new Map<string, number[]>();
  for (const r of results) {
    if (r.tag) {
      const group = tagGroups.get(r.tag) ?? [];
      group.push(r.wer);
      tagGroups.set(r.tag, group);
    }
  }
  const perTagWer: Record<string, number> = {};
  for (const [tag, wers] of tagGroups) {
    perTagWer[tag] = wers.reduce((a, b) => a + b, 0) / wers.length;
  }

  return {
    sampleCount: n,
    meanWer,
    meanCer,
    weightedWer,
    weightedCer,
    sentenceAccuracy,
    perTagWer,
    samples: results,
  };
}
