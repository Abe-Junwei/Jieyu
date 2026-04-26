import { describe, expect, it } from 'vitest';
import { resolveIntentConfidenceGate } from './intentConfidenceGate';
import type { ToolIntentAssessment } from './toolCallHelpers';

function assessment(patch: Partial<ToolIntentAssessment>): ToolIntentAssessment {
  return {
    decision: 'execute',
    score: 5,
    hasExecutionCue: true,
    hasActionVerb: true,
    hasActionTarget: true,
    hasExplicitId: true,
    hasMetaQuestion: false,
    hasTechnicalDiscussion: false,
    ...patch,
  };
}

describe('resolveIntentConfidenceGate', () => {
  it('preserves the original assessment when disabled', () => {
    const original = assessment({
      score: 1,
      hasActionTarget: false,
      hasExplicitId: false,
    });

    expect(resolveIntentConfidenceGate({ enabled: false, assessment: original })).toBe(original);
  });

  it('keeps clear execution intent executable and records evidence fields', () => {
    const result = resolveIntentConfidenceGate({
      enabled: true,
      assessment: assessment({ score: 6 }),
    });

    expect(result.decision).toBe('execute');
    expect(result.confidenceGate?.triggered).toBe(false);
    expect(result.intentCandidates?.[0]?.decision).toBe('execute');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.margin).toBeGreaterThan(0.16);
  });

  it('downgrades ambiguous execution to clarify when confidence is low', () => {
    const result = resolveIntentConfidenceGate({
      enabled: true,
      assessment: assessment({
        score: 1,
        hasActionTarget: false,
        hasExplicitId: false,
      }),
    });

    expect(result.decision).toBe('clarify');
    expect(result.confidenceGate).toMatchObject({
      triggered: true,
      reason: 'competing-clarify-candidate',
    });
    expect(result.intentCandidates?.some((candidate) => candidate.decision === 'execute')).toBe(true);
  });

  it('uses low margin as a separate clarify reason', () => {
    const result = resolveIntentConfidenceGate({
      enabled: true,
      threshold: 0.55,
      marginThreshold: 0.7,
      assessment: assessment({ score: 2, hasExplicitId: false }),
    });

    expect(result.decision).toBe('clarify');
    expect(result.confidenceGate?.reason).toBe('low-margin');
  });
});
