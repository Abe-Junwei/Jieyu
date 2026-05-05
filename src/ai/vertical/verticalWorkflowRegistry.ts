export type VerticalWorkflowInputScope = 'current_segment' | 'selection' | 'corpus_source_set' | 'project';
export type VerticalWorkflowOutputKind = 'answer' | 'qa_findings' | 'lexeme_candidates' | 'export_plan' | 'fieldwork_note';
export type VerticalWorkflowWriteMode = 'read_only' | 'propose_only' | 'confirm_required';

export interface VerticalWorkflowV0 {
  id: string;
  labelKey: string;
  inputScope: VerticalWorkflowInputScope;
  outputKind: VerticalWorkflowOutputKind;
  writeMode: VerticalWorkflowWriteMode;
  requiredCapabilities: readonly string[];
  evalSuiteId?: string;
}

export type VerticalWorkflowId = 'segment_qa' | 'annotation_qa' | 'lexeme_candidates';

export const VERTICAL_WORKFLOW_REGISTRY_V0: Record<VerticalWorkflowId, VerticalWorkflowV0> = {
  segment_qa: {
    id: 'segment_qa',
    labelKey: 'msg.ai.vertical.workflow.segmentQa',
    inputScope: 'current_segment',
    outputKind: 'answer',
    writeMode: 'read_only',
    requiredCapabilities: ['read.segment', 'read.layers', 'read.rag'],
    evalSuiteId: 'vertical.segment_qa.v0',
  },
  annotation_qa: {
    id: 'annotation_qa',
    labelKey: 'msg.ai.vertical.workflow.annotationQa',
    inputScope: 'selection',
    outputKind: 'qa_findings',
    writeMode: 'propose_only',
    requiredCapabilities: ['read.segment', 'read.layers', 'read.annotation', 'policy.confirmation'],
    evalSuiteId: 'vertical.annotation_qa.v0',
  },
  lexeme_candidates: {
    id: 'lexeme_candidates',
    labelKey: 'msg.ai.vertical.workflow.lexemeCandidates',
    inputScope: 'corpus_source_set',
    outputKind: 'lexeme_candidates',
    writeMode: 'propose_only',
    requiredCapabilities: ['read.lexeme', 'read.segment', 'read.rag', 'policy.confirmation'],
    evalSuiteId: 'vertical.lexeme_candidates.v0',
  },
};

export function listVerticalWorkflowsV0(): ReadonlyArray<VerticalWorkflowV0> {
  return Object.values(VERTICAL_WORKFLOW_REGISTRY_V0);
}

export function getVerticalWorkflowV0(workflowId: VerticalWorkflowId): VerticalWorkflowV0 {
  return VERTICAL_WORKFLOW_REGISTRY_V0[workflowId];
}
