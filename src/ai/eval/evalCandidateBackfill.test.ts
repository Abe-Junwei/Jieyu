// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { generateEvalCandidates, validateEvalCandidate } from './evalCandidateBackfill';

function makeSignal(overrides: Partial<Parameters<typeof generateEvalCandidates>[0][number]> = {}): Parameters<typeof generateEvalCandidates>[0][number] {
  return {
    requestId: 'req-001',
    source: 'thumbs_up',
    workflowId: 'segment_qa',
    timestamp: '2026-05-06T12:00:00Z',
    ...overrides,
  };
}

describe('generateEvalCandidates', () => {
  it('generates candidate from thumbs_up', () => {
    const candidates = generateEvalCandidates([makeSignal()]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.expectedBehavior).toContain('continue to meet quality bar');
  });

  it('generates candidate from reflection_flagged with failureCategory', () => {
    const candidates = generateEvalCandidates([makeSignal({ source: 'reflection_flagged' })]);
    expect(candidates[0]!.failureCategory).toBe('reflection_failed');
    expect(candidates[0]!.expectedBehavior).toContain('pass after retry');
  });

  it('filters excluded workflows', () => {
    const candidates = generateEvalCandidates(
      [makeSignal({ workflowId: 'segment_qa' }), makeSignal({ workflowId: 'annotation_qa' })],
      { excludedWorkflows: ['annotation_qa'] },
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.workflowId).toBe('segment_qa');
  });
});

describe('validateEvalCandidate', () => {
  it('passes for valid candidate', () => {
    const result = validateEvalCandidate({
      requestId: 'req-001',
      source: 'thumbs_up',
      expectedBehavior: 'Quality bar met',
    });
    expect(result.valid).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it('fails for missing requestId', () => {
    const result = validateEvalCandidate({
      requestId: '',
      source: 'thumbs_up',
      expectedBehavior: 'Quality bar met',
    });
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes('requestId'))).toBe(true);
  });

  it('requires failureCategory for negative signals', () => {
    const result = validateEvalCandidate({
      requestId: 'req-001',
      source: 'thumbs_down',
      expectedBehavior: 'Fix needed',
    });
    expect(result.valid).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([expect.stringContaining('Failure category')]),
    );
  });
});
