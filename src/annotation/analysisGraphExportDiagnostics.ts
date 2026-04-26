import type { AnnotationAnalysisGraphFixture, AnalysisGraphProjectionTarget, ProjectionDiagnostic } from './analysisGraph';
import { summarizeProjectionDiagnostics } from './analysisGraph';

export type AnalysisGraphExportDiagnosticReport = {
  target: AnalysisGraphProjectionTarget;
  complete: ProjectionDiagnostic[];
  degraded: ProjectionDiagnostic[];
  needsReview: ProjectionDiagnostic[];
  unsupported: ProjectionDiagnostic[];
  canExport: boolean;
  summaryText: string;
};

export function buildAnalysisGraphExportDiagnosticReport(
  graph: AnnotationAnalysisGraphFixture,
  target: AnalysisGraphProjectionTarget,
): AnalysisGraphExportDiagnosticReport {
  const diagnostics = graph.projectionDiagnostics.filter((diagnostic) => diagnostic.target === target);
  const effectiveDiagnostics = diagnostics.length > 0
    ? diagnostics
    : [{
      target,
      status: 'unsupported' as const,
      message: `No projection diagnostic was produced for ${target}.`,
    }];
  const complete = effectiveDiagnostics.filter((diagnostic) => diagnostic.status === 'complete');
  const degraded = effectiveDiagnostics.filter((diagnostic) => diagnostic.status === 'degraded');
  const needsReview = effectiveDiagnostics.filter((diagnostic) => diagnostic.status === 'needsReview');
  const unsupported = effectiveDiagnostics.filter((diagnostic) => diagnostic.status === 'unsupported');
  const summary = summarizeProjectionDiagnostics(effectiveDiagnostics);
  const canExport = unsupported.length === 0 && needsReview.length === 0;
  const summaryText = canExport
    ? `${target} export is available (${complete.length} complete, ${degraded.length} degraded).`
    : `${target} export needs review (${summary.blockingCount} blocking diagnostic(s)).`;

  return {
    target,
    complete,
    degraded,
    needsReview,
    unsupported,
    canExport,
    summaryText,
  };
}
