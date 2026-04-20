import { describe, expect, it } from 'vitest';
import { frameProbsToSegments, resampleLinear } from './vadWorkerInferenceUtils';

describe('vadWorkerInferenceUtils', () => {
  describe('resampleLinear', () => {
    it('returns same reference when sample rates match', () => {
      const pcm = new Float32Array([0, 1, 0.5]);
      expect(resampleLinear(pcm, 16_000, 16_000)).toBe(pcm);
    });

    it('downsamples with linear interpolation', () => {
      const pcm = new Float32Array([0, 10, 20, 30]);
      const out = resampleLinear(pcm, 4, 2);
      expect(out.length).toBe(2);
      expect(out[0]!).toBeCloseTo(0, 5);
      expect(out[1]!).toBeCloseTo(20, 5);
    });
  });

  describe('frameProbsToSegments', () => {
    const frameSize = 512;
    const sampleRate = 16_000;

    it('emits one segment for sustained speech probabilities', () => {
      const probs = Array.from({ length: 40 }, () => 0.9);
      const segs = frameProbsToSegments(probs, frameSize, sampleRate);
      expect(segs.length).toBeGreaterThanOrEqual(1);
      expect(segs[0]!.end).toBeGreaterThan(segs[0]!.start);
      expect(segs[0]!.confidence).toBeGreaterThan(0.5);
    });

    it('drops segments shorter than minimum duration', () => {
      const probs = [0.9, 0.9, 0.1];
      const segs = frameProbsToSegments(probs, frameSize, sampleRate);
      expect(segs.length).toBe(0);
    });
  });
});
