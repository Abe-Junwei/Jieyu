import type { UnitRelationDocType } from '../../db';
import { submitAnalysisGraphCandidate } from '../../annotation/analysisGraphConfirmation';
import { LinguisticStructuralProfileService } from '../../services/LinguisticService.structuralProfiles';
import {
  buildAnnotationStructuralPreviewViewModel,
  type AnnotationStructuralPreviewViewModel,
} from './annotationStructuralPreview';

export type PreviewAnnotationStructuralCandidateInput = {
  languageId?: string;
  projectId?: string;
  glossText: string;
  text?: string;
};

export type ConfirmAnnotationStructuralCandidateInput = {
  textId: string;
  unitId: string;
  preview: AnnotationStructuralPreviewViewModel;
  actorId?: string;
  allowNeedsReview?: boolean;
};

export async function previewAnnotationStructuralCandidate(
  input: PreviewAnnotationStructuralCandidateInput,
): Promise<AnnotationStructuralPreviewViewModel> {
  const preview = await LinguisticStructuralProfileService.previewStructuralRuleProfile({
    ...(input.languageId ? { languageId: input.languageId } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
    glossText: input.glossText,
    ...(input.text ? { text: input.text } : {}),
  });
  return buildAnnotationStructuralPreviewViewModel(preview);
}

export async function confirmAnnotationStructuralCandidate(
  input: ConfirmAnnotationStructuralCandidateInput,
): Promise<UnitRelationDocType> {
  if (!input.preview.canConfirmWithoutReview && input.allowNeedsReview !== true) {
    throw new Error('Structural analysis candidate needs review before confirmation.');
  }

  return submitAnalysisGraphCandidate({
    textId: input.textId,
    unitId: input.unitId,
    candidateGraph: input.preview.candidateGraph,
    ...(input.actorId ? { actor: { type: 'human', id: input.actorId } } : {}),
  });
}
