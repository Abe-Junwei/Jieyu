/**
 * A12.1 — workflow step kinds (LangGraph/ADK-shaped labels, no graph runtime).
 */

export const WORKFLOW_STEP_KINDS = ['llm', 'tool', 'gate', 'parallel_readonly'] as const;

export type WorkflowStepKind = (typeof WORKFLOW_STEP_KINDS)[number];

export function isWorkflowStepKind(value: string): value is WorkflowStepKind {
  return (WORKFLOW_STEP_KINDS as readonly string[]).includes(value);
}

export function isParallelReadonlyStepKind(kind: WorkflowStepKind): boolean {
  return kind === 'parallel_readonly';
}

export function assertStepKindsAlignWithSteps(
  stepsLength: number,
  stepKinds: readonly WorkflowStepKind[],
): void {
  if (stepKinds.length !== stepsLength) {
    throw new Error(
      `Composed workflow stepKinds length ${stepKinds.length} must match steps length ${stepsLength}`,
    );
  }
}
