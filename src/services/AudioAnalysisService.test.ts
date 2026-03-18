import { describe, it, expect } from 'vitest';
import { findNearestZeroCrossing, snapToZeroCrossing } from './AudioAnalysisService';

// ── Test AudioBuffer mock ────────────────────────────────────

function makeAudioBuffer(samples: number[], sampleRate = 1000): AudioBuffer {
  const float32 = new Float32Array(samples);
  return {
    sampleRate,
    length: float32.length,
    duration: float32.length / sampleRate,
    numberOfChannels: 1,
    getChannelData: (channel: number) => {
      if (channel !== 0) throw new Error('only mono supported');
      return float32;
    },
    copyFromChannel: () => {},
    copyToChannel: () => {},
  } as unknown as AudioBuffer;
}

// ── findNearestZeroCrossing ──────────────────────────────────

describe('findNearestZeroCrossing', () => {
  it('returns the nearest crossing index to the target', () => {
    // samples: [1, -1, 1, -1] → crossings at indices 0→1, 1→2, 2→3
    const buf = makeAudioBuffer([1, -1, 1, -1], 1000);
    // Target 0.001s = sample 1; crossing at index 1 (dist=0) is closest
    const result = findNearestZeroCrossing(buf, 0.001, 5);
    expect(result).toBeCloseTo(0.001, 3); // index 1 / 1000
  });

  it('snaps to the nearest zero crossing within the window', () => {
    // +1 +1 +1 -1 +1 +1 +1
    // crossings at index 2→3 and 3→4
    const buf = makeAudioBuffer([1, 1, 1, -1, 1, 1, 1], 1000);
    const result = findNearestZeroCrossing(buf, 0.001, 5);
    // nearest crossing to sample 1 is at index 2 (2→3)
    expect(result).toBeCloseTo(0.002, 3);
  });

  it('returns original time when no crossing exists in window', () => {
    // All positive samples — no zero crossing
    const buf = makeAudioBuffer([1, 2, 3, 4, 5, 6, 7, 8], 1000);
    const result = findNearestZeroCrossing(buf, 0.004, 2);
    // No crossing → returns centerSample / sampleRate
    expect(result).toBeCloseTo(0.004, 3);
  });

  it('finds crossing at zero value (sample is exactly 0)', () => {
    // [1, 0, -1] → 1*0=0 at index 0, 0*-1=0 at index 1
    // target sample 1, crossing at i=1 (dist=0) is nearest
    const buf = makeAudioBuffer([1, 0, -1], 1000);
    const result = findNearestZeroCrossing(buf, 0.001, 5);
    expect(result).toBeCloseTo(0.001, 3); // index 1
  });

  it('respects window boundary', () => {
    // Crossing at index 0→1, but target is far away with small window
    const buf = makeAudioBuffer([1, -1, 1, 1, 1, 1, 1, 1, 1, 1], 1000);
    // Target at 0.008 (sample 8), window 1ms = 1 sample → search [7, 9]
    const result = findNearestZeroCrossing(buf, 0.008, 1);
    // No crossing in [7..9], returns centerSample
    expect(result).toBeCloseTo(0.008, 3);
  });

  it('handles edge case at start of buffer', () => {
    const buf = makeAudioBuffer([1, -1, 1], 1000);
    const result = findNearestZeroCrossing(buf, 0, 5);
    expect(result).toBeCloseTo(0.0, 3);
  });

  it('handles edge case at end of buffer', () => {
    // [1, 1, 1, -1] → crossing at 2→3
    const buf = makeAudioBuffer([1, 1, 1, -1], 1000);
    const result = findNearestZeroCrossing(buf, 0.003, 5);
    expect(result).toBeCloseTo(0.002, 3); // index 2
  });
});

// ── snapToZeroCrossing ───────────────────────────────────────

describe('snapToZeroCrossing', () => {
  it('snaps both start and end independently', () => {
    // [1, -1, 1, 1, 1, -1, 1] → crossings at i=0, 1, 4, 5
    const buf = makeAudioBuffer([1, -1, 1, 1, 1, -1, 1], 1000);
    // start target 0.001 → center sample 1, nearest crossing i=1 (dist=0) → 0.001
    // end target 0.005 → center sample 5, nearest crossing i=5 (dist=0) → 0.005
    const result = snapToZeroCrossing(buf, 0.001, 0.005, 5);
    expect(result.start).toBeCloseTo(0.001, 3);
    expect(result.end).toBeCloseTo(0.005, 3);
  });

  it('returns original values when no crossings exist', () => {
    const buf = makeAudioBuffer([1, 2, 3, 4, 5], 1000);
    const result = snapToZeroCrossing(buf, 0.001, 0.003, 5);
    expect(result.start).toBeCloseTo(0.001, 3);
    expect(result.end).toBeCloseTo(0.003, 3);
  });
});
