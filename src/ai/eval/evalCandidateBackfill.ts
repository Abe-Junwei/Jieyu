/**
 * PR-P3-3: Eval Candidate Backfill Rules
 *
 * Defines how user interactions and runtime signals generate eval candidates
 * for the agent-evals fixture suite.
 */

export type EvalCandidateSource =
  | 'thumbs_up'
  | 'thumbs_down'
  | 'citation_jump'
  | 'reflection_flagged'
  | 'degradation_override'
  | 'adoption_queue_ignore'
  | 'low_adoption_workflow';

export interface EvalCandidate {
  requestId: string;
  source: EvalCandidateSource;
  workflowId?: string;
  reasonCode?: string;
  /** 用户原始问题（已脱敏） | Sanitized user question */
  userText?: string;
  /** 模型回答摘要 | Model answer summary */
  assistantSummary?: string;
  /** 期望行为描述 | Expected behavior description */
  expectedBehavior?: string;
  /** 失败类型分类 | Failure taxonomy category */
  failureCategory?: string;
}

export interface EvalCandidateFilter {
  minConfidence?: number;
  excludedWorkflows?: string[];
  maxAgeDays?: number;
}

/**
 * Generate eval candidates from a set of runtime signals.
 * Each candidate must be reviewable before entering the fixture suite.
 */
export function generateEvalCandidates(
  signals: Array<{
    requestId: string;
    source: EvalCandidateSource;
    workflowId?: string;
    reasonCode?: string;
    userText?: string;
    assistantSummary?: string;
    timestamp: string;
  }>,
  filter?: EvalCandidateFilter,
): EvalCandidate[] {
  const candidates: EvalCandidate[] = [];

  for (const signal of signals) {
    if (filter?.excludedWorkflows?.includes(signal.workflowId ?? '')) continue;

    const candidate: EvalCandidate = {
      requestId: signal.requestId,
      source: signal.source,
      ...(signal.workflowId !== undefined ? { workflowId: signal.workflowId } : {}),
      ...(signal.reasonCode !== undefined ? { reasonCode: signal.reasonCode } : {}),
    };

    switch (signal.source) {
      case 'thumbs_up':
        candidate.expectedBehavior = 'Answer should continue to meet quality bar';
        break;
      case 'thumbs_down':
        candidate.expectedBehavior = 'Answer should be corrected in next iteration';
        candidate.failureCategory = 'user_rejected';
        break;
      case 'citation_jump':
        candidate.expectedBehavior = 'Citation should point to existing source';
        break;
      case 'reflection_flagged':
        candidate.expectedBehavior = 'Reflection checks should pass after retry';
        candidate.failureCategory = 'reflection_failed';
        break;
      case 'degradation_override':
        candidate.expectedBehavior = 'Degradation scenario should be handled gracefully';
        candidate.failureCategory = 'degradation_unhandled';
        break;
      case 'adoption_queue_ignore':
        candidate.expectedBehavior = 'Workflow output should be actionable';
        candidate.failureCategory = 'low_adoption';
        break;
      case 'low_adoption_workflow':
        candidate.expectedBehavior = 'Workflow should produce useful lexeme or annotation candidates';
        candidate.failureCategory = 'low_adoption';
        break;
      default:
        candidate.expectedBehavior = 'Behavior should match user intent';
    }

    candidates.push(candidate);
  }

  return candidates;
}

/**
 * Validate that a candidate meets the minimum requirements before entering fixtures.
 */
export function validateEvalCandidate(candidate: EvalCandidate): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (!candidate.requestId.trim()) {
    reasons.push('Missing requestId');
  }
  if (!candidate.source) {
    reasons.push('Missing source');
  }
  if (!candidate.expectedBehavior) {
    reasons.push('Missing expectedBehavior');
  }
  if ((candidate.source === 'thumbs_down' || candidate.source === 'reflection_flagged') && !candidate.failureCategory) {
    reasons.push('Failure category required for negative signals');
  }

  return { valid: reasons.length === 0, reasons };
}
