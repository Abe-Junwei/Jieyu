import type { AcousticFeatureResult } from '../utils/acousticOverlayTypes';

export const ACOUSTIC_DIAGNOSTIC_KEYS = [
  'low_reliability',
  'low_voicing',
  'wide_pitch_range',
  'high_energy_contrast',
  'unstable_focus',
] as const;

export type AcousticDiagnosticKey = (typeof ACOUSTIC_DIAGNOSTIC_KEYS)[number];

export interface AcousticPromptSummary {
  selectionStartSec: number;
  selectionEndSec: number;
  f0MinHz: number | null;
  f0MaxHz: number | null;
  f0MeanHz: number | null;
  intensityPeakDb: number | null;
  reliabilityMean: number | null;
  voicedFrameCount: number;
  frameCount: number;
  durationSec?: number;
  intensityMinDb?: number | null;
  voicedRatio?: number | null;
  spectralCentroidMeanHz?: number | null;
  spectralRolloffMeanHz?: number | null;
  zeroCrossingRateMean?: number | null;
  spectralFlatnessMean?: number | null;
  loudnessMeanDb?: number | null;
  mfccMeanCoefficients?: number[] | null;
  formantF1MeanHz?: number | null;
  formantF2MeanHz?: number | null;
  formantFrameCount?: number;
  vowelSpaceCentroidF1Hz?: number | null;
  vowelSpaceCentroidF2Hz?: number | null;
  vowelSpaceSpread?: number | null;
  sampleRateHz?: number;
  algorithmVersion?: string;
  analysisWindowSec?: number;
  frameStepSec?: number;
  hotspotCount?: number;
  diagnostics?: AcousticDiagnosticKey[];
  hotspots?: Array<{
    kind: 'pitch_peak' | 'pitch_break' | 'intensity_peak' | 'unstable_span';
    timeSec: number;
    score: number;
    startSec?: number;
    endSec?: number;
    f0Hz?: number | null;
    intensityDb?: number | null;
    reliability?: number | null;
  }>;
}

function collectAcousticDiagnostics(summary: AcousticPromptSummary): AcousticDiagnosticKey[] {
  const diagnostics: AcousticDiagnosticKey[] = [];

  if (typeof summary.reliabilityMean === 'number' && summary.reliabilityMean < 0.55) {
    diagnostics.push('low_reliability');
  }
  if (typeof summary.voicedRatio === 'number' && summary.voicedRatio < 0.4) {
    diagnostics.push('low_voicing');
  }
  if (
    typeof summary.f0MinHz === 'number'
    && typeof summary.f0MaxHz === 'number'
    && (summary.f0MaxHz - summary.f0MinHz) >= 180
  ) {
    diagnostics.push('wide_pitch_range');
  }
  if (
    typeof summary.intensityMinDb === 'number'
    && typeof summary.intensityPeakDb === 'number'
    && (summary.intensityPeakDb - summary.intensityMinDb) >= 12
  ) {
    diagnostics.push('high_energy_contrast');
  }
  if (summary.hotspots?.some((hotspot) => hotspot.kind === 'unstable_span' && hotspot.score >= 0.35)) {
    diagnostics.push('unstable_focus');
  }

  return diagnostics.slice(0, 3);
}

