import { describe, expect, it } from 'vitest';
import { computeTextOnlyZoomPxPerDocSec, documentTimeFromTextOnlyTrackX } from './textOnlyTimelineTimeMapping';

describe('textOnlyTimelineTimeMapping', () => {
  it('uses linear document mapping when timeMapping is absent (identity)', () => {
    const w = 800;
    const L = 20;
    expect(documentTimeFromTextOnlyTrackX(0, w, L, undefined)).toBeCloseTo(0);
    expect(documentTimeFromTextOnlyTrackX(w, w, L, undefined)).toBeCloseTo(L);
    expect(documentTimeFromTextOnlyTrackX(w / 2, w, L, undefined)).toBeCloseTo(10);
    expect(computeTextOnlyZoomPxPerDocSec(w, L, undefined)).toBeCloseTo(w / L);
  });

  it('maps track X through real span then inverts when scale is not 1', () => {
    const w = 100;
    const L = 10;
    const mapping = { offsetSec: 0, scale: 2 };
    // doc 0..10 → real 0..20, linear on track
    expect(documentTimeFromTextOnlyTrackX(0, w, L, mapping)).toBeCloseTo(0);
    expect(documentTimeFromTextOnlyTrackX(w, w, L, mapping)).toBeCloseTo(10);
    expect(documentTimeFromTextOnlyTrackX(w / 2, w, L, mapping)).toBeCloseTo(5);
    // px per doc sec = w * scale / realSpan = 100*2/20 = 10
    expect(computeTextOnlyZoomPxPerDocSec(w, L, mapping)).toBeCloseTo(10);
  });

  it('respects offset in preview clamp then invert', () => {
    const w = 100;
    const L = 10;
    const mapping = { offsetSec: 5, scale: 1 };
    expect(documentTimeFromTextOnlyTrackX(0, w, L, mapping)).toBeCloseTo(0);
    expect(documentTimeFromTextOnlyTrackX(w, w, L, mapping)).toBeCloseTo(10);
  });

  it('keeps legacy negative-offset mapping inversion deterministic at x=0', () => {
    const w = 100;
    const L = 10;
    const mapping = { offsetSec: -3, scale: 1 };
    expect(documentTimeFromTextOnlyTrackX(0, w, L, mapping)).toBeCloseTo(3);
  });
});
