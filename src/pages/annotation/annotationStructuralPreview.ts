import type { StructuralRuleProfilePreview } from '../../services/LinguisticService.structuralProfiles';
import type { AnnotationAnalysisGraphFixture, ProjectionDiagnostic } from '../../annotation/analysisGraph';

export type AnnotationStructuralPreviewViewModel = {
  candidateGraph: AnnotationAnalysisGraphFixture;
  segments: Array<{ id: string; text: string; kind: string }>;
  boundaries: Array<{ type: string; marker: string; offset: number }>;
  warnings: Array<{ type: string; message: string; severity: string }>;
  diagnostics: ProjectionDiagnostic[];
  canConfirmWithoutReview: boolean;
};

export function buildAnnotationStructuralPreviewViewModel(
  preview: StructuralRuleProfilePreview,
): AnnotationStructuralPreviewViewModel {
  const diagnostics = preview.candidateGraph.projectionDiagnostics;
  const blockingDiagnostic = diagnostics.some((diagnostic) => (
    diagnostic.status === 'needsReview' || diagnostic.status === 'unsupported'
  ));
  const blockingWarning = preview.parseResult.warnings.some((warning) => warning.severity === 'warning');

  return {
    candidateGraph: preview.candidateGraph,
    segments: preview.parseResult.segments.map((segment) => ({
      id: segment.id,
      text: segment.text,
      kind: segment.kind,
    })),
    boundaries: preview.parseResult.boundaries.map((boundary) => ({
      type: boundary.type,
      marker: boundary.marker,
      offset: boundary.offset,
    })),
    warnings: preview.parseResult.warnings.map((warning) => ({
      type: warning.type,
      message: warning.message,
      severity: warning.severity,
    })),
    diagnostics,
    canConfirmWithoutReview: !blockingDiagnostic && !blockingWarning,
  };
}
