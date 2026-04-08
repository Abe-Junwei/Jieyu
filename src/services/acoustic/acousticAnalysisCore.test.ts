import { describe, expect, it } from 'vitest';
import { computeAcousticAnalysis } from './acousticAnalysisCore';
import { DEFAULT_ACOUSTIC_ANALYSIS_CONFIG } from '../../utils/acousticOverlayTypes';

function buildSineWave({
  frequencyHz,
  durationSec,
  sampleRate,
  amplitude = 0.6,
}: {
  frequencyHz: number;
  durationSec: number;
  sampleRate: number;
  amplitude?: number;
}): Float32Array {
  const sampleCount = Math.round(durationSec * sampleRate);
  const pcm = new Float32Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    pcm[index] = amplitude * Math.sin((2 * Math.PI * frequencyHz * index) / sampleRate);
  }
  return pcm;
}

describe('computeAcousticAnalysis', () => {
  it('tracks a stable sine wave near its target f0', () => {
    const sampleRate = 16000;
    const pcm = buildSineWave({
      frequencyHz: 200,
      durationSec: 1,
      sampleRate,
    });

    const result = computeAcousticAnalysis({
      mediaKey: 'sine-200',
      sampleRate,
      pcm,
      config: DEFAULT_ACOUSTIC_ANALYSIS_CONFIG,
    });

    expect(result.frames.length).toBeGreaterThan(40);
    expect(result.summary.f0MeanHz).not.toBeNull();
    expect(result.summary.f0MeanHz ?? 0).toBeGreaterThan(185);
    expect(result.summary.f0MeanHz ?? 0).toBeLessThan(215);
    expect(result.summary.voicedFrameCount).toBeGreaterThan(result.summary.frameCount * 0.75);
    expect(result.summary.intensityPeakDb).not.toBeNull();
    expect(result.summary.spectralCentroidMeanHz ?? 0).toBeGreaterThan(0);
    expect(result.summary.spectralRolloffMeanHz ?? 0).toBeGreaterThan(0);
    expect(result.summary.zeroCrossingRateMean ?? 0).toBeGreaterThan(0);
    expect(result.summary.spectralFlatnessMean ?? 0).toBeGreaterThan(0);
    expect(result.summary.loudnessMeanDb).not.toBeNull();
    expect(Array.isArray(result.summary.mfccMeanCoefficients)).toBe(true);
    expect((result.summary.mfccMeanCoefficients?.length ?? 0)).toBeGreaterThanOrEqual(3);
    expect(result.summary.formantFrameCount ?? 0).toBeGreaterThanOrEqual(0);
    if ((result.summary.formantFrameCount ?? 0) > 0) {
      expect(result.summary.formantF1MeanHz ?? 0).toBeGreaterThan(0);
      expect(result.summary.formantF2MeanHz ?? 0).toBeGreaterThan(0);
    } else {
      expect(result.summary.formantF1MeanHz).toBeNull();
      expect(result.summary.formantF2MeanHz).toBeNull();
    }
    expect(result.summary.vowelSpaceSpread ?? 0).toBeGreaterThanOrEqual(0);
    expect(result.hotspots.some((item) => item.kind === 'pitch_peak')).toBe(true);
    expect(result.hotspots.some((item) => item.kind === 'intensity_peak')).toBe(true);
  });

  it('treats near-silence as unvoiced', () => {
    const sampleRate = 16000;
    const pcm = new Float32Array(sampleRate);

    const result = computeAcousticAnalysis({
      mediaKey: 'silence',
      sampleRate,
      pcm,
      config: DEFAULT_ACOUSTIC_ANALYSIS_CONFIG,
    });

    expect(result.summary.voicedFrameCount).toBe(0);
    expect(result.summary.f0MeanHz).toBeNull();
    expect(result.summary.spectralCentroidMeanHz).toBeNull();
    expect(result.summary.spectralRolloffMeanHz).toBeNull();
    expect(result.summary.spectralFlatnessMean).toBeNull();
    expect(result.summary.loudnessMeanDb).toBeNull();
    expect(result.summary.mfccMeanCoefficients).toBeNull();
    expect(result.summary.formantF1MeanHz).toBeNull();
    expect(result.summary.formantF2MeanHz).toBeNull();
    expect(result.summary.formantFrameCount ?? 0).toBe(0);
    expect(result.hotspots).toHaveLength(0);
  });
});