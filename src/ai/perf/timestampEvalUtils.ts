/**
 * 时间戳评测工具 | Timestamp evaluation utilities
 *
 * 复用 AlignmentInterval 语义，对词级时间戳方案做可回归评测。
 * Metrics are based on AlignmentInterval-compatible word boundaries so
 * future providers like CrisperWhisper / WhisperX / WebMAUS can be evaluated
 * without binding the runtime to a specific implementation in advance.
 */

import type { AlignmentInterval } from '../../types/alignmentTask';
import { normalizeForEval, wer } from './sttEvalUtils';

export interface TimestampEvalSample {
  /** 参考词级边界（人工标注）| Reference word boundaries (ground truth) */
  referenceWords: AlignmentInterval[];
  /** 候选词级边界（模型输出）| Candidate word boundaries (model output) */
  hypothesisWords: AlignmentInterval[];
  /** 可选标签（语言/数据集）| Optional tag (language / dataset) */
  tag?: string;
}

export interface TimestampAlignmentPair {
  referenceIndex: number;
  hypothesisIndex: number;
  reference: AlignmentInterval;
  hypothesis: AlignmentInterval;
}

export interface TimestampSampleResult {
  referenceWordCount: number;
  hypothesisWordCount: number;
  matchedWordCount: number;
  hasPrediction: boolean;
  textWer: number;
  boundaryF1At25Ms: number;
  boundaryF1At50Ms: number;
  startMaeMs?: number;
  endMaeMs?: number;
  boundaryMaeMs?: number;
  tag?: string;
}

export interface TimestampEvalReport {
  sampleCount: number;
  sampleCoverageRate: number;
  languageCoverageRate: number;
  meanTextWer: number;
  meanBoundaryF1At25Ms: number;
  meanBoundaryF1At50Ms: number;
  meanStartMaeMs?: number;
  meanEndMaeMs?: number;
  meanBoundaryMaeMs?: number;
  perTagCoverageRate: Record<string, number>;
  samples: TimestampSampleResult[];
}

function normalizeIntervalToken(interval: AlignmentInterval): string {
  return normalizeForEval(interval.text).replace(/\s+/g, '');
}

function intervalsToTranscript(intervals: readonly AlignmentInterval[]): string {
  return intervals.map((interval) => interval.text).join(' ');
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function meanDefined(values: ReadonlyArray<number | undefined>): number | undefined {
  const defined = values.filter((value): value is number => typeof value === 'number');
  if (defined.length === 0) return undefined;
  return mean(defined);
}

/**
 * 最长公共子序列对齐 | Longest-common-subsequence alignment
 *
 * 这里只对“文本归一化后完全相同”的词做配对，插入/删除/替换通过 textWer 体现，
 * 时间戳 MAE 只在可确定的一一匹配词上计算。
 * Only exact normalized token matches are paired here. Insertions, deletions,
 * and substitutions are captured by textWer; timestamp MAE is computed only on
 * unambiguous word matches.
 */
export function alignWordIntervalsLcs(
  referenceWords: readonly AlignmentInterval[],
  hypothesisWords: readonly AlignmentInterval[],
): TimestampAlignmentPair[] {
  const referenceTokens = referenceWords.map(normalizeIntervalToken);
  const hypothesisTokens = hypothesisWords.map(normalizeIntervalToken);
  const rows = referenceTokens.length;
  const cols = hypothesisTokens.length;
  const dp = Array.from({ length: rows + 1 }, () => new Array<number>(cols + 1).fill(0));

  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let col = cols - 1; col >= 0; col -= 1) {
      dp[row]![col] = referenceTokens[row] === hypothesisTokens[col]
        ? 1 + dp[row + 1]![col + 1]!
        : Math.max(dp[row + 1]![col]!, dp[row]![col + 1]!);
    }
  }

  const aligned: TimestampAlignmentPair[] = [];
  let row = 0;
  let col = 0;
  while (row < rows && col < cols) {
    if (referenceTokens[row] === hypothesisTokens[col]) {
      aligned.push({
        referenceIndex: row,
        hypothesisIndex: col,
        reference: referenceWords[row]!,
        hypothesis: hypothesisWords[col]!,
      });
      row += 1;
      col += 1;
      continue;
    }

    if (dp[row + 1]![col]! >= dp[row]![col + 1]!) {
      row += 1;
    } else {
      col += 1;
    }
  }

  return aligned;
}

