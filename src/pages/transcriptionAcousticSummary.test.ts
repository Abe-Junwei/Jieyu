import { describe, expect, it } from 'vitest';
import { DEFAULT_ACOUSTIC_ANALYSIS_CONFIG, type AcousticFeatureResult } from '../utils/acousticOverlayTypes';
import { buildAcousticPromptSummary } from './transcriptionAcousticSummary';

function makeAnalysis(durationSec: number): AcousticFeatureResult {
  return {
    mediaKey: 'media-boundary',
    sampleRate: 16000,
    durationSec,
    config: DEFAULT_ACOUSTIC_ANALYSIS_CONFIG,
    summary: {
      selectionStartSec: 0,
      selectionEndSec: durationSec,
      f0MinHz: 120,
      f0MaxHz: 180,
      f0MeanHz: 150,
      intensityMinDb: -24,
      intensityPeakDb: -12,
      reliabilityMean: 0.8,
      voicedFrameCount: 3,
      frameCount: 3,
    },
    hotspots: [
      {
        kind: 'pitch_peak',
        timeSec: 2.1,
        startSec: 2.08,
        endSec: 2.12,
        score: 0.8,
        f0Hz: 180,
        intensityDb: -13,
        reliability: 0.86,
      },
      {
        kind: 'intensity_peak',
        timeSec: 2.2,
        startSec: 2.18,
        endSec: 2.22,
        score: 0.7,
        f0Hz: 176,
        intensityDb: -12,
        reliability: 0.84,
      },
    ],
    frames: [
      { timeSec: 2.0, f0Hz: 140, intensityDb: -20, reliability: 0.78 },
      { timeSec: 2.1, f0Hz: 160, intensityDb: -16, reliability: 0.82 },
      { timeSec: 2.2, f0Hz: 176, intensityDb: -12, reliability: 0.84 },
    ],
  };
}

describe('buildAcousticPromptSummary boundary semantics', () => {
  it('uses half-open range for non-terminal selections', () => {
    const summary = buildAcousticPromptSummary(makeAnalysis(2.3), 2.0, 2.1);

    expect(summary).not.toBeNull();
    expect(summary?.frameCount).toBe(1);
    expect(summary?.voicedFrameCount).toBe(1);
    expect(summary?.hotspotCount).toBe(0);
  });

  it('includes terminal boundary frame and hotspot when selection ends at media duration', () => {
    const summary = buildAcousticPromptSummary(makeAnalysis(2.2), 2.1, 2.2);

    expect(summary).not.toBeNull();
    expect(summary?.frameCount).toBe(2);
    expect(summary?.voicedFrameCount).toBe(2);
    expect(summary?.hotspotCount).toBe(2);
  });
});
