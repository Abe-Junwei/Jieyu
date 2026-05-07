/**
 * PR-14: LLM-as-Judge — Citation Accuracy Judge (规则引擎初版)
 *
 * 对单个 EvidencePacket 的三个维度评分 1–5：
 * - sourceId 真实性
 * - quote 一致性
 * - confidence 合理性
 *
 * 综合分取三个维度平均分（四舍五入到整数）。
 * 规则引擎版满足 P1b 约束：<500ms、<1k token（无 LLM 调用）。
 */

import { annotateBaselineJudge, type JudgeProvider } from './JudgeProvider';

export interface CitationJudgeInput {
  id: string;
  sourceType: string;
  sourceId: string;
  quote: string;
  confidence: number;
}

export interface CitationJudgeDimension {
  score: number;
  reasoning: string;
}

export interface CitationJudgeResult {
  overallScore: number;
  dimensions: {
    sourceId: CitationJudgeDimension;
    quote: CitationJudgeDimension;
    confidence: CitationJudgeDimension;
  };
  reasoning: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KNOWN_PREFIX_RE = /^(seg|unit|doc|layer|note|media|project)-/i;

function scoreSourceId(sourceId: string): CitationJudgeDimension {
  const trimmed = sourceId.trim();
  if (trimmed.length === 0) {
    return { score: 1, reasoning: 'sourceId is empty' };
  }
  if (trimmed.length <= 3) {
    return { score: 2, reasoning: 'sourceId is suspiciously short' };
  }
  if (UUID_RE.test(trimmed) || KNOWN_PREFIX_RE.test(trimmed)) {
    return { score: 5, reasoning: 'sourceId has a recognizable format' };
  }
  if (/^(unknown|none|null|undefined|placeholder|test)/i.test(trimmed)) {
    return { score: 3, reasoning: 'sourceId looks like a placeholder' };
  }
  return { score: 4, reasoning: 'sourceId is present but format is unverified' };
}

function scoreQuote(quote: string): CitationJudgeDimension {
  const trimmed = quote.trim();
  if (trimmed.length === 0) {
    return { score: 1, reasoning: 'quote is empty' };
  }
  if (/^(none|null|undefined|placeholder|n\/a|todo|tbd)/i.test(trimmed)) {
    return { score: 2, reasoning: 'quote looks like a placeholder' };
  }
  if (trimmed.length < 5) {
    return { score: 3, reasoning: 'quote is very short' };
  }
  if (trimmed.length > 1000) {
    return { score: 3, reasoning: 'quote is excessively long' };
  }
  if (trimmed.length >= 10 && trimmed.length <= 500) {
    return { score: 5, reasoning: 'quote has a healthy length' };
  }
  return { score: 4, reasoning: 'quote is present but length is slightly off' };
}

function scoreConfidence(confidence: number): CitationJudgeDimension {
  if (!Number.isFinite(confidence)) {
    return { score: 1, reasoning: 'confidence is not a finite number' };
  }
  if (confidence < 0 || confidence > 1) {
    return { score: 2, reasoning: 'confidence is out of [0,1] bounds' };
  }
  if (confidence === 0 || confidence === 1) {
    return { score: 3, reasoning: 'confidence is at an extreme boundary with no nuance' };
  }
  if (confidence >= 0.3 && confidence <= 0.95) {
    return { score: 5, reasoning: 'confidence is in a well-calibrated range' };
  }
  return { score: 4, reasoning: 'confidence is within [0,1] but slightly off optimal range' };
}

/**
 * Judge a single EvidencePacket for citation accuracy.
 * Returns scores 1–5 per dimension and an overall rounded average.
 */
export function judgeCitationAccuracy(input: CitationJudgeInput): CitationJudgeResult {
  const dSourceId = scoreSourceId(input.sourceId);
  const dQuote = scoreQuote(input.quote);
  const dConfidence = scoreConfidence(input.confidence);

  const overallScore = Math.round((dSourceId.score + dQuote.score + dConfidence.score) / 3);
  const clampedOverall = Math.max(1, Math.min(5, overallScore));

  const reasoning = [
    `sourceId(${dSourceId.score}): ${dSourceId.reasoning}`,
    `quote(${dQuote.score}): ${dQuote.reasoning}`,
    `confidence(${dConfidence.score}): ${dConfidence.reasoning}`,
  ].join('; ');

  return {
    overallScore: clampedOverall,
    dimensions: {
      sourceId: dSourceId,
      quote: dQuote,
      confidence: dConfidence,
    },
    reasoning,
  };
}

/**
 * Batch judge multiple packets. Returns the average overall score
 * and per-packet results.
 */
export function judgeCitationAccuracyBatch(
  inputs: readonly CitationJudgeInput[],
): { averageScore: number; results: CitationJudgeResult[] } {
  const results = inputs.map((input) => judgeCitationAccuracy(input));
  const averageScore =
    results.length === 0
      ? 0
      : Math.round(
          (results.reduce((sum, r) => sum + r.overallScore, 0) / results.length) * 10,
        ) / 10;
  return { averageScore, results };
}

/** baseline_judge provider for citation accuracy */
const citationJudgeProvider: JudgeProvider<CitationJudgeInput, CitationJudgeResult> = annotateBaselineJudge({
  name: 'citation_accuracy_baseline',
  judge: judgeCitationAccuracy,
  judgeBatch: (inputs) => judgeCitationAccuracyBatch(inputs).results,
});