export function computeBoundaryF1(
  referenceWords: readonly AlignmentInterval[],
  hypothesisWords: readonly AlignmentInterval[],
  thresholdMs: number,
): number {
  const thresholdSeconds = thresholdMs / 1000;
  const referenceBoundaryCount = referenceWords.length * 2;
  const hypothesisBoundaryCount = hypothesisWords.length * 2;
  if (referenceBoundaryCount === 0 && hypothesisBoundaryCount === 0) return 1;
  if (referenceBoundaryCount === 0 || hypothesisBoundaryCount === 0) return 0;

  const alignedPairs = alignWordIntervalsLcs(referenceWords, hypothesisWords);
  let truePositiveCount = 0;
  for (const pair of alignedPairs) {
    if (Math.abs(pair.reference.startTime - pair.hypothesis.startTime) <= thresholdSeconds) {
      truePositiveCount += 1;
    }
    if (Math.abs(pair.reference.endTime - pair.hypothesis.endTime) <= thresholdSeconds) {
      truePositiveCount += 1;
    }
  }

  const precision = truePositiveCount / hypothesisBoundaryCount;
  const recall = truePositiveCount / referenceBoundaryCount;
  if (precision <= 0 || recall <= 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

export function evaluateTimestampSample(sample: TimestampEvalSample): TimestampSampleResult {
  const alignedPairs = alignWordIntervalsLcs(sample.referenceWords, sample.hypothesisWords);
  const startMaeMs = alignedPairs.length > 0
    ? mean(alignedPairs.map((pair) => Math.abs(pair.reference.startTime - pair.hypothesis.startTime) * 1000))
    : undefined;
  const endMaeMs = alignedPairs.length > 0
    ? mean(alignedPairs.map((pair) => Math.abs(pair.reference.endTime - pair.hypothesis.endTime) * 1000))
    : undefined;
  const boundaryMaeMs = alignedPairs.length > 0
    ? mean(alignedPairs.flatMap((pair) => [
      Math.abs(pair.reference.startTime - pair.hypothesis.startTime) * 1000,
      Math.abs(pair.reference.endTime - pair.hypothesis.endTime) * 1000,
    ]))
    : undefined;

  return {
    referenceWordCount: sample.referenceWords.length,
    hypothesisWordCount: sample.hypothesisWords.length,
    matchedWordCount: alignedPairs.length,
    hasPrediction: sample.hypothesisWords.length > 0,
    textWer: wer(intervalsToTranscript(sample.referenceWords), intervalsToTranscript(sample.hypothesisWords)),
    boundaryF1At25Ms: computeBoundaryF1(sample.referenceWords, sample.hypothesisWords, 25),
    boundaryF1At50Ms: computeBoundaryF1(sample.referenceWords, sample.hypothesisWords, 50),
    ...(startMaeMs !== undefined ? { startMaeMs } : {}),
    ...(endMaeMs !== undefined ? { endMaeMs } : {}),
    ...(boundaryMaeMs !== undefined ? { boundaryMaeMs } : {}),
    ...(sample.tag !== undefined ? { tag: sample.tag } : {}),
  };
}

export function runTimestampEvalReport(samples: TimestampEvalSample[]): TimestampEvalReport {
  const results = samples.map(evaluateTimestampSample);
  const sampleCount = results.length;
  if (sampleCount === 0) {
    return {
      sampleCount: 0,
      sampleCoverageRate: 0,
      languageCoverageRate: 0,
      meanTextWer: 0,
      meanBoundaryF1At25Ms: 0,
      meanBoundaryF1At50Ms: 0,
      perTagCoverageRate: {},
      samples: [],
    };
  }

  const predictedSampleCount = results.filter((result) => result.hasPrediction).length;
  const sampleCoverageRate = predictedSampleCount / sampleCount;

  const tagStats = new Map<string, { total: number; covered: number }>();
  for (const result of results) {
    if (!result.tag) continue;
    const stats = tagStats.get(result.tag) ?? { total: 0, covered: 0 };
    stats.total += 1;
    if (result.hasPrediction) stats.covered += 1;
    tagStats.set(result.tag, stats);
  }
  const perTagCoverageRate: Record<string, number> = {};
  for (const [tag, stats] of tagStats) {
    perTagCoverageRate[tag] = stats.total > 0 ? stats.covered / stats.total : 0;
  }

  const languageCoverageRate = tagStats.size > 0
    ? Object.values(perTagCoverageRate).filter((value) => value > 0).length / tagStats.size
    : sampleCoverageRate;

  return {
    sampleCount,
    sampleCoverageRate,
    languageCoverageRate,
    meanTextWer: mean(results.map((result) => result.textWer)),
    meanBoundaryF1At25Ms: mean(results.map((result) => result.boundaryF1At25Ms)),
    meanBoundaryF1At50Ms: mean(results.map((result) => result.boundaryF1At50Ms)),
    ...(meanDefined(results.map((result) => result.startMaeMs)) !== undefined
      ? { meanStartMaeMs: meanDefined(results.map((result) => result.startMaeMs)) }
      : {}),
    ...(meanDefined(results.map((result) => result.endMaeMs)) !== undefined
      ? { meanEndMaeMs: meanDefined(results.map((result) => result.endMaeMs)) }
      : {}),
    ...(meanDefined(results.map((result) => result.boundaryMaeMs)) !== undefined
      ? { meanBoundaryMaeMs: meanDefined(results.map((result) => result.boundaryMaeMs)) }
      : {}),
    perTagCoverageRate,
    samples: results,
  };
}