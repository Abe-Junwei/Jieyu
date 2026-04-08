import { describe, expect, it } from 'vitest';
import { DEFAULT_ACOUSTIC_ANALYSIS_CONFIG, type AcousticFeatureResult } from './acousticOverlayTypes';
import {
  buildAcousticInspectorSlice,
  buildAcousticPanelDetail,
  serializeAcousticPanelDetailCsv,
  serializeAcousticPanelDetailJson,
} from './acousticPanelDetail';

function makeAnalysis(): AcousticFeatureResult {
  return {
    mediaKey: 'media-1',
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
      formantF1MeanHz: 560,
      formantF2MeanHz: 1740,
      formantFrameCount: 5,
      vowelSpaceCentroidF1Hz: 560,
      vowelSpaceCentroidF2Hz: 1740,
      vowelSpaceSpread: 210,
    },
    frames: [
      { timeSec: 1.96, f0Hz: 120, intensityDb: -26, reliability: 0.72, spectralCentroidHz: 980, spectralRolloffHz: 2120, zeroCrossingRate: 0.036, formantF1Hz: 490, formantF2Hz: 1500, formantReliability: 0.52 },
      { timeSec: 2.02, f0Hz: 136, intensityDb: -20, reliability: 0.78, spectralCentroidHz: 1060, spectralRolloffHz: 2240, zeroCrossingRate: 0.04, formantF1Hz: 520, formantF2Hz: 1640, formantReliability: 0.58 },
      { timeSec: 2.08, f0Hz: 151, intensityDb: -18, reliability: 0.84, spectralCentroidHz: 1180, spectralRolloffHz: 2380, zeroCrossingRate: 0.046, formantF1Hz: 560, formantF2Hz: 1760, formantReliability: 0.62 },
      { timeSec: 2.14, f0Hz: 171, intensityDb: -15, reliability: 0.88, spectralCentroidHz: 1260, spectralRolloffHz: 2520, zeroCrossingRate: 0.05, formantF1Hz: 590, formantF2Hz: 1860, formantReliability: 0.65 },
      { timeSec: 2.20, f0Hz: 188, intensityDb: -13, reliability: 0.9, spectralCentroidHz: 1340, spectralRolloffHz: 2680, zeroCrossingRate: 0.056, formantF1Hz: 640, formantF2Hz: 1940, formantReliability: 0.7 },
    ],
  };
}

describe('acousticPanelDetail', () => {
  it('builds selection detail, slice metrics, and export payloads', () => {
    const detail = buildAcousticPanelDetail(makeAnalysis(), 2, 2.2);

    expect(detail).toBeTruthy();
    expect(detail?.sampleCount).toBe(4);
    expect(detail?.voicedSampleCount).toBe(4);
    expect(detail?.toneBins.length).toBeGreaterThan(0);

    const slice = buildAcousticInspectorSlice(detail, 2.08);
    expect(slice).toBeTruthy();
    expect(slice?.pitchTrend).toBe('rising');
    expect(slice?.intensityTrend).toBe('rising');
    expect(slice?.pitchMinHz).toBe(136);
    expect(slice?.pitchMaxHz).toBe(171);

    const csv = serializeAcousticPanelDetailCsv(detail!);
    expect(csv).toContain('timeSec,relativeTimeSec,timeRatio,f0Hz,intensityDb,reliability,spectralCentroidHz,spectralRolloffHz,zeroCrossingRate,formantF1Hz,formantF2Hz,formantReliability');
    expect(csv).toContain('2.0200');
    expect(csv).toContain('1060.0000');
    expect(csv).toContain('1640.0000');

    const json = serializeAcousticPanelDetailJson(detail!);
    expect(json).toContain('"mediaKey": "media-1"');
    expect(json).toContain('"selectionStartSec": 2');
    expect(json).toContain('"spectralCentroidHz": 1180');
    expect(json).toContain('"algorithmVersion": "yin-v2-spectral"');
    expect(json).toContain('"formantF2Hz": 1760');
  });
});