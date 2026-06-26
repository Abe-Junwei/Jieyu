import { describe, expect, it } from 'vitest';
import { docSecRangeToContentPx } from './viewportFrameToScreenRange';

describe('docSecRangeToContentPx', () => {
  it('maps doc seconds to content pixels with tier-primary scroll', () => {
    expect(docSecRangeToContentPx(10, 20, { pxPerDocSec: 50, scrollLeftPx: 200 })).toEqual({
      leftPx: 300,
      widthPx: 500,
    });
  });

  it('uses waveform scroll when tier scroll matches media-only layout', () => {
    expect(docSecRangeToContentPx(2, 4, { pxPerDocSec: 20, scrollLeftPx: 40 })).toEqual({
      leftPx: 0,
      widthPx: 40,
    });
  });

  it('returns zero width for invalid pxPerDocSec', () => {
    expect(docSecRangeToContentPx(1, 2, { pxPerDocSec: 0, scrollLeftPx: 0 })).toEqual({
      leftPx: 0,
      widthPx: 0,
    });
  });
});
