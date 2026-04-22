import { describe, expect, it } from 'vitest';
import { viewportFrameToDocRange } from './viewportFrameToDocRange';

describe('viewportFrameToDocRange', () => {
  it('converts px range to doc-second range', () => {
    expect(viewportFrameToDocRange({ pxPerDocSec: 50 }, 100, 200)).toEqual({
      startSec: 2,
      endSec: 6,
    });
  });

  it('clamps invalid width and fallback invalid left to zero', () => {
    expect(viewportFrameToDocRange({ pxPerDocSec: 20 }, Number.NaN, -10)).toEqual({
      startSec: 0,
      endSec: 0,
    });
  });

  it('returns zero range when pxPerDocSec is invalid', () => {
    expect(viewportFrameToDocRange({ pxPerDocSec: 0 }, 100, 200)).toEqual({
      startSec: 0,
      endSec: 0,
    });
    expect(viewportFrameToDocRange({ pxPerDocSec: Number.NaN }, 100, 200)).toEqual({
      startSec: 0,
      endSec: 0,
    });
  });
});
