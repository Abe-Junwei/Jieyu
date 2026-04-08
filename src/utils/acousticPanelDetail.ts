import type { AcousticFeatureResult } from './acousticOverlayTypes';

export type AcousticPanelTrend = 'rising' | 'falling' | 'flat' | 'mixed';

export type AcousticCalibrationStatus = 'exploratory' | 'calibrated';

export interface AcousticPanelFramePoint {
  timeSec: number;
  relativeTimeSec: number;
  timeRatio: number;
  f0Hz: number | null;
  intensityDb: number;
  reliability: number;
  spectralCentroidHz?: number | null;
  spectralRolloffHz?: number | null;
  zeroCrossingRate?: number | null;
  spectralFlatness?: number | null;
  loudnessDb?: number | null;
  mfccCoefficients?: number[] | null;
  formantF1Hz?: number | null;
  formantF2Hz?: number | null;
  formantReliability?: number | null;
  normalizedF0: number | null;
  normalizedIntensity: number | null;
}

export interface AcousticPanelToneBin {
  index: number;
  timeSec: number;
  timeRatio: number;
  f0Hz: number | null;
  intensityDb: number | null;
  reliability: number | null;
  normalizedF0: number | null;
  normalizedIntensity: number | null;
}

export interface AcousticInspectorSlice {
  centerTimeSec: number;
  startSec: number;
  endSec: number;
  sampleCount: number;
  voicedSampleCount: number;
  pitchMinHz: number | null;
  pitchMaxHz: number | null;
  intensityMinDb: number | null;
  intensityMaxDb: number | null;
  reliabilityMean: number | null;
  pitchTrend: AcousticPanelTrend;
  intensityTrend: AcousticPanelTrend;
}

export interface AcousticPanelDetail {
  mediaKey: string;
  sampleRate: number;
  algorithmVersion: string;
  modelVersion: string;
  persistenceVersion: string;
  frameStepSec: number;
  analysisWindowSec: number;
  yinThreshold: number;
  silenceRmsThreshold: number;
  selectionStartSec: number;
  selectionEndSec: number;
  sampleCount: number;
  voicedSampleCount: number;
  frames: AcousticPanelFramePoint[];
  toneBins: AcousticPanelToneBin[];
}

const DEFAULT_TONE_BIN_COUNT = 24;
const DEFAULT_SLICE_HALF_WINDOW_SEC = 0.06;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function deriveAcousticCalibrationStatus(detail: AcousticPanelDetail | null): AcousticCalibrationStatus {
  if (!detail || detail.sampleCount <= 0) return 'exploratory';

  const formantFrames = detail.frames.filter(
    (frame) => typeof frame.formantF1Hz === 'number' && typeof frame.formantF2Hz === 'number',
  );
  const formantCoverage = formantFrames.length / detail.sampleCount;
  const formantReliability = average(
    formantFrames
      .map((frame) => frame.formantReliability)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
  ) ?? 0;

  // Calibration gate heuristic: enough formant coverage + stable reliability.
  return formantFrames.length >= 24 && formantCoverage >= 0.35 && formantReliability >= 0.55
    ? 'calibrated'
    : 'exploratory';
}

function normalize(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  if (!Number.isFinite(min) || !Number.isFinite(max) || Math.abs(max - min) < 1e-6) {
    return 0.5;
  }
  return clamp((value - min) / (max - min), 0, 1);
}

function resolveTrend(startValue: number | null, endValue: number | null, threshold: number): AcousticPanelTrend {
  if (startValue == null || endValue == null) return 'mixed';
  const delta = endValue - startValue;
  if (Math.abs(delta) < threshold) return 'flat';
  return delta > 0 ? 'rising' : 'falling';
}

function sanitizeFileStem(value: string): string {
  const normalized = value.trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return normalized || 'acoustic-selection';
}

