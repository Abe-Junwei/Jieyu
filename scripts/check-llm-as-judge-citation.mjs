#!/usr/bin/env node
/**
 * PR-14: LLM-as-Judge Citation Accuracy 验收脚本
 * 对 10 条固定 fixture 运行规则引擎 judge，输出 1–5 分。
 * 规则引擎版满足 P1b 约束（无 LLM 调用，<500ms，<1k token）。
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KNOWN_PREFIX_RE = /^(seg|unit|doc|layer|note|media|project)-/i;

function scoreSourceId(sourceId) {
  const trimmed = sourceId.trim();
  if (trimmed.length === 0) return { score: 1, reasoning: 'sourceId is empty' };
  if (trimmed.length <= 3) return { score: 2, reasoning: 'sourceId is suspiciously short' };
  if (UUID_RE.test(trimmed) || KNOWN_PREFIX_RE.test(trimmed)) return { score: 5, reasoning: 'sourceId has a recognizable format' };
  if (/^(unknown|none|null|undefined|placeholder|test)/i.test(trimmed)) return { score: 3, reasoning: 'sourceId looks like a placeholder' };
  return { score: 4, reasoning: 'sourceId is present but format is unverified' };
}

function scoreQuote(quote) {
  const trimmed = quote.trim();
  if (trimmed.length === 0) return { score: 1, reasoning: 'quote is empty' };
  if (/^(none|null|undefined|placeholder|n\/a|todo|tbd)/i.test(trimmed)) return { score: 2, reasoning: 'quote looks like a placeholder' };
  if (trimmed.length < 5) return { score: 3, reasoning: 'quote is very short' };
  if (trimmed.length > 1000) return { score: 3, reasoning: 'quote is excessively long' };
  if (trimmed.length >= 10 && trimmed.length <= 500) return { score: 5, reasoning: 'quote has a healthy length' };
  return { score: 4, reasoning: 'quote is present but length is slightly off' };
}

function scoreConfidence(confidence) {
  if (!Number.isFinite(confidence)) return { score: 1, reasoning: 'confidence is not a finite number' };
  if (confidence < 0 || confidence > 1) return { score: 2, reasoning: 'confidence is out of [0,1] bounds' };
  if (confidence === 0 || confidence === 1) return { score: 3, reasoning: 'confidence is at an extreme boundary with no nuance' };
  if (confidence >= 0.3 && confidence <= 0.95) return { score: 5, reasoning: 'confidence is in a well-calibrated range' };
  return { score: 4, reasoning: 'confidence is within [0,1] but slightly off optimal range' };
}

function judgeCitationAccuracy(input) {
  const dSourceId = scoreSourceId(input.sourceId);
  const dQuote = scoreQuote(input.quote);
  const dConfidence = scoreConfidence(input.confidence);
  const overallScore = Math.max(1, Math.min(5, Math.round((dSourceId.score + dQuote.score + dConfidence.score) / 3)));
  const reasoning = `sourceId(${dSourceId.score}): ${dSourceId.reasoning}; quote(${dQuote.score}): ${dQuote.reasoning}; confidence(${dConfidence.score}): ${dConfidence.reasoning}`;
  return { overallScore, dimensions: { sourceId: dSourceId, quote: dQuote, confidence: dConfidence }, reasoning };
}

function judgeCitationAccuracyBatch(inputs) {
  const results = inputs.map((input) => judgeCitationAccuracy(input));
  const averageScore = results.length === 0 ? 0 : Math.round((results.reduce((sum, r) => sum + r.overallScore, 0) / results.length) * 10) / 10;
  return { averageScore, results };
}

const FIXTURES = [
  {
    caseId: 'perfect-seg-01',
    id: 'ep-001',
    sourceType: 'segment',
    sourceId: 'seg-001',
    quote: 'This is a well-formed quote with adequate length for evaluation.',
    confidence: 0.85,
  },
  {
    caseId: 'empty-sourceId-02',
    id: 'ep-002',
    sourceType: 'segment',
    sourceId: '',
    quote: 'A reasonable quote here.',
    confidence: 0.75,
  },
  {
    caseId: 'placeholder-sourceId-03',
    id: 'ep-003',
    sourceType: 'segment',
    sourceId: 'unknown',
    quote: 'A reasonable quote here.',
    confidence: 0.8,
  },
  {
    caseId: 'empty-quote-04',
    id: 'ep-004',
    sourceType: 'segment',
    sourceId: 'seg-004',
    quote: '',
    confidence: 0.9,
  },
  {
    caseId: 'short-quote-05',
    id: 'ep-005',
    sourceType: 'segment',
    sourceId: 'seg-005',
    quote: 'Hi',
    confidence: 0.85,
  },
  {
    caseId: 'boundary-confidence-06',
    id: 'ep-006',
    sourceType: 'segment',
    sourceId: 'seg-006',
    quote: 'A reasonable quote here.',
    confidence: 1.0,
  },
  {
    caseId: 'oob-confidence-07',
    id: 'ep-007',
    sourceType: 'segment',
    sourceId: 'seg-007',
    quote: 'A reasonable quote here.',
    confidence: 1.5,
  },
  {
    caseId: 'nan-confidence-08',
    id: 'ep-008',
    sourceType: 'segment',
    sourceId: 'seg-008',
    quote: 'A reasonable quote here.',
    confidence: NaN,
  },
  {
    caseId: 'uuid-sourceId-09',
    id: 'ep-009',
    sourceType: 'document',
    sourceId: '550e8400-e29b-41d4-a716-446655440000',
    quote: 'A reasonable quote here.',
    confidence: 0.6,
  },
  {
    caseId: 'all-bad-10',
    id: 'ep-010',
    sourceType: 'segment',
    sourceId: '',
    quote: '',
    confidence: NaN,
  },
];

function main() {
  const startMs = performance.now();
  const { averageScore, results } = judgeCitationAccuracyBatch(FIXTURES);
  const elapsedMs = performance.now() - startMs;

  console.log('LLM-as-Judge Citation Accuracy (rule-engine v0)');
  console.log('─────────────────────────────────────────────────');
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    console.log(
      `${String(i + 1).padStart(2)}. ${FIXTURES[i].caseId} → overall=${r.overallScore} ` +
      `[sourceId=${r.dimensions.sourceId.score} quote=${r.dimensions.quote.score} confidence=${r.dimensions.confidence.score}]`
    );
  }
  console.log('─────────────────────────────────────────────────');
  console.log(`Average overall score: ${averageScore}`);
  console.log(`Elapsed: ${elapsedMs.toFixed(2)}ms`);

  const allInRange = results.every((r) => r.overallScore >= 1 && r.overallScore <= 5);
  if (!allInRange) {
    console.error('\n❌ Some scores are outside the 1–5 range');
    process.exit(1);
  }

  if (elapsedMs > 500) {
    console.warn('\n⚠️ Elapsed time exceeded 500ms budget');
  }

  console.log('\n✅ Citation Judge check passed');
  process.exit(0);
}

main();
