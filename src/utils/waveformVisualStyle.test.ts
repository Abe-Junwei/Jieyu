import { describe, expect, it } from 'vitest';
import { getWaveformVisualStylePreset, isWaveformVisualStyle } from './waveformVisualStyle';

describe('waveformVisualStyle', () => {
  it('validates known presets', () => {
    expect(isWaveformVisualStyle('balanced')).toBe(true);
    expect(isWaveformVisualStyle('dense')).toBe(true);
    expect(isWaveformVisualStyle('line')).toBe(true);
    expect(isWaveformVisualStyle('other')).toBe(false);
  });

  it('returns distinct bar geometry per style', () => {
    const balanced = getWaveformVisualStylePreset('balanced');
    const dense = getWaveformVisualStylePreset('dense');
    const line = getWaveformVisualStylePreset('line');
    expect(balanced.barWidth).toBe(2);
    expect(dense.barWidth).toBe(1);
    expect(line.barWidth).toBe(0);
    expect(balanced.waveColor).not.toBe(dense.waveColor);
  });

  it('defaults undefined to balanced preset', () => {
    const p = getWaveformVisualStylePreset(undefined);
    expect(p.barWidth).toBe(2);
  });
});