export function buildAcousticPanelDetail(
  analysis: AcousticFeatureResult | null,
  selectionStartSec?: number,
  selectionEndSec?: number,
): AcousticPanelDetail | null {
  if (!analysis || selectionStartSec === undefined || selectionEndSec === undefined || selectionEndSec <= selectionStartSec) {
    return null;
  }

  const selectionDurationSec = selectionEndSec - selectionStartSec;
  const sourceFrames = analysis.frames.filter((frame) => frame.timeSec >= selectionStartSec && frame.timeSec <= selectionEndSec);
  if (sourceFrames.length === 0) return null;

  const voicedF0Values = sourceFrames
    .map((frame) => frame.f0Hz)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const intensityValues = sourceFrames
    .map((frame) => frame.intensityDb)
    .filter((value) => Number.isFinite(value));
  const f0Min = voicedF0Values.length > 0 ? Math.min(...voicedF0Values) : 0;
  const f0Max = voicedF0Values.length > 0 ? Math.max(...voicedF0Values) : 0;
  const intensityMin = intensityValues.length > 0 ? Math.min(...intensityValues) : 0;
  const intensityMax = intensityValues.length > 0 ? Math.max(...intensityValues) : 0;

  const frames: AcousticPanelFramePoint[] = sourceFrames.map((frame) => ({
    timeSec: frame.timeSec,
    relativeTimeSec: frame.timeSec - selectionStartSec,
    timeRatio: selectionDurationSec > 0 ? clamp((frame.timeSec - selectionStartSec) / selectionDurationSec, 0, 1) : 0,
    f0Hz: frame.f0Hz,
    intensityDb: frame.intensityDb,
    reliability: frame.reliability,
    spectralCentroidHz: frame.spectralCentroidHz,
    spectralRolloffHz: frame.spectralRolloffHz,
    zeroCrossingRate: frame.zeroCrossingRate,
    spectralFlatness: frame.spectralFlatness,
    loudnessDb: frame.loudnessDb,
    mfccCoefficients: frame.mfccCoefficients,
    formantF1Hz: frame.formantF1Hz,
    formantF2Hz: frame.formantF2Hz,
    formantReliability: frame.formantReliability,
    normalizedF0: typeof frame.f0Hz === 'number' ? normalize(frame.f0Hz, f0Min, f0Max) : null,
    normalizedIntensity: normalize(frame.intensityDb, intensityMin, intensityMax),
  }));

  const binCount = Math.min(DEFAULT_TONE_BIN_COUNT, Math.max(6, Math.round(Math.sqrt(frames.length))));
  const toneBins: AcousticPanelToneBin[] = Array.from({ length: binCount }, (_, index) => {
    const startIndex = Math.floor((index * frames.length) / binCount);
    const endIndex = Math.floor(((index + 1) * frames.length) / binCount);
    const bucket = frames.slice(startIndex, Math.max(startIndex + 1, endIndex));
    const voicedBucket = bucket
      .map((point) => point.f0Hz)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const intensityBucket = bucket
      .map((point) => point.intensityDb)
      .filter((value) => Number.isFinite(value));
    const reliabilityBucket = bucket
      .map((point) => point.reliability)
      .filter((value) => Number.isFinite(value));
    const timeSec = average(bucket.map((point) => point.timeSec)) ?? selectionStartSec;
    const f0Hz = average(voicedBucket);
    const intensityDb = average(intensityBucket);
    const reliability = average(reliabilityBucket);

    return {
      index,
      timeSec,
      timeRatio: binCount > 1 ? index / (binCount - 1) : 0,
      f0Hz,
      intensityDb,
      reliability,
      normalizedF0: typeof f0Hz === 'number' ? normalize(f0Hz, f0Min, f0Max) : null,
      normalizedIntensity: typeof intensityDb === 'number' ? normalize(intensityDb, intensityMin, intensityMax) : null,
    };
  });

  return {
    mediaKey: analysis.mediaKey,
    sampleRate: analysis.sampleRate,
    algorithmVersion: analysis.config.algorithmVersion,
    modelVersion: analysis.config.modelVersion,
    persistenceVersion: analysis.config.persistenceVersion,
    frameStepSec: analysis.config.frameStepSec,
    analysisWindowSec: analysis.config.analysisWindowSec,
    yinThreshold: analysis.config.yinThreshold,
    silenceRmsThreshold: analysis.config.silenceRmsThreshold,
    selectionStartSec,
    selectionEndSec,
    sampleCount: frames.length,
    voicedSampleCount: voicedF0Values.length,
    frames,
    toneBins,
  };
}

