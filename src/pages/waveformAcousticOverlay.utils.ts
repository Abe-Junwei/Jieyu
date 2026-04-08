import type { MouseEvent as ReactMouseEvent } from 'react';
import type { AcousticFeatureResult, AcousticFrame } from '../utils/acousticOverlayTypes';
import type { SpectrogramHoverReadout } from './transcriptionWaveformBridge.types';

export function clampAcousticValue(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function buildAcousticPath(segments: Array<{ x: number; y: number | null }>): string | null {
  let path = '';
  let segmentStarted = false;
  for (const point of segments) {
    if (!Number.isFinite(point.x) || point.y == null || !Number.isFinite(point.y)) {
      segmentStarted = false;
      continue;
    }
    path += `${segmentStarted ? ' L ' : 'M '}${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    segmentStarted = true;
  }
  return path ? path.trim() : null;
}

export function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + (hz / 700));
}

export function melToHz(mel: number): number {
  return 700 * ((10 ** (mel / 2595)) - 1);
}

export function resolveNearestAcousticFrame(result: AcousticFeatureResult | null, timeSec: number): AcousticFrame | null {
  if (!result || result.frames.length === 0) return null;
  const frameStepSec = result.config.frameStepSec;
  const analysisWindowHalfSec = result.config.analysisWindowSec / 2;
  const approximateIndex = Math.max(
    0,
    Math.min(result.frames.length - 1, Math.round((timeSec - analysisWindowHalfSec) / frameStepSec)),
  );
  let nearestFrame = result.frames[approximateIndex] ?? null;
  let bestDistance = nearestFrame ? Math.abs(nearestFrame.timeSec - timeSec) : Number.POSITIVE_INFINITY;
  for (let index = Math.max(0, approximateIndex - 3); index <= Math.min(result.frames.length - 1, approximateIndex + 3); index += 1) {
    const candidate = result.frames[index];
    if (!candidate) continue;
    const distance = Math.abs(candidate.timeSec - timeSec);
    if (distance < bestDistance) {
      nearestFrame = candidate;
      bestDistance = distance;
    }
  }
  return nearestFrame;
}

export function resolveNearestIntensityDb(result: AcousticFeatureResult | null, timeSec: number): number | null {
  const nearestFrame = resolveNearestAcousticFrame(result, timeSec);
  return nearestFrame ? nearestFrame.intensityDb : null;
}

export function buildSpectrogramHoverReadout(input: {
  event: ReactMouseEvent<HTMLDivElement>;
  waveformDisplayMode: 'waveform' | 'spectrogram' | 'split';
  zoomPxPerSec: number;
  playerDuration: number;
  waveformScrollLeft: number;
  acousticAnalysis: AcousticFeatureResult | null;
}): SpectrogramHoverReadout | null {
  if (input.waveformDisplayMode === 'waveform' || input.zoomPxPerSec <= 0 || input.playerDuration <= 0) {
    return null;
  }

  const rect = input.event.currentTarget.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const offsetX = clampAcousticValue(input.event.clientX - rect.left, 0, rect.width);
  const offsetY = clampAcousticValue(input.event.clientY - rect.top, 0, rect.height);
  const timeSec = Math.max(0, Math.min(input.playerDuration, (input.waveformScrollLeft + offsetX) / input.zoomPxPerSec));
  const sampleRate = input.acousticAnalysis?.sampleRate ?? 16000;
  const maxFrequencyHz = sampleRate / 2;
  const melMax = hzToMel(maxFrequencyHz);
  const melValue = (1 - (offsetY / rect.height)) * melMax;
  const frequencyHz = clampAcousticValue(melToHz(melValue), 0, maxFrequencyHz);

  return {
    timeSec,
    frequencyHz,
    f0Hz: resolveNearestAcousticFrame(input.acousticAnalysis, timeSec)?.f0Hz ?? null,
    intensityDb: resolveNearestIntensityDb(input.acousticAnalysis, timeSec),
  };
}