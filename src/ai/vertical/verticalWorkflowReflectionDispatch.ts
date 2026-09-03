import type { EvidencePacketV0 } from './evidencePacket';
import { runAnnotationQaReflection } from './annotationQaReflection';
import { runLexemeCandidatesReflection } from './lexemeCandidatesReflection';
import { runSegmentQaReflection } from './segmentQaReflection';
import { runElanFlexCompatibilityReflection } from './elanFlexCompatibilityWorkflow';
import type { ComposedReflectionRetryBlob } from './composedWorkflowTemplates';
import { getVerticalWorkflowV0, type VerticalWorkflowId } from './verticalWorkflowRegistry';

export type VerticalReflectionHandlerId = VerticalWorkflowId;

export interface VerticalReflectionView {
  reflectionFlagged: boolean;
  checks: { name: string; passed: boolean }[];
  summary: string;
}

export interface VerticalReflectionDispatchResult {
  reflection: VerticalReflectionView;
  auditField: string;
  retryBlob?: ComposedReflectionRetryBlob;
}

const AUDIT_FIELD_BY_HANDLER: Record<VerticalReflectionHandlerId, string> = {
  segment_qa: 'ai_segment_qa_reflection',
  annotation_qa: 'ai_annotation_qa_reflection',
  lexeme_candidates: 'ai_lexeme_candidates_reflection',
  elan_flex_compatibility: 'ai_elan_flex_compatibility_reflection',
};

function toView(result: {
  reflectionFlagged: boolean;
  checks: { name: string; passed: boolean }[];
  summary: string;
}): VerticalReflectionView {
  return {
    reflectionFlagged: result.reflectionFlagged,
    checks: result.checks.map((check) => ({ name: check.name, passed: check.passed })),
    summary: result.summary,
  };
}

function runHandler(
  handlerId: VerticalReflectionHandlerId,
  content: string,
  packets: ReadonlyArray<EvidencePacketV0>,
): VerticalReflectionDispatchResult {
  switch (handlerId) {
    case 'segment_qa': {
      const result = runSegmentQaReflection(content, packets);
      return {
        reflection: toView(result),
        auditField: AUDIT_FIELD_BY_HANDLER.segment_qa,
        ...(result.reflectionFlagged ? { retryBlob: { kind: 'segment_qa', result } } : {}),
      };
    }
    case 'annotation_qa': {
      const result = runAnnotationQaReflection(content, packets);
      return {
        reflection: toView(result),
        auditField: AUDIT_FIELD_BY_HANDLER.annotation_qa,
        ...(result.reflectionFlagged ? { retryBlob: { kind: 'annotation_qa', result } } : {}),
      };
    }
    case 'lexeme_candidates': {
      const result = runLexemeCandidatesReflection(content, packets);
      return {
        reflection: toView(result),
        auditField: AUDIT_FIELD_BY_HANDLER.lexeme_candidates,
        ...(result.reflectionFlagged ? { retryBlob: { kind: 'lexeme_candidates', result } } : {}),
      };
    }
    case 'elan_flex_compatibility': {
      const result = runElanFlexCompatibilityReflection(content, packets);
      return {
        reflection: toView(result),
        auditField: AUDIT_FIELD_BY_HANDLER.elan_flex_compatibility,
        ...(result.reflectionFlagged
          ? { retryBlob: { kind: 'elan_flex_compatibility', result } }
          : {}),
      };
    }
  }
}

/**
 * A12.5 — look up reflection from registry metadata instead of finalize if/else.
 */
export function dispatchVerticalWorkflowReflection(
  workflowId: VerticalWorkflowId,
  content: string,
  packets: ReadonlyArray<EvidencePacketV0>,
): VerticalReflectionDispatchResult | null {
  const workflow = getVerticalWorkflowV0(workflowId);
  const handlerId = workflow.reflectionHandlerId;
  if (!handlerId) return null;
  return runHandler(handlerId, content, packets);
}
