import { describe, expect, it } from 'vitest';
import { annotationAnalysisGraphFixtures } from './annotationAnalysisGraphFixtures';
import { buildAnalysisGraphExportDiagnosticReport } from './analysisGraphExportDiagnostics';

describe('analysisGraph export diagnostics', () => {
  it('allows export when diagnostics are complete or degraded', () => {
    const report = buildAnalysisGraphExportDiagnosticReport(annotationAnalysisGraphFixtures[0]!, 'conllu');

    expect(report.canExport).toBe(true);
    expect(report.degraded).toHaveLength(1);
    expect(report.summaryText).toContain('export is available');
  });

  it('blocks export when target diagnostics need review', () => {
    const fixture = {
      ...annotationAnalysisGraphFixtures[0]!,
      projectionDiagnostics: [
        { target: 'conllu' as const, status: 'needsReview' as const, message: 'review required' },
      ],
    };
    const report = buildAnalysisGraphExportDiagnosticReport(fixture, 'conllu');

    expect(report.canExport).toBe(false);
    expect(report.needsReview).toHaveLength(1);
    expect(report.summaryText).toContain('needs review');
  });

  it('treats missing target diagnostics as unsupported evidence', () => {
    const report = buildAnalysisGraphExportDiagnosticReport(annotationAnalysisGraphFixtures[0]!, 'elan');

    expect(report.canExport).toBe(false);
    expect(report.unsupported).toHaveLength(1);
    expect(report.unsupported[0]?.message).toContain('No projection diagnostic');
  });
});
