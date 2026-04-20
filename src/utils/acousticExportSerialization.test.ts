import { describe, expect, it } from 'vitest';
import { DEFAULT_ACOUSTIC_ANALYSIS_CONFIG, type AcousticFeatureResult } from './acousticOverlayTypes';
import { buildAcousticPanelDetail } from './acousticPanelDetail';
import { serializeAcousticExportPayload } from './acousticExportSerialization';

function makeAnalysis(): AcousticFeatureResult {
  return {
    mediaKey: 'media-export',
    sampleRate: 16000,
    durationSec: 4,
    config: DEFAULT_ACOUSTIC_ANALYSIS_CONFIG,
    hotspots: [],
    summary: {
      selectionStartSec: 0,
      selectionEndSec: 4,
      f0MinHz: 118,
      f0MaxHz: 188,
      f0MeanHz: 152,
      intensityMinDb: -31,
      intensityPeakDb: -12,
      reliabilityMean: 0.78,
      voicedFrameCount: 5,
      frameCount: 5,
      spectralCentroidMeanHz: 1180,
      spectralRolloffMeanHz: 2480,
      zeroCrossingRateMean: 0.046,
      spectralFlatnessMean: 0.214,
      loudnessMeanDb: -18.6,
      mfccMeanCoefficients: [12.2, -3.1, 1.8],
      formantF1MeanHz: 560,
      formantF2MeanHz: 1740,
      formantFrameCount: 5,
      vowelSpaceCentroidF1Hz: 560,
      vowelSpaceCentroidF2Hz: 1740,
      vowelSpaceSpread: 210,
    },
    frames: [
      { timeSec: 1.96, f0Hz: 120, intensityDb: -26, reliability: 0.72, spectralCentroidHz: 980, spectralRolloffHz: 2120, zeroCrossingRate: 0.036, spectralFlatness: 0.162, loudnessDb: -23.5, mfccCoefficients: [11.2, -4.1, 0.8], formantF1Hz: 490, formantF2Hz: 1500, formantReliability: 0.52 },
      { timeSec: 2.02, f0Hz: 136, intensityDb: -20, reliability: 0.78, spectralCentroidHz: 1060, spectralRolloffHz: 2240, zeroCrossingRate: 0.04, spectralFlatness: 0.188, loudnessDb: -20.1, mfccCoefficients: [12.0, -3.6, 1.1], formantF1Hz: 520, formantF2Hz: 1640, formantReliability: 0.58 },
    ],
  };
}

describe('acousticExportSerialization', () => {
  it('serializes single detail as json', () => {
    const detail = buildAcousticPanelDetail(makeAnalysis(), 2, 2.2);
    expect(detail).toBeTruthy();
    const text = serializeAcousticExportPayload('single', 'json', detail!);
    expect(text).toContain('media-export');
    expect(text).toMatch(/"frames"/);
  });

  it('rejects pitchtier in batch scope', () => {
    expect(() => serializeAcousticExportPayload('batch', 'pitchtier', [])).toThrow(
      /PitchTier export does not support batch scope/i,
    );
  });
});
