import type {
  AcousticAnalysisConfig,
  AcousticAnalysisRequest,
  AcousticAnalysisSummary,
  AcousticFeatureResult,
  AcousticFrame,
  AcousticHotspot,
} from '../../utils/acousticOverlayTypes';

const EPSILON = 1e-8;
const SPECTRAL_ROLLOFF_RATIO = 0.85;
const PRE_EMPHASIS_ALPHA = 0.97;
const FORMANT_MIN_HZ = 150;
const FORMANT_MAX_HZ = 4200;
const FORMANT_MIN_SEPARATION_HZ = 180;
const hannWindowCache = new Map<number, Float32Array>();

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function nextPowerOfTwo(value: number): number {
  let result = 1;
  while (result < value) {
    result <<= 1;
  }
  return result;
}

function getHannWindow(size: number): Float32Array {
  const cached = hannWindowCache.get(size);
  if (cached) return cached;

  const window = new Float32Array(size);
  if (size === 1) {
    window[0] = 1;
  } else {
    for (let index = 0; index < size; index += 1) {
      window[index] = 0.5 * (1 - Math.cos((2 * Math.PI * index) / (size - 1)));
    }
  }

  hannWindowCache.set(size, window);
  return window;
}

function computeRms(frame: Float32Array): number {
  let sumSquares = 0;
  for (let index = 0; index < frame.length; index += 1) {
    const sample = frame[index] ?? 0;
    sumSquares += sample * sample;
  }
  return Math.sqrt(sumSquares / Math.max(frame.length, 1));
}

function computeIntensityDb(rms: number): number {
  return 20 * Math.log10(Math.max(rms, EPSILON));
}

function computeZeroCrossingRate(frame: Float32Array): number {
  if (frame.length < 2) return 0;

  let crossingCount = 0;
  for (let index = 1; index < frame.length; index += 1) {
    const previous = frame[index - 1] ?? 0;
    const current = frame[index] ?? 0;
    if ((previous >= 0 && current < 0) || (previous < 0 && current >= 0)) {
      crossingCount += 1;
    }
  }

  return crossingCount / (frame.length - 1);
}

function computeMagnitudeSpectrum(frame: Float32Array): { magnitudes: Float32Array; fftSize: number } {
  const fftSize = nextPowerOfTwo(frame.length);
  const real = new Float32Array(fftSize);
  const imag = new Float32Array(fftSize);
  const window = getHannWindow(frame.length);

  for (let index = 0; index < frame.length; index += 1) {
    real[index] = (frame[index] ?? 0) * (window[index] ?? 1);
  }

  for (let index = 1, reversed = 0; index < fftSize; index += 1) {
    let bit = fftSize >> 1;
    while (reversed & bit) {
      reversed ^= bit;
      bit >>= 1;
    }
    reversed ^= bit;

    if (index < reversed) {
      const tempReal = real[index] ?? 0;
      const tempImag = imag[index] ?? 0;
      real[index] = real[reversed] ?? 0;
      imag[index] = imag[reversed] ?? 0;
      real[reversed] = tempReal;
      imag[reversed] = tempImag;
    }
  }

  for (let size = 2; size <= fftSize; size <<= 1) {
    const halfSize = size >> 1;
    const phaseStep = (-2 * Math.PI) / size;
    for (let start = 0; start < fftSize; start += size) {
      for (let offset = 0; offset < halfSize; offset += 1) {
        const evenIndex = start + offset;
        const oddIndex = evenIndex + halfSize;
        const angle = phaseStep * offset;
        const twiddleReal = Math.cos(angle);
        const twiddleImag = Math.sin(angle);
        const oddReal = real[oddIndex] ?? 0;
        const oddImag = imag[oddIndex] ?? 0;
        const tempReal = (twiddleReal * oddReal) - (twiddleImag * oddImag);
        const tempImag = (twiddleReal * oddImag) + (twiddleImag * oddReal);
        const evenReal = real[evenIndex] ?? 0;
        const evenImag = imag[evenIndex] ?? 0;

        real[oddIndex] = evenReal - tempReal;
        imag[oddIndex] = evenImag - tempImag;
        real[evenIndex] = evenReal + tempReal;
        imag[evenIndex] = evenImag + tempImag;
      }
    }
  }

  const magnitudes = new Float32Array((fftSize >> 1) + 1);
  for (let index = 0; index < magnitudes.length; index += 1) {
    const spectrumReal = real[index] ?? 0;
    const spectrumImag = imag[index] ?? 0;
    magnitudes[index] = Math.sqrt((spectrumReal * spectrumReal) + (spectrumImag * spectrumImag));
  }

  return { magnitudes, fftSize };
}

