import { describe, expect, it } from 'vitest';
import {
  WORKFLOW_STEP_KINDS,
  assertStepKindsAlignWithSteps,
  isParallelReadonlyStepKind,
  isWorkflowStepKind,
} from './workflowStepKinds';

describe('workflowStepKinds', () => {
  it('declares llm / tool / gate / parallel_readonly', () => {
    expect([...WORKFLOW_STEP_KINDS]).toEqual(['llm', 'tool', 'gate', 'parallel_readonly']);
  });

  it('narrows known kinds', () => {
    expect(isWorkflowStepKind('llm')).toBe(true);
    expect(isWorkflowStepKind('parallel_readonly')).toBe(true);
    expect(isWorkflowStepKind('graph')).toBe(false);
    expect(isParallelReadonlyStepKind('parallel_readonly')).toBe(true);
    expect(isParallelReadonlyStepKind('llm')).toBe(false);
  });

  it('asserts stepKinds length matches steps length', () => {
    expect(() => assertStepKindsAlignWithSteps(2, ['llm', 'llm'])).not.toThrow();
    expect(() => assertStepKindsAlignWithSteps(2, ['llm'])).toThrow(/must match steps length/);
  });
});
