import { describe, expect, it } from 'vitest';
import {
  buildTimeRulerTicks,
  resolveTimeRulerPxPerSec,
  resolveTimeRulerSpanSec,
} from './timeRulerTicks';

describe('resolveTimeRulerSpanSec', () => {
  it('uses document span when it exceeds media duration', () => {
    expect(resolveTimeRulerSpanSec(60, 120)).toBe(120);
  });

  it('spans full media when it is longer than the document axis (full waveform visible)', () => {
    expect(resolveTimeRulerSpanSec(6700, 1800)).toBe(6700);
  });

  it('falls back to media when document span is missing', () => {
    expect(resolveTimeRulerSpanSec(90, 0)).toBe(90);
  });
});

describe('resolveTimeRulerPxPerSec', () => {
  it('derives density from visible window width instead of stale zoom', () => {
    expect(
      resolveTimeRulerPxPerSec({
        zoomPxPerSec: 40,
        windowSec: 1800,
        viewWidthPx: 2000,
      }),
    ).toBeCloseTo(2000 / 1800, 5);
  });

  it('falls back to zoom when window width is unknown', () => {
    expect(
      resolveTimeRulerPxPerSec({
        zoomPxPerSec: 12,
        windowSec: 0,
        viewWidthPx: 0,
      }),
    ).toBe(12);
  });
});

describe('buildTimeRulerTicks', () => {
  it('generates ticks through document-only windows past media end', () => {
    const ticks = buildTimeRulerTicks({
      start: 70,
      end: 90,
      timelineSpanSec: 120,
      minorStep: 5,
      majorStep: 10,
    });
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks[0]?.time).toBeGreaterThanOrEqual(70);
    expect(ticks.at(-1)?.time).toBeLessThanOrEqual(90);
  });

  it('does not stop at media duration when window extends beyond it', () => {
    const ticks = buildTimeRulerTicks({
      start: 55,
      end: 75,
      timelineSpanSec: 120,
      minorStep: 5,
      majorStep: 10,
    });
    const beyondMedia = ticks.filter((tick) => tick.time > 60);
    expect(beyondMedia.length).toBeGreaterThan(0);
  });
});