function computeSpectralDescriptors(frame: Float32Array, sampleRate: number): {
  spectralCentroidHz: number | null;
  spectralRolloffHz: number | null;
  zeroCrossingRate: number | null;
} {
  const zeroCrossingRate = computeZeroCrossingRate(frame);
  const { magnitudes, fftSize } = computeMagnitudeSpectrum(frame);

  let totalMagnitude = 0;
  let weightedFrequencySum = 0;
  for (let index = 0; index < magnitudes.length; index += 1) {
    const magnitude = magnitudes[index] ?? 0;
    const frequency = (index * sampleRate) / fftSize;
    totalMagnitude += magnitude;
    weightedFrequencySum += frequency * magnitude;
  }

  if (totalMagnitude <= EPSILON) {
    return {
      spectralCentroidHz: null,
      spectralRolloffHz: null,
      zeroCrossingRate,
    };
  }

  const centroidHz = weightedFrequencySum / totalMagnitude;
  const rolloffTarget = totalMagnitude * SPECTRAL_ROLLOFF_RATIO;
  let cumulativeMagnitude = 0;
  let rolloffHz = sampleRate / 2;
  for (let index = 0; index < magnitudes.length; index += 1) {
    cumulativeMagnitude += magnitudes[index] ?? 0;
    if (cumulativeMagnitude >= rolloffTarget) {
      rolloffHz = (index * sampleRate) / fftSize;
      break;
    }
  }

  return {
    spectralCentroidHz: centroidHz,
    spectralRolloffHz: rolloffHz,
    zeroCrossingRate,
  };
}

function computeAutocorrelation(input: Float32Array, order: number): Float32Array {
  const autocorrelation = new Float32Array(order + 1);
  for (let lag = 0; lag <= order; lag += 1) {
    let sum = 0;
    for (let index = 0; index + lag < input.length; index += 1) {
      sum += (input[index] ?? 0) * (input[index + lag] ?? 0);
    }
    autocorrelation[lag] = sum;
  }
  return autocorrelation;
}

function computeLpcCoefficients(autocorrelation: Float32Array, order: number): { coefficients: Float32Array; error: number } | null {
  if ((autocorrelation[0] ?? 0) <= EPSILON) return null;

  const coefficients = new Float32Array(order + 1);
  coefficients[0] = 1;
  let predictionError = autocorrelation[0] ?? 0;

  for (let index = 1; index <= order; index += 1) {
    let reflection = autocorrelation[index] ?? 0;
    for (let inner = 1; inner < index; inner += 1) {
      reflection += (coefficients[inner] ?? 0) * (autocorrelation[index - inner] ?? 0);
    }
    reflection = -reflection / Math.max(predictionError, EPSILON);

    const next = coefficients.slice();
    next[index] = reflection;
    for (let inner = 1; inner < index; inner += 1) {
      next[inner] = (coefficients[inner] ?? 0) + reflection * (coefficients[index - inner] ?? 0);
    }

    for (let inner = 1; inner <= index; inner += 1) {
      coefficients[inner] = next[inner] ?? 0;
    }

    predictionError *= 1 - (reflection * reflection);
    if (!Number.isFinite(predictionError) || predictionError <= EPSILON) {
      return null;
    }
  }

  return { coefficients, error: predictionError };
}

