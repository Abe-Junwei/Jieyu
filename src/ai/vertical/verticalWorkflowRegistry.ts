import type { WorkflowStepKind } from './workflowStepKinds';

export type VerticalWorkflowInputScope =
  | 'current_segment'
  | 'selection'
  | 'corpus_source_set'
  | 'project';
export type VerticalWorkflowOutputKind =
  | 'answer'
  | 'qa_findings'
  | 'lexeme_candidates'
  | 'export_plan'
  | 'fieldwork_note'
  | 'compatibility_report';
export type VerticalWorkflowWriteMode = 'read_only' | 'propose_only' | 'confirm_required';

export type VerticalWorkflowOutputSchemaId = 'envelope_v0';

export type VerticalWorkflowId =
  | 'segment_qa'
  | 'annotation_qa'
  | 'lexeme_candidates'
  | 'elan_flex_compatibility';

export interface VerticalWorkflowV0 {
  id: string;
  labelKey: string;
  inputScope: VerticalWorkflowInputScope;
  outputKind: VerticalWorkflowOutputKind;
  writeMode: VerticalWorkflowWriteMode;
  requiredCapabilities: readonly string[];
  evalSuiteId?: string;
  /** A12.1 — declared step kinds for this vertical (usually a single llm). */
  stepKinds: readonly WorkflowStepKind[];
  /** A12.2 / A12.5 — lookup key for reflection dispatch. */
  reflectionHandlerId?: VerticalWorkflowId;
  /** A12.2 — composed reflection retry cap (existing runtime uses 1). */
  maxReflectionRetries: number;
  /** A12.2 — Zod schema id (table in verticalWorkflowOutputSchemas). */
  outputSchemaId: VerticalWorkflowOutputSchemaId;
}

const LLM_ONLY_STEPS = ['llm'] as const satisfies readonly WorkflowStepKind[];

export const VERTICAL_WORKFLOW_REGISTRY_V0: Record<VerticalWorkflowId, VerticalWorkflowV0> = {
  segment_qa: {
    id: 'segment_qa',
    labelKey: 'msg.ai.vertical.workflow.segmentQa',
    inputScope: 'current_segment',
    outputKind: 'answer',
    writeMode: 'read_only',
    requiredCapabilities: ['read.segment', 'read.layers', 'read.rag'],
    evalSuiteId: 'vertical.segment_qa.v0',
    stepKinds: LLM_ONLY_STEPS,
    reflectionHandlerId: 'segment_qa',
    maxReflectionRetries: 1,
    outputSchemaId: 'envelope_v0',
  },
  annotation_qa: {
    id: 'annotation_qa',
    labelKey: 'msg.ai.vertical.workflow.annotationQa',
    inputScope: 'selection',
    outputKind: 'qa_findings',
    writeMode: 'propose_only',
    requiredCapabilities: ['read.segment', 'read.layers', 'read.annotation', 'policy.confirmation'],
    evalSuiteId: 'vertical.annotation_qa.v0',
    stepKinds: LLM_ONLY_STEPS,
    reflectionHandlerId: 'annotation_qa',
    maxReflectionRetries: 1,
    outputSchemaId: 'envelope_v0',
  },
  lexeme_candidates: {
    id: 'lexeme_candidates',
    labelKey: 'msg.ai.vertical.workflow.lexemeCandidates',
    inputScope: 'corpus_source_set',
    outputKind: 'lexeme_candidates',
    writeMode: 'propose_only',
    requiredCapabilities: ['read.lexeme', 'read.segment', 'read.rag', 'policy.confirmation'],
    evalSuiteId: 'vertical.lexeme_candidates.v0',
    stepKinds: LLM_ONLY_STEPS,
    reflectionHandlerId: 'lexeme_candidates',
    maxReflectionRetries: 1,
    outputSchemaId: 'envelope_v0',
  },
  elan_flex_compatibility: {
    id: 'elan_flex_compatibility',
    labelKey: 'msg.ai.vertical.workflow.elanFlexCompatibility',
    inputScope: 'project',
    outputKind: 'compatibility_report',
    writeMode: 'read_only',
    requiredCapabilities: ['read.segment', 'read.layers', 'read.lexeme', 'read.annotation'],
    evalSuiteId: 'vertical.elan_flex_compatibility.v0',
    stepKinds: LLM_ONLY_STEPS,
    reflectionHandlerId: 'elan_flex_compatibility',
    maxReflectionRetries: 1,
    outputSchemaId: 'envelope_v0',
  },
};

export function listVerticalWorkflowsV0(): ReadonlyArray<VerticalWorkflowV0> {
  return Object.values(VERTICAL_WORKFLOW_REGISTRY_V0);
}

export function getVerticalWorkflowV0(workflowId: VerticalWorkflowId): VerticalWorkflowV0 {
  return VERTICAL_WORKFLOW_REGISTRY_V0[workflowId];
}
