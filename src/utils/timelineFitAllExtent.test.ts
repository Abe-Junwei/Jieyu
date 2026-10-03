import { describe, expect, it } from 'vitest';
import { resolveAnnotationExtent, resolveExtentFitZoomPercent } from './timelineFitAllExtent';

describe('timeline fit-all extent', () => {
  it('frames the annotated interval instead of an empty 30 minute canvas', () => {
    const extent = resolveAnnotationExtent([
      { startTime: 1, endTime: 2.5 },
      { startTime: 1.2, endTime: 4 },
      { startTime: 12, endTime: 12 },
    ]);
    expect(extent).toEqual({ start: 1, end: 4 });
    expect(resolveExtentFitZoomPercent({ fitSpanSec: 1800, extentSec: 3, fill: 0.9 })).toBe(54000);
  });

  it('returns null when nothing has a duration', () => {
    expect(resolveAnnotationExtent([{ startTime: 0, endTime: 0 }])).toBeNull();
  });
});