function estimateFormants(frame: Float32Array, sampleRate: number): {
  formantF1Hz: number | null;
  formantF2Hz: number | null;
  formantReliability: number | null;
} {
  if (frame.length < 128 || sampleRate < 8_000) {
    return { formantF1Hz: null, formantF2Hz: null, formantReliability: null };
  }

  const emphasized = new Float32Array(frame.length);
  emphasized[0] = frame[0] ?? 0;
  for (let index = 1; index < frame.length; index += 1) {
    emphasized[index] = (frame[index] ?? 0) - (PRE_EMPHASIS_ALPHA * (frame[index - 1] ?? 0));
  }

  const window = getHannWindow(frame.length);
  for (let index = 0; index < emphasized.length; index += 1) {
    emphasized[index] = (emphasized[index] ?? 0) * (window[index] ?? 1);
  }

  const lpcOrder = clamp(Math.floor(sampleRate / 1000) + 8, 10, 16);
  const autocorrelation = computeAutocorrelation(emphasized, lpcOrder);
  const lpc = computeLpcCoefficients(autocorrelation, lpcOrder);
  if (!lpc) {
    return { formantF1Hz: null, formantF2Hz: null, formantReliability: null };
  }

  const spectrumSize = 1024;
  const maxBin = Math.floor(spectrumSize / 2);
  const envelope = new Float32Array(maxBin + 1);
  for (let bin = 0; bin <= maxBin; bin += 1) {
    const omega = (2 * Math.PI * bin) / spectrumSize;
    let real = 1;
    let imag = 0;
    for (let index = 1; index < lpc.coefficients.length; index += 1) {
      const coefficient = lpc.coefficients[index] ?? 0;
      real += coefficient * Math.cos(omega * index);
      imag -= coefficient * Math.sin(omega * index);
    }
    envelope[bin] = 1 / Math.max((real * real) + (imag * imag), EPSILON);
  }

  const minBin = Math.max(1, Math.floor((FORMANT_MIN_HZ * spectrumSize) / sampleRate));
  const maxSearchBin = Math.min(maxBin - 1, Math.ceil((FORMANT_MAX_HZ * spectrumSize) / sampleRate));
  const peaks: Array<{ frequencyHz: number; strength: number }> = [];
  for (let bin = minBin; bin <= maxSearchBin; bin += 1) {
    const current = envelope[bin] ?? 0;
    const previous = envelope[bin - 1] ?? 0;
    const next = envelope[bin + 1] ?? 0;
    if (current > previous && current >= next) {
      peaks.push({
        frequencyHz: (bin * sampleRate) / spectrumSize,
        strength: current,
      });
    }
  }

  if (peaks.length === 0) {
    return { formantF1Hz: null, formantF2Hz: null, formantReliability: null };
  }

  const selected: Array<{ frequencyHz: number; strength: number }> = [];
  for (const peak of [...peaks].sort((left, right) => right.strength - left.strength)) {
    if (selected.every((candidate) => Math.abs(candidate.frequencyHz - peak.frequencyHz) >= FORMANT_MIN_SEPARATION_HZ)) {
      selected.push(peak);
    }
    if (selected.length >= 2) break;
  }

  selected.sort((left, right) => left.frequencyHz - right.frequencyHz);
  const f1 = selected[0]?.frequencyHz ?? null;
  const f2 = selected[1]?.frequencyHz ?? null;
  const normalizedError = 1 - clamp((lpc.error / Math.max(autocorrelation[0] ?? 1, EPSILON)), 0, 1);
  const reliability = clamp(normalizedError * (selected.length / 2), 0, 1);

  return {
    formantF1Hz: f1,
    formantF2Hz: f2,
    formantReliability: selected.length > 0 ? reliability : null,
  };
}

