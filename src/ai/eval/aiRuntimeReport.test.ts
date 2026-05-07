import { describe, expect, it } from 'vitest';
import {
  attachAdoptionOutcomeRollupFromAuditMetadataJsons,
  attachWorkflowExplainabilityRollupFromChat,
  buildAiRuntimeReport,
  buildAiRuntimeReportWithContext,
  rollupAdoptionOutcomesFromAuditMetadataJsons,
} from './aiRuntimeReport';
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

  it('has empty dimensions and sampleRequestIds for legacy call', () => {
    const report = buildAiRuntimeReport([makeCitation(4)], [makeRelevance(3)]);
    expect(report.dimensions.byWorkflow).toEqual({});
    expect(report.dimensions.byProvider).toEqual({});
    expect(report.dimensions.bySourceScope).toEqual({});
    expect(report.sampleRequestIds).toEqual([]);
  });

  describe('buildAiRuntimeReportWithContext', () => {
    it('aggregates by workflow dimension', () => {
      const report = buildAiRuntimeReportWithContext(
        [
          { result: makeCitation(5), context: { requestId: 'r1', workflowId: 'segment_qa' } },
          { result: makeCitation(3), context: { requestId: 'r2', workflowId: 'segment_qa' } },
          { result: makeCitation(4), context: { requestId: 'r3', workflowId: 'annotation_qa' } },
        ],
        [
          { result: makeRelevance(4), context: { requestId: 'r1', workflowId: 'segment_qa' } },
        ],
      );

      expect(report.dimensions.byWorkflow.segment_qa).toBeDefined();
      expect(report.dimensions.byWorkflow.segment_qa!.sampleCount).toBe(2);
      expect(report.dimensions.byWorkflow.annotation_qa).toBeDefined();
      expect(report.sampleRequestIds).toContain('r1');
      expect(report.sampleRequestIds).toContain('r2');
      expect(report.sampleRequestIds).toContain('r3');
    });

    it('aggregates by provider dimension', () => {
      const report = buildAiRuntimeReportWithContext(
        [
          { result: makeCitation(5), context: { requestId: 'r1', providerId: 'openai' } },
          { result: makeCitation(4), context: { requestId: 'r2', providerId: 'anthropic' } },
        ],
        [],
      );

      expect(report.dimensions.byProvider.openai).toBeDefined();
      expect(report.dimensions.byProvider.anthropic).toBeDefined();
    });

    it('deduplicates sampleRequestIds', () => {
      const report = buildAiRuntimeReportWithContext(
        [
          { result: makeCitation(5), context: { requestId: 'r1', workflowId: 'segment_qa' } },
          { result: makeCitation(4), context: { requestId: 'r1', workflowId: 'segment_qa' } },
        ],
        [],
      );
      expect(report.sampleRequestIds.filter((id) => id === 'r1')).toHaveLength(1);
    });

    it('merges workflow explainability rollup when snapshots provided', () => {
      const report = buildAiRuntimeReportWithContext([], [], 50, {
        workflowExplainabilitySnapshots: [
          {
            headlineKey: 'degraded_response',
            detailSignals: ['degradation:reflection_flagged'],
            tone: 'info',
            hasDegradation: true,
            hasSourceScopeSummary: false,
          },
          {
            headlineKey: 'scope_summary_only',
            detailSignals: ['source_scope:segment'],
            tone: 'neutral',
            hasDegradation: false,
            hasSourceScopeSummary: true,
          },
        ],
      });
      expect(report.workflowExplainabilityRollup?.schemaVersion).toBe(1);
      expect(report.workflowExplainabilityRollup?.byHeadline.degraded_response).toBe(1);
      expect(report.workflowExplainabilityRollup?.byHeadline.scope_summary_only).toBe(1);
      expect(report.workflowExplainabilityRollup?.recentSignals.length).toBeGreaterThan(0);
    });

    it('attachWorkflowExplainabilityRollupFromChat derives rollup from chat messages', () => {
      const base = buildAiRuntimeReport([], []);
      const merged = attachWorkflowExplainabilityRollupFromChat(base, [
        { role: 'assistant', workflowExplainability: {
          headlineKey: 'degraded_response',
          detailSignals: ['degradation:judge_low_score'],
          tone: 'info',
          hasDegradation: true,
          hasSourceScopeSummary: false,
        } },
      ]);
      expect(merged.workflowExplainabilityRollup?.byHeadline.degraded_response).toBe(1);
    });

    it('merges adoption outcome rollup when adoptionOutcomeMetadataJsons provided', () => {
      const ignoreMeta = JSON.stringify({
        schemaVersion: 1,
        phase: 'adoption_outcome',
        action: 'ignore',
        fromStatus: 'pending',
        toStatus: 'ignored',
        itemId: 'i1',
        workflowId: 'segment_qa',
        requestId: 'r1',
      });
      const report = buildAiRuntimeReportWithContext([], [], 50, {
        adoptionOutcomeMetadataJsons: [ignoreMeta, ignoreMeta],
      });
      expect(report.adoptionOutcomeRollup?.ignored).toBe(2);
      expect(report.adoptionOutcomeRollup?.accepted).toBe(0);
    });
  });
});

describe('rollupAdoptionOutcomesFromAuditMetadataJsons', () => {
  it('returns undefined for empty or invalid inputs', () => {
    expect(rollupAdoptionOutcomesFromAuditMetadataJsons([])).toBeUndefined();
    expect(rollupAdoptionOutcomesFromAuditMetadataJsons(['not-json'])).toBeUndefined();
  });

  it('counts accept / ignore / copy by action', () => {
    const accept = JSON.stringify({ phase: 'adoption_outcome', action: 'accept' });
    const copy = JSON.stringify({ phase: 'adoption_outcome', action: 'copy' });
    const rollup = rollupAdoptionOutcomesFromAuditMetadataJsons([accept, copy]);
    expect(rollup?.accepted).toBe(1);
    expect(rollup?.copied).toBe(1);
  });

  it('attachAdoptionOutcomeRollupFromAuditMetadataJsons merges into report', () => {
    const base = buildAiRuntimeReport([], []);
    const meta = JSON.stringify({ phase: 'adoption_outcome', action: 'accept' });
    const merged = attachAdoptionOutcomeRollupFromAuditMetadataJsons(base, [meta]);
    expect(merged.adoptionOutcomeRollup?.accepted).toBe(1);
  });
});
