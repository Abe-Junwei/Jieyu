import type { ToolIntentAssessment, ToolIntentDecision } from './toolCallHelpers';

export interface IntentConfidenceGateInput {
  enabled: boolean;
  assessment: ToolIntentAssessment;
  threshold?: number;
  marginThreshold?: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function candidateScore(decision: ToolIntentDecision, assessment: ToolIntentAssessment): number {
  if (decision === assessment.decision) return clamp01(0.5 + Math.max(-2, Math.min(6, assessment.score)) / 12);
  if (decision === 'execute') {
    return clamp01((assessment.hasActionVerb ? 0.25 : 0) + (assessment.hasActionTarget ? 0.25 : 0) + (assessment.hasExplicitId ? 0.2 : 0) + (assessment.hasExecutionCue ? 0.15 : 0));
  }
  if (decision === 'clarify') {
    const partialAction = assessment.hasActionVerb !== assessment.hasActionTarget;
    return clamp01((partialAction ? 0.5 : 0.2) + (assessment.hasExecutionCue ? 0.1 : 0) + (!assessment.hasExplicitId ? 0.15 : 0));
  }
  if (decision === 'ignore') {
    return clamp01((assessment.hasMetaQuestion ? 0.55 : 0) + (!assessment.hasActionVerb && !assessment.hasActionTarget ? 0.25 : 0));
  }
  return assessment.decision === 'cancel' ? 0.9 : 0.05;
}

export function resolveIntentConfidenceGate(input: IntentConfidenceGateInput): ToolIntentAssessment {
  if (!input.enabled) return input.assessment;
  const threshold = input.threshold ?? 0.64;
  const marginThreshold = input.marginThreshold ?? 0.16;
  const intentCandidates = (['execute', 'clarify', 'ignore', 'cancel'] as const)
    .map((decision) => ({ decision, confidence: candidateScore(decision, input.assessment), why: decision === input.assessment.decision ? 'base-intent-decision' : 'alternate-intent-signal' }))
    .sort((a, b) => b.confidence - a.confidence);
  const [top, runnerUp] = intentCandidates;
  const confidence = top?.confidence ?? 0;
  const margin = confidence - (runnerUp?.confidence ?? 0);
  const competingClarify = input.assessment.decision === 'execute' && top?.decision === 'clarify';
  const shouldClarify = input.assessment.decision === 'execute' && (competingClarify || confidence < threshold || margin < marginThreshold);
  return {
    ...input.assessment,
    decision: shouldClarify ? 'clarify' : input.assessment.decision,
    intentCandidates,
    confidence,
    margin,
    confidenceGate: {
      triggered: shouldClarify,
      threshold,
      marginThreshold,
      ...(shouldClarify ? { reason: competingClarify ? 'competing-clarify-candidate' : (confidence < threshold ? 'low-confidence' : 'low-margin') } : {}),
    },
  };
}
