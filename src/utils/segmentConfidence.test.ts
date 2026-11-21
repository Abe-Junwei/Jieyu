import { describe, expect, it } from 'vitest';
import { segmentConfidenceClass, storedSegmentConfidence } from './segmentConfidence';

describe('segmentConfidenceClass', () => {
  it('colors a stored confidence and leaves a missing one unmarked', () => {
    expect(segmentConfidenceClass(undefined)).toBe('');
    expect(segmentConfidenceClass(Number.NaN)).toBe('');
    expect(segmentConfidenceClass(0.49)).toBe('timeline-annotation-confidence-low');
    expect(segmentConfidenceClass(0.5)).toBe('timeline-annotation-confidence-mid');
    expect(segmentConfidenceClass(0.74)).toBe('timeline-annotation-confidence-mid');
    expect(segmentConfidenceClass(0.75)).toBe('timeline-annotation-confidence-high');
  });

  it('keeps only a finite confidence from 0 through 1', () => {
    expect(storedSegmentConfidence(0)).toBe(0);
    expect(storedSegmentConfidence(1)).toBe(1);
    expect(storedSegmentConfidence(1.1)).toBeNull();
    expect(storedSegmentConfidence(-0.1)).toBeNull();
    expect(storedSegmentConfidence(undefined)).toBeNull();
  });
});
