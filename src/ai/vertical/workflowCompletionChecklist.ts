import type { EvidencePacketV0 } from './evidencePacket';
import type { VerticalWorkflowId } from './verticalWorkflowRegistry';
import type { VerticalWorkflowOutputEnvelopeV0 } from './verticalWorkflowSelection';

export type WorkflowCompletionStepId =
  | 'workflow_resolved'
  | 'evidence_packets_ready'
  | 'write_mode_honored'
  | 'reflection_passed'
  | 'envelope_status_set';

export interface WorkflowCompletionChecklistInput {
  workflowId: VerticalWorkflowId;
  evidencePackets: ReadonlyArray<EvidencePacketV0>;
  reflectionFlagged?: boolean;
  writeMode?: 'read_only' | 'propose_only' | 'confirm_required';
}

export interface WorkflowCompletionChecklistResult {
  complete: boolean;
  openSteps: WorkflowCompletionStepId[];
  satisfiedSteps: WorkflowCompletionStepId[];
}

const WORKFLOW_CHECKLIST_STEPS: Record<VerticalWorkflowId, readonly WorkflowCompletionStepId[]> = {
  segment_qa: [
    'workflow_resolved',
    'evidence_packets_ready',
    'write_mode_honored',
    'envelope_status_set',
  ],
  annotation_qa: [
    'workflow_resolved',
    'evidence_packets_ready',
    'reflection_passed',
    'write_mode_honored',
    'envelope_status_set',
  ],
  lexeme_candidates: [
    'workflow_resolved',
    'evidence_packets_ready',
    'reflection_passed',
    'write_mode_honored',
    'envelope_status_set',
  ],
  elan_flex_compatibility: [
    'workflow_resolved',
    'evidence_packets_ready',
    'reflection_passed',
    'write_mode_honored',
    'envelope_status_set',
  ],
};

function isStepSatisfied(
  step: WorkflowCompletionStepId,
  input: WorkflowCompletionChecklistInput,
): boolean {
  switch (step) {
    case 'workflow_resolved':
      return Boolean(input.workflowId);
    case 'evidence_packets_ready':
      return input.evidencePackets.length > 0;
    case 'write_mode_honored':
      return input.writeMode !== 'confirm_required' || input.evidencePackets.length > 0;
    case 'reflection_passed':
      return input.reflectionFlagged !== true;
    case 'envelope_status_set':
      return true;
    default:
      return false;
  }
}

export function evaluateWorkflowCompletionChecklist(
  input: WorkflowCompletionChecklistInput,
): WorkflowCompletionChecklistResult {
  const steps = WORKFLOW_CHECKLIST_STEPS[input.workflowId];
  const satisfiedSteps = steps.filter((step) => isStepSatisfied(step, input));
  const openSteps = steps.filter((step) => !isStepSatisfied(step, input));
  return {
    complete: openSteps.length === 0,
    openSteps,
    satisfiedSteps,
  };
}

/** A12: workflow answer must not be marked ready until checklist is closed. */
export function canMarkWorkflowAnswerReady(
  envelope: Pick<
    VerticalWorkflowOutputEnvelopeV0,
    'workflowId' | 'evidencePackets' | 'writeMode' | 'status'
  >,
  options?: { reflectionFlagged?: boolean },
): boolean {
  const checklist = evaluateWorkflowCompletionChecklist({
    workflowId: envelope.workflowId,
    evidencePackets: envelope.evidencePackets,
    writeMode: envelope.writeMode,
    ...(options?.reflectionFlagged !== undefined
      ? { reflectionFlagged: options.reflectionFlagged }
      : {}),
  });
  return checklist.complete;
}
