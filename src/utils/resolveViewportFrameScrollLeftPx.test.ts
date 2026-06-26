import { describe, expect, it } from 'vitest';
import { resolveViewportFrameScrollLeftPx } from './resolveViewportFrameScrollLeftPx';

describe('resolveViewportFrameScrollLeftPx', () => {
  it('uses tier scroll when document span exceeds media duration', () => {
    expect(
      resolveViewportFrameScrollLeftPx({
        documentSpanSec: 200,
        mediaDurSec: 100,
        tierScrollLeftPx: 48,
        waveformScrollLeftPx: 12,
      }),
    ).toBe(48);
  });

  it('uses waveform scroll when media duration is at least document span', () => {
    expect(
      resolveViewportFrameScrollLeftPx({
        documentSpanSec: 80,
        mediaDurSec: 120,
        tierScrollLeftPx: 48,
        waveformScrollLeftPx: 12,
      }),
    ).toBe(12);
  });
});
