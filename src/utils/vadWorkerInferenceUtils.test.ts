import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VAD_SEGMENTATION_PARAMS,
  frameProbsToSegments,
  resampleLinear,
} from './vadWorkerInferenceUtils';

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

  describe('conservative defaults', () => {
    const frameSize = 512;
    const sampleRate = 16_000; // 32 ms per frame

    it('documents the default parameters', () => {
      expect(DEFAULT_VAD_SEGMENTATION_PARAMS).toEqual({
        onsetThreshold: 0.6,
        offsetThreshold: 0.45,
        mergeGapSec: 0.3,
        minDurationSec: 0.3,
        maxDurationSec: 30,
      });
    });

    it('does not open a segment on noise between the old and new onset', () => {
      const probs = [...Array(5).fill(0.1), ...Array(30).fill(0.55), ...Array(5).fill(0.1)];
      expect(frameProbsToSegments(probs, frameSize, sampleRate)).toEqual([]);
    });

    it('keeps an utterance whole through a dip above the offset threshold', () => {
      const probs = [...Array(20).fill(0.9), ...Array(15).fill(0.5), ...Array(20).fill(0.9)];
      const segs = frameProbsToSegments(probs, frameSize, sampleRate);
      expect(segs).toHaveLength(1);
      expect(segs[0]!.start).toBeCloseTo(0, 5);
      expect(segs[0]!.end).toBeCloseTo(55 * 0.032, 5);
    });

    it('drops segments shorter than 0.3 s', () => {
      const probs = [...Array(8).fill(0.9), ...Array(30).fill(0.05)]; // 0.256 s
      expect(frameProbsToSegments(probs, frameSize, sampleRate)).toEqual([]);
    });

    it('still honours explicit parameters', () => {
      const probs = [...Array(30).fill(0.55)];
      const segs = frameProbsToSegments(probs, frameSize, sampleRate, {
        ...DEFAULT_VAD_SEGMENTATION_PARAMS,
        onsetThreshold: 0.5,
        offsetThreshold: 0.35,
      });
      expect(segs).toHaveLength(1);
    });
  });
});
