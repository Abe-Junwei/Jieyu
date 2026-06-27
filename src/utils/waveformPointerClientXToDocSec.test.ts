// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type WaveSurfer from 'wavesurfer.js';
import { resolveWaveformPointerClientXToDocSec } from './waveformPointerClientXToDocSec';

function makeWaveSurfer(input: {
  duration: number;
  scrollLeft?: number;
  scrollWidth?: number;
  viewportLeft?: number;
}): WaveSurfer {
  const scrollParent = document.createElement('div');
  Object.defineProperty(scrollParent, 'scrollLeft', {
    configurable: true,
    value: input.scrollLeft ?? 0,
    writable: true,
  });
  Object.defineProperty(scrollParent, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      left: input.viewportLeft ?? 0,
      top: 0,
      right: 800,
      bottom: 100,
      width: 800,
      height: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });
  const wrapper = document.createElement('div');
  Object.defineProperty(wrapper, 'scrollWidth', {
    configurable: true,
    value: input.scrollWidth ?? 800,
  });
  scrollParent.appendChild(wrapper);
  return {
    getDuration: () => input.duration,
    getWrapper: () => wrapper,
  } as unknown as WaveSurfer;
}

describe('resolveWaveformPointerClientXToDocSec', () => {
  it('uses tier scroll + pxPerDocSec when document span exceeds decoded media', () => {
    const ws = makeWaveSurfer({ duration: 60, scrollWidth: 600 });
    const time = resolveWaveformPointerClientXToDocSec({
      clientX: 150,
      viewportRectLeftPx: 0,
      ws,
      tierScrollLeftPx: 600,
      documentSpanSec: 120,
      pxPerDocSec: 10,
    });
    expect(time).toBeCloseTo(75, 5);
  });

  it('clamps extended-document mapping to document span', () => {
    const ws = makeWaveSurfer({ duration: 60 });
    const time = resolveWaveformPointerClientXToDocSec({
      clientX: 500,
      viewportRectLeftPx: 0,
      ws,
      tierScrollLeftPx: 1000,
      documentSpanSec: 120,
      pxPerDocSec: 10,
    });
    expect(time).toBe(120);
  });

  it('uses WaveSurfer layout when document span does not exceed media', () => {
    const ws = makeWaveSurfer({ duration: 60, scrollLeft: 200, scrollWidth: 600 });
    const time = resolveWaveformPointerClientXToDocSec({
      clientX: 100,
      viewportRectLeftPx: 0,
      ws,
      tierScrollLeftPx: 0,
      documentSpanSec: 60,
      pxPerDocSec: 10,
    });
    expect(time).toBeCloseTo(30, 5);
  });

  it('falls back to logical duration when decoded media duration is zero', () => {
    const ws = makeWaveSurfer({ duration: 0, scrollLeft: 0, scrollWidth: 800 });
    const time = resolveWaveformPointerClientXToDocSec({
      clientX: 400,
      viewportRectLeftPx: 0,
      ws,
      tierScrollLeftPx: 0,
      documentSpanSec: 100,
      pxPerDocSec: 10,
      logicalDurationSec: 100,
    });
    expect(time).toBeCloseTo(50, 5);
  });
});
