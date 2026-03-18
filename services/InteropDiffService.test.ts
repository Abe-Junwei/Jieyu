import { describe, expect, it } from 'vitest';
import { createInteropDiffReport } from './InteropDiffService';

describe('InteropDiffService', () => {
  it('reports no diff for equivalent segments', () => {
    const before = [
      { startTime: 0, endTime: 1, text: 'A' },
      { startTime: 1, endTime: 2, text: 'B' },
    ];
    const after = [
      { startTime: 0, endTime: 1, text: 'A' },
      { startTime: 1, endTime: 2, text: 'B' },
    ];

    const report = createInteropDiffReport(before, after);
    expect(report.summary.changed).toBe(0);
    expect(report.summary.missing).toBe(0);
    expect(report.summary.added).toBe(0);
    expect(report.items).toHaveLength(0);
  });

  it('detects changed text and missing/added rows', () => {
    const before = [
      { startTime: 0, endTime: 1, text: 'A' },
      { startTime: 1, endTime: 2, text: 'B' },
    ];
    const after = [
      { startTime: 0, endTime: 1, text: 'A1' },
      { startTime: 2, endTime: 3, text: 'C' },
    ];

    const report = createInteropDiffReport(before, after);
    expect(report.summary.changed).toBe(2);
    expect(report.summary.missing).toBe(0);
    expect(report.summary.added).toBe(0);
  });
});