function estimatePitchYin(frame: Float32Array, sampleRate: number, config: AcousticAnalysisConfig): { f0Hz: number | null; reliability: number } {
  const tauMin = Math.max(2, Math.floor(sampleRate / config.pitchCeilingHz));
  const tauMax = Math.min(Math.floor(sampleRate / config.pitchFloorHz), Math.floor(frame.length / 2));

  if (tauMax <= tauMin) {
    return { f0Hz: null, reliability: 0 };
  }

  const difference = new Float32Array(tauMax + 1);
  const cmnd = new Float32Array(tauMax + 1);
  cmnd[0] = 1;

  for (let tau = 1; tau <= tauMax; tau += 1) {
    let sum = 0;
    const limit = frame.length - tau;
    for (let index = 0; index < limit; index += 1) {
      const delta = (frame[index] ?? 0) - (frame[index + tau] ?? 0);
      sum += delta * delta;
    }
    difference[tau] = sum;
  }

  let runningSum = 0;
  for (let tau = 1; tau <= tauMax; tau += 1) {
    runningSum += difference[tau] ?? 0;
    cmnd[tau] = runningSum > 0 ? ((difference[tau] ?? 0) * tau) / runningSum : 1;
  }

  let bestTau = -1;
  for (let tau = tauMin; tau <= tauMax; tau += 1) {
    if ((cmnd[tau] ?? 1) < config.yinThreshold) {
      bestTau = tau;
      while (bestTau + 1 <= tauMax && (cmnd[bestTau + 1] ?? 1) < (cmnd[bestTau] ?? 1)) {
        bestTau += 1;
      }
      break;
    }
  }

  if (bestTau < 0) {
    let minValue = Number.POSITIVE_INFINITY;
    for (let tau = tauMin; tau <= tauMax; tau += 1) {
      const value = cmnd[tau] ?? 1;
      if (value < minValue) {
        minValue = value;
        bestTau = tau;
      }
    }
  }

  if (bestTau < 0) {
    return { f0Hz: null, reliability: 0 };
  }

  const cmndValue = clamp(cmnd[bestTau] ?? 1, 0, 1);
  const reliability = clamp(1 - cmndValue, 0, 1);
  if (reliability <= 0.1) {
    return { f0Hz: null, reliability };
  }

  const previous = cmnd[bestTau - 1] ?? cmndValue;
  const current = cmnd[bestTau] ?? cmndValue;
  const next = cmnd[bestTau + 1] ?? cmndValue;
  const denominator = previous - (2 * current) + next;
  const correction = Math.abs(denominator) > EPSILON ? (previous - next) / (2 * denominator) : 0;
  const refinedTau = clamp(bestTau + correction, tauMin, tauMax);

  return {
    f0Hz: sampleRate / refinedTau,
    reliability,
  };
}

function computeSummary(frames: AcousticFrame[], durationSec: number): AcousticAnalysisSummary {
  const voicedFrames = frames.filter((frame) => frame.f0Hz != null);
  const intensities = frames.map((frame) => frame.intensityDb).filter((value) => Number.isFinite(value));
  const reliabilities = frames.map((frame) => frame.reliability).filter((value) => Number.isFinite(value));
  const f0Values = voicedFrames.map((frame) => frame.f0Hz ?? 0);
  const spectralCentroids = frames
    .map((frame) => frame.spectralCentroidHz)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const spectralRolloffs = frames
    .map((frame) => frame.spectralRolloffHz)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const zeroCrossingRates = frames
    .map((frame) => frame.zeroCrossingRate)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const formantPairs = frames
    .filter((frame) => typeof frame.formantF1Hz === 'number' && Number.isFinite(frame.formantF1Hz)
      && typeof frame.formantF2Hz === 'number' && Number.isFinite(frame.formantF2Hz))
    .map((frame) => ({
      f1Hz: frame.formantF1Hz as number,
      f2Hz: frame.formantF2Hz as number,
    }));

  const f0MinHz = f0Values.length > 0 ? Math.min(...f0Values) : null;
  const f0MaxHz = f0Values.length > 0 ? Math.max(...f0Values) : null;
  const f0MeanHz = f0Values.length > 0 ? f0Values.reduce((sum, value) => sum + value, 0) / f0Values.length : null;
  const intensityMinDb = intensities.length > 0 ? Math.min(...intensities) : null;
  const intensityPeakDb = intensities.length > 0 ? Math.max(...intensities) : null;
  const reliabilityMean = reliabilities.length > 0
    ? reliabilities.reduce((sum, value) => sum + value, 0) / reliabilities.length
    : null;
  const formantF1MeanHz = formantPairs.length > 0
    ? formantPairs.reduce((sum, pair) => sum + pair.f1Hz, 0) / formantPairs.length
    : null;
  const formantF2MeanHz = formantPairs.length > 0
    ? formantPairs.reduce((sum, pair) => sum + pair.f2Hz, 0) / formantPairs.length
    : null;
  const vowelSpaceSpread = formantPairs.length > 1 && formantF1MeanHz != null && formantF2MeanHz != null
    ? formantPairs.reduce((sum, pair) => {
      const deltaF1 = pair.f1Hz - formantF1MeanHz;
      const deltaF2 = pair.f2Hz - formantF2MeanHz;
      return sum + Math.sqrt((deltaF1 * deltaF1) + (deltaF2 * deltaF2));
    }, 0) / formantPairs.length
    : null;

  return {
    selectionStartSec: 0,
    selectionEndSec: durationSec,
    f0MinHz,
    f0MaxHz,
    f0MeanHz,
    intensityMinDb,
    intensityPeakDb,
    reliabilityMean,
    voicedFrameCount: voicedFrames.length,
    frameCount: frames.length,
    spectralCentroidMeanHz: spectralCentroids.length > 0 ? spectralCentroids.reduce((sum, value) => sum + value, 0) / spectralCentroids.length : null,
    spectralRolloffMeanHz: spectralRolloffs.length > 0 ? spectralRolloffs.reduce((sum, value) => sum + value, 0) / spectralRolloffs.length : null,
    zeroCrossingRateMean: zeroCrossingRates.length > 0 ? zeroCrossingRates.reduce((sum, value) => sum + value, 0) / zeroCrossingRates.length : null,
    formantF1MeanHz,
    formantF2MeanHz,
    formantFrameCount: formantPairs.length,
    vowelSpaceCentroidF1Hz: formantF1MeanHz,
    vowelSpaceCentroidF2Hz: formantF2MeanHz,
    vowelSpaceSpread,
  };
}

