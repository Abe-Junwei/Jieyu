import { describe, expect, it } from 'vitest';
import { getWaveformDisplayHeights, isWaveformDisplayMode } from './waveformDisplayMode';

describe('waveformDisplayMode', () => {
  it('narrows union to known literals', () => {
    expect(isWaveformDisplayMode('waveform')).toBe(true);
    expect(isWaveformDisplayMode('spectrogram')).toBe(true);
    expect(isWaveformDisplayMode('split')).toBe(true);
    expect(isWaveformDisplayMode('unknown')).toBe(false);
  });

  it('uses full height for non-split modes', () => {
    expect(getWaveformDisplayHeights(200, 'waveform')).toEqual({
      waveformPrimaryHeight: 200,
      spectrogramHeight: 200,
    });
  });

  it('splits height with gap and floors for split mode', () => {
    const h = getWaveformDisplayHeights(400, 'split');
    expect(h.waveformPrimaryHeight + h.spectrogramHeight + 6).toBeGreaterThanOrEqual(400 - 1);
    expect(h.waveformPrimaryHeight).toBeGreaterThanOrEqual(56);
    expect(h.spectrogramHeight).toBeGreaterThanOrEqual(58);
  });
});
