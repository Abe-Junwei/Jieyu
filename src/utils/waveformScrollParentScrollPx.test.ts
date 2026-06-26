/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { readWaveformScrollParentScrollLeftPx } from './waveformScrollParentScrollPx';

describe('readWaveformScrollParentScrollLeftPx', () => {
  it('reads scrollLeft from the WaveSurfer scroll parent element', () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'scrollLeft', { value: 42, writable: true, configurable: true });
    expect(readWaveformScrollParentScrollLeftPx(el)).toBe(42);
    el.scrollLeft = 128;
    expect(readWaveformScrollParentScrollLeftPx(el)).toBe(128);
  });
});
