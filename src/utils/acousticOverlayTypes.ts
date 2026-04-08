export const ACOUSTIC_OVERLAY_MODES = ['none', 'f0', 'intensity', 'both'] as const;

export type AcousticOverlayMode = (typeof ACOUSTIC_OVERLAY_MODES)[number];

export interface AcousticFrame {
  timeSec: number;
  f0Hz: number | null;
  intensityDb: number;
  reliability: number;
  spectralCentroidHz?: number | null;
  spectralRolloffHz?: number | null;
  zeroCrossingRate?: number | null;
  formantF1Hz?: number | null;
  formantF2Hz?: number | null;
  formantReliability?: number | null;
}

export const ACOUSTIC_HOTSPOT_KINDS = ['pitch_peak', 'pitch_break', 'intensity_peak', 'unstable_span'] as const;

export type AcousticHotspotKind = (typeof ACOUSTIC_HOTSPOT_KINDS)[number];

export interface AcousticHotspot {
  kind: AcousticHotspotKind;
  timeSec: number;
  startSec: number;
  endSec: number;
  score: number;
  f0Hz?: number | null;
  intensityDb?: number | null;
  reliability?: number | null;
}

export interface AcousticAnalysisConfig {
  algorithmVersion: string;
  modelVersion: string;
  persistenceVersion: string;
  frameStepSec: number;
  analysisWindowSec: number;
  pitchFloorHz: number;
  pitchCeilingHz: number;
  yinThreshold: number;
  silenceRmsThreshold: number;
}

export interface AcousticAnalysisSummary {
  selectionStartSec: number;
  selectionEndSec: number;
  f0MinHz: number | null;
  f0MaxHz: number | null;
  f0MeanHz: number | null;
  intensityMinDb: number | null;
  intensityPeakDb: number | null;
  reliabilityMean: number | null;
  voicedFrameCount: number;
  frameCount: number;
  spectralCentroidMeanHz?: number | null;
  spectralRolloffMeanHz?: number | null;
  zeroCrossingRateMean?: number | null;
  formantF1MeanHz?: number | null;
  formantF2MeanHz?: number | null;
  formantFrameCount?: number;
  vowelSpaceCentroidF1Hz?: number | null;
  vowelSpaceCentroidF2Hz?: number | null;
  vowelSpaceSpread?: number | null;
}

export interface AcousticFeatureResult {
  mediaKey: string;
  sampleRate: number;
  durationSec: number;
  config: AcousticAnalysisConfig;
  frames: AcousticFrame[];
  hotspots: AcousticHotspot[];
  summary: AcousticAnalysisSummary;
}

export interface AcousticAnalysisRequest {
  mediaKey: string;
  sampleRate: number;
  pcm: Float32Array;
  config: AcousticAnalysisConfig;
}

export function isAcousticOverlayMode(value: string): value is AcousticOverlayMode {
  return (ACOUSTIC_OVERLAY_MODES as readonly string[]).includes(value);
}

export const DEFAULT_ACOUSTIC_ANALYSIS_CONFIG: AcousticAnalysisConfig = {
  algorithmVersion: 'yin-v2-spectral',
  modelVersion: 'none',
  persistenceVersion: 'phase1-v2',
  frameStepSec: 0.01,
  analysisWindowSec: 0.04,
  pitchFloorHz: 75,
  pitchCeilingHz: 400,
  yinThreshold: 0.15,
  silenceRmsThreshold: 0.01,
};

export function buildAcousticCacheKey(mediaKey: string, config: AcousticAnalysisConfig): string {
  return [
    mediaKey,
    config.algorithmVersion,
    config.modelVersion,
    config.persistenceVersion,
    config.frameStepSec,
    config.analysisWindowSec,
    config.pitchFloorHz,
    config.pitchCeilingHz,
    config.yinThreshold,
    config.silenceRmsThreshold,
  ].join('|');
}