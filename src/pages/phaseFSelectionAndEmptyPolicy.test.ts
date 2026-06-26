import { describe, expect, it } from 'vitest';
import { TIMELINE_PARITY_MATRIX, TIMELINE_PARITY_MATRIX_VERSION } from './timelineParityMatrix';

describe('phaseFSelectionAndEmptyPolicyParity', () => {
  it('locks matrix version for phase F selection + empty policy drift', () => {
    expect(TIMELINE_PARITY_MATRIX_VERSION).toBe(34);
  });

  it('declares selection-write-funnel row with applyTimelineSelectionCommand anchor', () => {
    const row = TIMELINE_PARITY_MATRIX.find((r) => r.id === 'selection-write-funnel');
    expect(row, 'matrix row selection-write-funnel').toBeDefined();
    if (!row) return;
    expect(row.parity.waveform).toBe('full');
    expect(row.parity.textOnly).toBe('full');
    expect(row.testAnchors).toContain('src/utils/applyTimelineSelectionCommand.test.ts');
    expect(row.testAnchors).toContain('src/utils/timelineSelectionProjection.test.ts');
    expect(row.testAnchors).toContain('src/pages/timelineReadModel.test.ts');
  });

  it('declares empty-timeline-policy row with EmptyTimelinePolicy anchor', () => {
    const row = TIMELINE_PARITY_MATRIX.find((r) => r.id === 'empty-timeline-policy');
    expect(row, 'matrix row empty-timeline-policy').toBeDefined();
    if (!row) return;
    expect(row.parity.waveform).toBe('full');
    expect(row.parity.textOnly).toBe('full');
    expect(row.testAnchors).toContain('src/utils/emptyTimelinePolicy.test.ts');
    expect(row.testAnchors).toContain('src/pages/TranscriptionPage.TimelineEmptyState.test.tsx');
    expect(row.testAnchors).toContain(
      'src/pages/useTranscriptionTimelineContentViewModel.test.tsx',
    );
  });
});
