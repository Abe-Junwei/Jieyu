import { describe, expect, it } from 'vitest';
import { ProjectObserver, inferStage, generateRecommendations, computeMultiSignalRiskScore } from './ProjectObserver';
import type { ObserverMetrics, WaveformSignals } from './ProjectObserver';

const glossingMetrics: ObserverMetrics = {
  utteranceCount: 100,
  transcribedRate: 0.9,
  glossedRate: 0.3,
  verifiedRate: 0.1,
};

const reviewingMetrics: ObserverMetrics = {
  utteranceCount: 100,
  transcribedRate: 0.95,
  glossedRate: 0.8,
  verifiedRate: 0.7,
};

describe('inferStage', () => {
  it('returns collecting when no utterances', () => {
    expect(inferStage({ utteranceCount: 0, transcribedRate: 0, glossedRate: 0, verifiedRate: 0 })).toBe('collecting');
  });

  it('returns glossing when glossedRate is low and transcribedRate is high', () => {
    expect(inferStage(glossingMetrics)).toBe('glossing');
  });

  it('returns reviewing when verifiedRate >= 0.5', () => {
    expect(inferStage(reviewingMetrics)).toBe('reviewing');
  });
});

describe('computeMultiSignalRiskScore', () => {
  it('returns 0 when no utterances', () => {
    expect(computeMultiSignalRiskScore({ lowConfidenceCount: 5, overlapCount: 3, gapCount: 2, maxGapSeconds: 4 }, 0)).toBe(0);
  });

  it('produces higher score with more signals', () => {
    const low: WaveformSignals = { lowConfidenceCount: 1, overlapCount: 0, gapCount: 0, maxGapSeconds: 0 };
    const high: WaveformSignals = { lowConfidenceCount: 10, overlapCount: 5, gapCount: 3, maxGapSeconds: 8, topHotZoneSeverity: 0.8 };
    const scoreLow = computeMultiSignalRiskScore(low, 20);
    const scoreHigh = computeMultiSignalRiskScore(high, 20);
    expect(scoreHigh).toBeGreaterThan(scoreLow);
  });

  it('incorporates hot-zone severity', () => {
    const base: WaveformSignals = { lowConfidenceCount: 5, overlapCount: 2, gapCount: 1, maxGapSeconds: 2 };
    const withHotZone = { ...base, topHotZoneSeverity: 0.9 };
    const without = computeMultiSignalRiskScore(base, 20);
    const withHz = computeMultiSignalRiskScore(withHotZone, 20);
    expect(withHz).toBeGreaterThan(without);
  });
});

describe('generateRecommendations with waveform signals', () => {
  it('adds overlap warning during transcribing when overlapCount >= 3', () => {
    const metrics: ObserverMetrics = { utteranceCount: 50, transcribedRate: 0.5, glossedRate: 0, verifiedRate: 0 };
    const recs = generateRecommendations(metrics, { lowConfidenceCount: 2, overlapCount: 5, gapCount: 0, maxGapSeconds: 0 });
    expect(recs.some((r) => r.id === 'transcribing-overlap-warn')).toBe(true);
  });

  it('adds gap warning during glossing when maxGapSeconds > 3', () => {
    const recs = generateRecommendations(glossingMetrics, { lowConfidenceCount: 2, overlapCount: 0, gapCount: 1, maxGapSeconds: 5.2 });
    expect(recs.some((r) => r.id === 'glossing-gap-warn')).toBe(true);
  });

  it('boosts glossing-risk-review priority with high risk score', () => {
    const baseline = generateRecommendations(glossingMetrics);
    const boosted = generateRecommendations(glossingMetrics, {
      lowConfidenceCount: 50, overlapCount: 20, gapCount: 10, maxGapSeconds: 8, topHotZoneSeverity: 0.9,
    });
    const basePriority = baseline.find((r) => r.id === 'glossing-risk-review')!.priority;
    const boostPriority = boosted.find((r) => r.id === 'glossing-risk-review')!.priority;
    expect(boostPriority).toBeGreaterThan(basePriority);
  });

  it('boosts reviewing-risk-review priority with high risk score', () => {
    const baseline = generateRecommendations(reviewingMetrics);
    const boosted = generateRecommendations(reviewingMetrics, {
      lowConfidenceCount: 40, overlapCount: 10, gapCount: 5, maxGapSeconds: 6, topHotZoneSeverity: 0.7,
    });
    const basePriority = baseline.find((r) => r.id === 'reviewing-risk-review')!.priority;
    const boostPriority = boosted.find((r) => r.id === 'reviewing-risk-review')!.priority;
    expect(boostPriority).toBeGreaterThan(basePriority);
  });
});

describe('ProjectObserver.evaluate', () => {
  it('passes waveform signals through to recommendations', () => {
    const observer = new ProjectObserver();
    const result = observer.evaluate(glossingMetrics, {
      lowConfidenceCount: 80, overlapCount: 30, gapCount: 10, maxGapSeconds: 8, topHotZoneSeverity: 0.9,
    });
    expect(result.stage).toBe('glossing');
    const riskRec = result.recommendations.find((r) => r.id === 'glossing-risk-review')!;
    expect(riskRec.detail).toContain('综合风险分');
  });
});