function buildHotspot(
  kind: AcousticHotspot['kind'],
  frame: AcousticFrame,
  startSec = frame.timeSec,
  endSec = frame.timeSec,
  score = 0,
): AcousticHotspot {
  return {
    kind,
    timeSec: frame.timeSec,
    startSec,
    endSec,
    score: clamp(score, 0, 1),
    ...(frame.f0Hz != null ? { f0Hz: frame.f0Hz } : {}),
    intensityDb: frame.intensityDb,
    reliability: frame.reliability,
  };
}

function computeHotspots(frames: AcousticFrame[]): AcousticHotspot[] {
  if (frames.length === 0) return [];
  if (frames.every((frame) => frame.f0Hz == null && frame.reliability <= 0)) {
    return [];
  }

  const hotspots: AcousticHotspot[] = [];
  const voicedFrames = frames.filter((frame) => frame.f0Hz != null);
  const f0Values = voicedFrames.map((frame) => frame.f0Hz ?? 0);
  const intensityValues = frames.map((frame) => frame.intensityDb).filter((value) => Number.isFinite(value));
  const intensityMin = intensityValues.length > 0 ? Math.min(...intensityValues) : null;
  const intensityMax = intensityValues.length > 0 ? Math.max(...intensityValues) : null;

  if (voicedFrames.length > 0) {
    const peakFrame = voicedFrames.reduce((best, current) => ((current.f0Hz ?? 0) > (best.f0Hz ?? 0) ? current : best), voicedFrames[0]!);
    const voicedMin = Math.min(...f0Values);
    const voicedMax = Math.max(...f0Values);
    const pitchRange = Math.max(voicedMax - voicedMin, 1);
    hotspots.push(buildHotspot('pitch_peak', peakFrame, peakFrame.timeSec, peakFrame.timeSec, ((peakFrame.f0Hz ?? voicedMin) - voicedMin) / pitchRange));

    let bestBreak: { frame: AcousticFrame; score: number } | null = null;
    for (let index = 1; index < voicedFrames.length; index += 1) {
      const previous = voicedFrames[index - 1]!;
      const current = voicedFrames[index]!;
      const diffHz = Math.abs((current.f0Hz ?? 0) - (previous.f0Hz ?? 0));
      const diffSemitones = 12 * Math.log2(Math.max(current.f0Hz ?? 1, EPSILON) / Math.max(previous.f0Hz ?? 1, EPSILON));
      const score = clamp(Math.max(diffHz / 120, Math.abs(diffSemitones) / 6), 0, 1);
      if (!bestBreak || score > bestBreak.score) {
        bestBreak = { frame: current, score };
      }
    }
    if (bestBreak && bestBreak.score >= 0.15) {
      hotspots.push(buildHotspot('pitch_break', bestBreak.frame, bestBreak.frame.timeSec, bestBreak.frame.timeSec, bestBreak.score));
    }
  }

  if (intensityMax != null) {
    const peakFrame = frames.reduce((best, current) => (current.intensityDb > best.intensityDb ? current : best), frames[0]!);
    const intensityRange = Math.max(intensityMax - (intensityMin ?? intensityMax), 1);
    hotspots.push(buildHotspot('intensity_peak', peakFrame, peakFrame.timeSec, peakFrame.timeSec, (peakFrame.intensityDb - (intensityMin ?? peakFrame.intensityDb)) / intensityRange));
  }

  let unstableStart = -1;
  let unstableScoreSum = 0;
  let unstableCount = 0;
  let bestUnstable: AcousticHotspot | null = null;
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index]!;
    const isUnstable = frame.reliability < 0.45;
    if (isUnstable && unstableStart < 0) {
      unstableStart = index;
      unstableScoreSum = 1 - frame.reliability;
      unstableCount = 1;
      continue;
    }
    if (isUnstable) {
      unstableScoreSum += 1 - frame.reliability;
      unstableCount += 1;
      continue;
    }
    if (unstableStart >= 0) {
      const startFrame = frames[unstableStart]!;
      const endFrame = frames[index - 1]!;
      const avgScore = unstableCount > 0 ? unstableScoreSum / unstableCount : 0;
      const candidate = buildHotspot('unstable_span', startFrame, startFrame.timeSec, endFrame.timeSec, avgScore);
      if (!bestUnstable || candidate.score > bestUnstable.score || (candidate.endSec - candidate.startSec) > (bestUnstable.endSec - bestUnstable.startSec)) {
        bestUnstable = candidate;
      }
      unstableStart = -1;
      unstableScoreSum = 0;
      unstableCount = 0;
    }
  }
  if (unstableStart >= 0) {
    const startFrame = frames[unstableStart]!;
    const endFrame = frames[frames.length - 1]!;
    const avgScore = unstableCount > 0 ? unstableScoreSum / unstableCount : 0;
    const candidate = buildHotspot('unstable_span', startFrame, startFrame.timeSec, endFrame.timeSec, avgScore);
    if (!bestUnstable || candidate.score > bestUnstable.score || (candidate.endSec - candidate.startSec) > (bestUnstable.endSec - bestUnstable.startSec)) {
      bestUnstable = candidate;
    }
  }
  if (bestUnstable && bestUnstable.score >= 0.2) {
    hotspots.push(bestUnstable);
  }

  return hotspots
    .sort((left, right) => right.score - left.score)
    .slice(0, 4);
}

