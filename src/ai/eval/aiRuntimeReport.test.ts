import { describe, expect, it } from 'vitest';
import { buildAiRuntimeReport } from './aiRuntimeReport';
import type { CitationJudgeResult } from './citationJudge';
import type { RelevanceJudgeResult } from './relevanceJudge';

function makeCitation(score: number): CitationJudgeResult {
  return {
    overallScore: score,
    dimensions: {
      sourceId: { score: score, reasoning: '' },
      quote: { score: score, reasoning: '' },
      confidence: { score: score, reasoning: '' },
    },
    reasoning: '',
  };
}

function makeRelevance(score: number): RelevanceJudgeResult {
  return {
    overallScore: score,
    dimensions: {
      topicAlignment: { score: score, reasoning: '' },
      completeness: { score: score, reasoning: '' },
      conciseness: { score: score, reasoning: '' },
    },
    reasoning: '',
  };
}

describe('buildAiRuntimeReport', () => {
  it('returns zeroed report for empty inputs', () => {
    const report = buildAiRuntimeReport([], []);
    expect(report.citation.averageScore).toBe(0);
    expect(report.relevance.averageScore).toBe(0);
    expect(report.anomalies).toEqual([]);
  });

  it('computes averages and distributions', () => {
    const citations: CitationJudgeResult[] = [makeCitation(5), makeCitation(4), makeCitation(3)];
    const relevances: RelevanceJudgeResult[] = [makeRelevance(5), makeRelevance(3), makeRelevance(2)];
    const report = buildAiRuntimeReport(citations, relevances);

    expect(report.citation.averageScore).toBe(4);
    expect(report.relevance.averageScore).toBeCloseTo(3.3, 1);
    expect(report.citation.distribution[5]).toBe(1);
    expect(report.citation.distribution[4]).toBe(1);
    expect(report.citation.distribution[3]).toBe(1);
  });

  it('flags low scores correctly', () => {
    const citations: CitationJudgeResult[] = [makeCitation(5), makeCitation(2), makeCitation(1)];
    const relevances: RelevanceJudgeResult[] = [makeRelevance(5), makeRelevance(2)];
    const report = buildAiRuntimeReport(citations, relevances);

    expect(report.citation.flaggedCount).toBe(2);
    expect(report.relevance.flaggedCount).toBe(1);
  });

  it('detects anomalies when averages drop below threshold', () => {
    const citations: CitationJudgeResult[] = [makeCitation(2), makeCitation(2), makeCitation(2)];
    const relevances: RelevanceJudgeResult[] = [makeRelevance(2), makeRelevance(2)];
    const report = buildAiRuntimeReport(citations, relevances);

    expect(report.anomalies.length).toBeGreaterThanOrEqual(2);
    expect(report.anomalies.some((a) => a.includes('citation'))).toBe(true);
    expect(report.anomalies.some((a) => a.includes('relevance'))).toBe(true);
  });

  it('respects windowSize', () => {
    const citations: CitationJudgeResult[] = Array.from({ length: 10 }, (_, i) => makeCitation(i + 1));
    const report = buildAiRuntimeReport(citations, [], 5);
    expect(report.windowSize).toBe(5);
    expect(report.citation.averageScore).toBe(8); // (6+7+8+9+10)/5 = 8
  });

  it('builds dual-track trend with paired entries', () => {
    const citations: CitationJudgeResult[] = [makeCitation(5), makeCitation(4)];
    const relevances: RelevanceJudgeResult[] = [makeRelevance(3)];
    const report = buildAiRuntimeReport(citations, relevances);

    expect(report.dualTrackTrend).toHaveLength(2);
    expect(report.dualTrackTrend[0]!.citationOverall).toBe(5);
    expect(report.dualTrackTrend[0]!.relevanceOverall).toBe(3);
    expect(report.dualTrackTrend[1]!.citationOverall).toBe(4);
    expect(report.dualTrackTrend[1]!.relevanceOverall).toBe(0);
  });

  it('includes generatedAt timestamp', () => {
    const report = buildAiRuntimeReport([], []);
    expect(new Date(report.generatedAt).getTime()).not.toBeNaN();
  });
});
