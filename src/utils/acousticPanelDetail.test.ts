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
      { timeSec: 2.08, f0Hz: 151, intensityDb: -18, reliability: 0.84, spectralCentroidHz: 1180, spectralRolloffHz: 2380, zeroCrossingRate: 0.046, spectralFlatness: 0.214, loudnessDb: -18.6, mfccCoefficients: [12.2, -3.1, 1.8], formantF1Hz: 560, formantF2Hz: 1760, formantReliability: 0.62 },
      { timeSec: 2.14, f0Hz: 171, intensityDb: -15, reliability: 0.88, spectralCentroidHz: 1260, spectralRolloffHz: 2520, zeroCrossingRate: 0.05, spectralFlatness: 0.236, loudnessDb: -16.9, mfccCoefficients: [12.9, -2.7, 2.2], formantF1Hz: 590, formantF2Hz: 1860, formantReliability: 0.65 },
      { timeSec: 2.20, f0Hz: 188, intensityDb: -13, reliability: 0.9, spectralCentroidHz: 1340, spectralRolloffHz: 2680, zeroCrossingRate: 0.056, spectralFlatness: 0.271, loudnessDb: -15.2, mfccCoefficients: [13.4, -2.1, 2.6], formantF1Hz: 640, formantF2Hz: 1940, formantReliability: 0.7 },
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
    expect(csv).toContain('timeSec,relativeTimeSec,timeRatio,f0Hz,intensityDb,reliability,spectralCentroidHz,spectralRolloffHz,zeroCrossingRate,spectralFlatness,loudnessDb,mfcc1,mfcc2,mfcc3,formantF1Hz,formantF2Hz,formantReliability');
    expect(csv).toContain('2.0200');
    expect(csv).toContain('1060.0000');
    expect(csv).toContain('0.1880');
    expect(csv).toContain('-20.1000');
    expect(csv).toContain('1640.0000');

    const json = serializeAcousticPanelDetailJson(detail!);
    expect(json).toContain('"mediaKey": "media-1"');
    expect(json).toContain('"selectionStartSec": 2');
    expect(json).toContain('"spectralCentroidHz": 1180');
    expect(json).toContain('"spectralFlatness": 0.214');
    expect(json).toContain('"loudnessDb": -18.6');
    expect(json).toContain('"algorithmVersion": "yin-v2-spectral"');
    expect(json).toContain('"formantF2Hz": 1760');
  });
});