export function computeAcousticAnalysis(request: AcousticAnalysisRequest): AcousticFeatureResult {
  const { pcm, sampleRate, config, mediaKey } = request;
  const windowSize = Math.max(64, Math.round(config.analysisWindowSec * sampleRate));
  const hopSize = Math.max(1, Math.round(config.frameStepSec * sampleRate));
  const frames: AcousticFrame[] = [];

  for (let start = 0; start + windowSize <= pcm.length; start += hopSize) {
    const frame = pcm.subarray(start, start + windowSize);
    const rms = computeRms(frame);
    const intensityDb = computeIntensityDb(rms);
    const timeSec = (start + Math.floor(windowSize / 2)) / sampleRate;

    if (rms < config.silenceRmsThreshold) {
      frames.push({
        timeSec,
        f0Hz: null,
        intensityDb,
        reliability: 0,
        spectralCentroidHz: null,
        spectralRolloffHz: null,
        zeroCrossingRate: null,
        formantF1Hz: null,
        formantF2Hz: null,
        formantReliability: null,
      });
      continue;
    }

    const { f0Hz, reliability } = estimatePitchYin(frame, sampleRate, config);
    const { spectralCentroidHz, spectralRolloffHz, zeroCrossingRate } = computeSpectralDescriptors(frame, sampleRate);
    const { formantF1Hz, formantF2Hz, formantReliability } = reliability >= 0.35
      ? estimateFormants(frame, sampleRate)
      : { formantF1Hz: null, formantF2Hz: null, formantReliability: null };
    frames.push({
      timeSec,
      f0Hz,
      intensityDb,
      reliability,
      spectralCentroidHz,
      spectralRolloffHz,
      zeroCrossingRate,
      formantF1Hz,
      formantF2Hz,
      formantReliability,
    });
  }

  const durationSec = pcm.length / sampleRate;
  const hotspots = computeHotspots(frames);
  return {
    mediaKey,
    sampleRate,
    durationSec,
    config,
    frames,
    hotspots,
    summary: computeSummary(frames, durationSec),
  };
}