export function buildAcousticInspectorSlice(
  detail: AcousticPanelDetail | null,
  centerTimeSec?: number,
  halfWindowSec = DEFAULT_SLICE_HALF_WINDOW_SEC,
): AcousticInspectorSlice | null {
  if (!detail || centerTimeSec === undefined || !Number.isFinite(centerTimeSec)) {
    return null;
  }

  const startSec = Math.max(detail.selectionStartSec, centerTimeSec - halfWindowSec);
  const endSec = Math.min(detail.selectionEndSec, centerTimeSec + halfWindowSec);
  const windowFrames = detail.frames.filter((frame) => frame.timeSec >= startSec && frame.timeSec <= endSec);
  if (windowFrames.length === 0) return null;

  const voicedFrames = windowFrames.filter((frame) => typeof frame.f0Hz === 'number');
  const voicedValues = voicedFrames.map((frame) => frame.f0Hz as number);
  const intensityValues = windowFrames.map((frame) => frame.intensityDb).filter((value) => Number.isFinite(value));
  const reliabilityValues = windowFrames.map((frame) => frame.reliability).filter((value) => Number.isFinite(value));
  const firstVoiced = voicedFrames[0]?.f0Hz ?? null;
  const lastVoiced = voicedFrames[voicedFrames.length - 1]?.f0Hz ?? null;
  const firstIntensity = intensityValues[0] ?? null;
  const lastIntensity = intensityValues[intensityValues.length - 1] ?? null;

  return {
    centerTimeSec,
    startSec,
    endSec,
    sampleCount: windowFrames.length,
    voicedSampleCount: voicedFrames.length,
    pitchMinHz: voicedValues.length > 0 ? Math.min(...voicedValues) : null,
    pitchMaxHz: voicedValues.length > 0 ? Math.max(...voicedValues) : null,
    intensityMinDb: intensityValues.length > 0 ? Math.min(...intensityValues) : null,
    intensityMaxDb: intensityValues.length > 0 ? Math.max(...intensityValues) : null,
    reliabilityMean: average(reliabilityValues),
    pitchTrend: resolveTrend(firstVoiced, lastVoiced, 12),
    intensityTrend: resolveTrend(firstIntensity, lastIntensity, 1.2),
  };
}

export function serializeAcousticPanelDetailCsv(detail: AcousticPanelDetail): string {
  const header = ['timeSec', 'relativeTimeSec', 'timeRatio', 'f0Hz', 'intensityDb', 'reliability', 'spectralCentroidHz', 'spectralRolloffHz', 'zeroCrossingRate', 'spectralFlatness', 'loudnessDb', 'mfcc1', 'mfcc2', 'mfcc3', 'formantF1Hz', 'formantF2Hz', 'formantReliability'];
  const rows = detail.frames.map((frame) => [
    frame.timeSec.toFixed(4),
    frame.relativeTimeSec.toFixed(4),
    frame.timeRatio.toFixed(4),
    frame.f0Hz == null ? '' : frame.f0Hz.toFixed(4),
    frame.intensityDb.toFixed(4),
    frame.reliability.toFixed(4),
    frame.spectralCentroidHz == null ? '' : frame.spectralCentroidHz.toFixed(4),
    frame.spectralRolloffHz == null ? '' : frame.spectralRolloffHz.toFixed(4),
    frame.zeroCrossingRate == null ? '' : frame.zeroCrossingRate.toFixed(4),
    frame.spectralFlatness == null ? '' : frame.spectralFlatness.toFixed(4),
    frame.loudnessDb == null ? '' : frame.loudnessDb.toFixed(4),
    frame.mfccCoefficients?.[0] == null ? '' : frame.mfccCoefficients[0].toFixed(4),
    frame.mfccCoefficients?.[1] == null ? '' : frame.mfccCoefficients[1].toFixed(4),
    frame.mfccCoefficients?.[2] == null ? '' : frame.mfccCoefficients[2].toFixed(4),
    frame.formantF1Hz == null ? '' : frame.formantF1Hz.toFixed(4),
    frame.formantF2Hz == null ? '' : frame.formantF2Hz.toFixed(4),
    frame.formantReliability == null ? '' : frame.formantReliability.toFixed(4),
  ].join(','));
  return [header.join(','), ...rows].join('\n');
}