export function buildAcousticPromptSummary(
  analysis: AcousticFeatureResult | null,
  selectionStartSec?: number,
  selectionEndSec?: number,
): AcousticPromptSummary | null {
  if (!analysis || selectionStartSec === undefined || selectionEndSec === undefined || selectionEndSec <= selectionStartSec) {
    return null;
  }

  const frames = analysis.frames.filter((frame) => frame.timeSec >= selectionStartSec && frame.timeSec <= selectionEndSec);
  if (frames.length === 0) return null;

  const voicedFrames = frames.filter((frame) => frame.f0Hz != null);
  const f0Values = voicedFrames.map((frame) => frame.f0Hz ?? 0);
  const intensities = frames.map((frame) => frame.intensityDb).filter((value) => Number.isFinite(value));
  const reliabilities = frames.map((frame) => frame.reliability).filter((value) => Number.isFinite(value));
  const spectralCentroids = frames
    .map((frame) => frame.spectralCentroidHz)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const spectralRolloffs = frames
    .map((frame) => frame.spectralRolloffHz)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const zeroCrossingRates = frames
    .map((frame) => frame.zeroCrossingRate)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const spectralFlatnessValues = frames
    .map((frame) => frame.spectralFlatness)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const loudnessValues = frames
    .map((frame) => frame.loudnessDb)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const mfccVectors = frames
    .map((frame) => frame.mfccCoefficients)
    .filter((value): value is number[] => Array.isArray(value) && value.length > 0);
  const formantPairs = frames
    .filter((frame) => typeof frame.formantF1Hz === 'number' && Number.isFinite(frame.formantF1Hz)
      && typeof frame.formantF2Hz === 'number' && Number.isFinite(frame.formantF2Hz))
    .map((frame) => ({
      f1Hz: frame.formantF1Hz as number,
      f2Hz: frame.formantF2Hz as number,
    }));
  const hotspots = analysis.hotspots
    .filter((hotspot) => hotspot.timeSec >= selectionStartSec && hotspot.timeSec <= selectionEndSec)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map((hotspot) => ({
      kind: hotspot.kind,
      timeSec: hotspot.timeSec,
      score: hotspot.score,
      startSec: hotspot.startSec,
      endSec: hotspot.endSec,
      ...(typeof hotspot.f0Hz === 'number' ? { f0Hz: hotspot.f0Hz } : {}),
      ...(typeof hotspot.intensityDb === 'number' ? { intensityDb: hotspot.intensityDb } : {}),
      ...(typeof hotspot.reliability === 'number' ? { reliability: hotspot.reliability } : {}),
    }));

  const summary: AcousticPromptSummary = {
    selectionStartSec,
    selectionEndSec,
    f0MinHz: f0Values.length > 0 ? Math.min(...f0Values) : null,
    f0MaxHz: f0Values.length > 0 ? Math.max(...f0Values) : null,
    f0MeanHz: f0Values.length > 0 ? f0Values.reduce((sum, value) => sum + value, 0) / f0Values.length : null,
    intensityPeakDb: intensities.length > 0 ? Math.max(...intensities) : null,
    reliabilityMean: reliabilities.length > 0 ? reliabilities.reduce((sum, value) => sum + value, 0) / reliabilities.length : null,
    voicedFrameCount: voicedFrames.length,
    frameCount: frames.length,
    durationSec: selectionEndSec - selectionStartSec,
    intensityMinDb: intensities.length > 0 ? Math.min(...intensities) : null,
    voicedRatio: frames.length > 0 ? voicedFrames.length / frames.length : null,
    spectralCentroidMeanHz: spectralCentroids.length > 0 ? spectralCentroids.reduce((sum, value) => sum + value, 0) / spectralCentroids.length : null,
    spectralRolloffMeanHz: spectralRolloffs.length > 0 ? spectralRolloffs.reduce((sum, value) => sum + value, 0) / spectralRolloffs.length : null,
    zeroCrossingRateMean: zeroCrossingRates.length > 0 ? zeroCrossingRates.reduce((sum, value) => sum + value, 0) / zeroCrossingRates.length : null,
    spectralFlatnessMean: spectralFlatnessValues.length > 0 ? spectralFlatnessValues.reduce((sum, value) => sum + value, 0) / spectralFlatnessValues.length : null,
    loudnessMeanDb: loudnessValues.length > 0 ? loudnessValues.reduce((sum, value) => sum + value, 0) / loudnessValues.length : null,
    mfccMeanCoefficients: mfccVectors.length > 0
      ? Array.from({ length: mfccVectors[0]?.length ?? 0 }, (_, coefficientIndex) => (
        mfccVectors.reduce((sum, vector) => sum + (vector[coefficientIndex] ?? 0), 0) / mfccVectors.length
      ))
      : null,
    formantF1MeanHz: formantPairs.length > 0 ? formantPairs.reduce((sum, pair) => sum + pair.f1Hz, 0) / formantPairs.length : null,
    formantF2MeanHz: formantPairs.length > 0 ? formantPairs.reduce((sum, pair) => sum + pair.f2Hz, 0) / formantPairs.length : null,
    formantFrameCount: formantPairs.length,
    vowelSpaceCentroidF1Hz: formantPairs.length > 0 ? formantPairs.reduce((sum, pair) => sum + pair.f1Hz, 0) / formantPairs.length : null,
    vowelSpaceCentroidF2Hz: formantPairs.length > 0 ? formantPairs.reduce((sum, pair) => sum + pair.f2Hz, 0) / formantPairs.length : null,
    vowelSpaceSpread: formantPairs.length > 1
      ? (() => {
        const centroidF1 = formantPairs.reduce((sum, pair) => sum + pair.f1Hz, 0) / formantPairs.length;
        const centroidF2 = formantPairs.reduce((sum, pair) => sum + pair.f2Hz, 0) / formantPairs.length;
        return formantPairs.reduce((sum, pair) => {
          const deltaF1 = pair.f1Hz - centroidF1;
          const deltaF2 = pair.f2Hz - centroidF2;
          return sum + Math.sqrt((deltaF1 * deltaF1) + (deltaF2 * deltaF2));
        }, 0) / formantPairs.length;
      })()
      : null,
    sampleRateHz: analysis.sampleRate,
    algorithmVersion: analysis.config.algorithmVersion,
    analysisWindowSec: analysis.config.analysisWindowSec,
    frameStepSec: analysis.config.frameStepSec,
    hotspotCount: hotspots.length,
    ...(hotspots.length > 0 ? { hotspots } : {}),
  };

  const diagnostics = collectAcousticDiagnostics(summary);
  if (diagnostics.length > 0) {
    summary.diagnostics = diagnostics;
  }

  return summary;
}