export function serializeAcousticPanelDetailJson(detail: AcousticPanelDetail): string {
  return JSON.stringify({
    mediaKey: detail.mediaKey,
    sampleRate: detail.sampleRate,
    algorithmVersion: detail.algorithmVersion,
    modelVersion: detail.modelVersion,
    persistenceVersion: detail.persistenceVersion,
    frameStepSec: detail.frameStepSec,
    analysisWindowSec: detail.analysisWindowSec,
    yinThreshold: detail.yinThreshold,
    silenceRmsThreshold: detail.silenceRmsThreshold,
    selectionStartSec: detail.selectionStartSec,
    selectionEndSec: detail.selectionEndSec,
    sampleCount: detail.sampleCount,
    voicedSampleCount: detail.voicedSampleCount,
    toneBins: detail.toneBins,
    frames: detail.frames,
  }, null, 2);
}

export function buildAcousticExportFileStem(detail: AcousticPanelDetail): string {
  return `${sanitizeFileStem(detail.mediaKey)}-${detail.selectionStartSec.toFixed(2)}-${detail.selectionEndSec.toFixed(2)}s`;
}

/**
 * Serialize acoustic pitch data as Praat PitchTier text format.
 * This format can be loaded directly in Praat via "Read from file…".
 */
export function serializeAcousticPitchTierText(detail: AcousticPanelDetail): string {
  const voicedFrames = detail.frames.filter((frame) => frame.f0Hz != null);
  const lines: string[] = [
    'File type = "ooTextFile"',
    'Object class = "PitchTier"',
    '',
    `xmin = ${detail.selectionStartSec}`,
    `xmax = ${detail.selectionEndSec}`,
    `points: size = ${voicedFrames.length}`,
  ];

  for (let index = 0; index < voicedFrames.length; index += 1) {
    const frame = voicedFrames[index]!;
    lines.push(`points [${index + 1}]:`);
    lines.push(`    number = ${frame.timeSec}`);
    lines.push(`    value = ${frame.f0Hz!}`);
  }

  return lines.join('\n');
}

/**
 * Serialize acoustic panel detail as JSON with full metadata for research reproducibility.
 * Includes algorithm version, parameters, calibration version, and sample rate.
 */
export function serializeAcousticPanelDetailJsonResearch(detail: AcousticPanelDetail): string {
  const calibrationStatus = deriveAcousticCalibrationStatus(detail);
  return JSON.stringify({
    format: 'jieyu-acoustic-export',
    formatVersion: 2,
    exportedAt: new Date().toISOString(),
    mediaKey: detail.mediaKey,
    sampleRate: detail.sampleRate,
    algorithmVersion: detail.algorithmVersion,
    modelVersion: detail.modelVersion,
    persistenceVersion: detail.persistenceVersion,
    calibrationStatus,
    parameters: {
      frameStepSec: detail.frameStepSec,
      analysisWindowSec: detail.analysisWindowSec,
      yinThreshold: detail.yinThreshold,
      silenceRmsThreshold: detail.silenceRmsThreshold,
    },
    selection: {
      startSec: detail.selectionStartSec,
      endSec: detail.selectionEndSec,
    },
    statistics: {
      sampleCount: detail.sampleCount,
      voicedSampleCount: detail.voicedSampleCount,
    },
    toneBins: detail.toneBins,
    frames: detail.frames,
  }, null, 2);
}