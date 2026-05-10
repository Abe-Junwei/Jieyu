import type { MouseEvent as ReactMouseEvent } from 'react';
import type {
  AcousticFeatureResult,
  AcousticFrame,
  AcousticOverlayMode,
} from '../utils/acousticOverlayTypes';
import type { SpectrogramHoverReadout } from './transcriptionWaveformBridge.types';
import type { AcousticOverlayVisibleSummary } from './transcriptionWaveformBridge.types';

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
  return path.length > 0 ? path.trim() : null;
}

function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

function melToHz(mel: number): number {
  return 700 * (10 ** (mel / 2595) - 1);
}

export function lowerBoundFrameTime(
  frames: AcousticFeatureResult['frames'],
  targetTimeSec: number,
): number {
  let lo = 0;
  let hi = frames.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const frame = frames[mid];
    if (!frame || frame.timeSec < targetTimeSec) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

export function buildAcousticOverlayVisiblePaths(input: {
  acousticAnalysis: AcousticFeatureResult;
  acousticOverlayMode: AcousticOverlayMode;
  zoomPxPerSec: number;
  waveformScrollLeft: number;
  acousticOverlayViewportWidth: number;
}): {
  acousticOverlayF0Path: string | null;
  acousticOverlayIntensityPath: string | null;
  acousticOverlayVisibleSummary: AcousticOverlayVisibleSummary | null;
} {
  const {
    acousticAnalysis,
    acousticOverlayMode,
    zoomPxPerSec,
    waveformScrollLeft,
    acousticOverlayViewportWidth,
  } = input;
  if (acousticOverlayMode === 'none' || zoomPxPerSec <= 0) {
    return {
      acousticOverlayF0Path: null,
      acousticOverlayIntensityPath: null,
      acousticOverlayVisibleSummary: null,
    };
  }

  const viewportWidth = Math.max(1, acousticOverlayViewportWidth);
  const visibleStartSec = Math.max(0, waveformScrollLeft / zoomPxPerSec);
  const visibleEndSec = Math.max(
    visibleStartSec,
    (waveformScrollLeft + viewportWidth) / zoomPxPerSec,
  );
  const framePaddingSec = acousticAnalysis.config.frameStepSec * 2;
  const frameWindowStart = visibleStartSec - framePaddingSec;
  const frameWindowEnd = visibleEndSec + framePaddingSec;
  const frames = acousticAnalysis.frames;
  const visibleStartIndex = lowerBoundFrameTime(frames, frameWindowStart);
  const visibleEndIndex = lowerBoundFrameTime(frames, frameWindowEnd + Number.EPSILON);
  const visibleFrames = frames.slice(visibleStartIndex, visibleEndIndex);

  if (visibleFrames.length === 0) {
    return {
      acousticOverlayF0Path: null,
      acousticOverlayIntensityPath: null,
      acousticOverlayVisibleSummary: null,
    };
  }

  const f0Min = acousticAnalysis.config.pitchFloorHz;
  const f0Max = acousticAnalysis.config.pitchCeilingHz;
  const f0Span = Math.max(1, f0Max - f0Min);
  const intensityMin = Math.min(acousticAnalysis.summary.intensityMinDb ?? -60, -24);
  const intensityMax = Math.max(acousticAnalysis.summary.intensityPeakDb ?? 0, intensityMin + 6);
  const intensitySpan = Math.max(1, intensityMax - intensityMin);
  const topPadding = 10;
  const drawableHeight = 80;

  const f0Path =
    acousticOverlayMode === 'f0' || acousticOverlayMode === 'both'
      ? buildAcousticPath(
          visibleFrames.map((frame) => {
            if (frame.f0Hz == null) {
              return {
                x: frame.timeSec * zoomPxPerSec - waveformScrollLeft,
                y: null,
              };
            }
            const normalized = 1 - (clampAcousticValue(frame.f0Hz, f0Min, f0Max) - f0Min) / f0Span;
            return {
              x: frame.timeSec * zoomPxPerSec - waveformScrollLeft,
              y: topPadding + normalized * drawableHeight,
            };
          }),
        )
      : null;

  const intensityPath =
    acousticOverlayMode === 'intensity' || acousticOverlayMode === 'both'
      ? buildAcousticPath(
          visibleFrames.map((frame) => {
            const normalized =
              1 -
              (clampAcousticValue(frame.intensityDb, intensityMin, intensityMax) - intensityMin) /
                intensitySpan;
            return {
              x: frame.timeSec * zoomPxPerSec - waveformScrollLeft,
              y: topPadding + normalized * drawableHeight,
            };
          }),
        )
      : null;

  const voicedFrames = visibleFrames.filter((frame) => frame.f0Hz != null);
  const f0MeanHz =
    voicedFrames.length > 0
      ? voicedFrames.reduce((sum, frame) => sum + (frame.f0Hz ?? 0), 0) / voicedFrames.length
      : null;
  const intensityPeakDb = visibleFrames.reduce<number | null>((peak, frame) => {
    if (!Number.isFinite(frame.intensityDb)) return peak;
    if (peak == null) return frame.intensityDb;
    return Math.max(peak, frame.intensityDb);
  }, null);

  return {
    acousticOverlayF0Path: f0Path,
    acousticOverlayIntensityPath: intensityPath,
    acousticOverlayVisibleSummary: {
      f0MeanHz,
      intensityPeakDb,
      voicedFrameCount: voicedFrames.length,
      frameCount: visibleFrames.length,
    },
  };
}

export function resolveNearestAcousticFrame(
  result: AcousticFeatureResult | null,
  timeSec: number,
): AcousticFrame | null {
  if (!result || result.frames.length === 0) return null;
  const frameStepSec = result.config.frameStepSec;
  const analysisWindowHalfSec = result.config.analysisWindowSec / 2;
  const approximateIndex = Math.max(
    0,
    Math.min(
      result.frames.length - 1,
      Math.round((timeSec - analysisWindowHalfSec) / frameStepSec),
    ),
  );
  let nearestFrame = result.frames[approximateIndex] ?? null;
  let bestDistance = nearestFrame
    ? Math.abs(nearestFrame.timeSec - timeSec)
    : Number.POSITIVE_INFINITY;
  for (
    let index = Math.max(0, approximateIndex - 3);
    index <= Math.min(result.frames.length - 1, approximateIndex + 3);
    index += 1
  ) {
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

function resolveNearestIntensityDb(
  result: AcousticFeatureResult | null,
  timeSec: number,
): number | null {
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
  if (
    input.waveformDisplayMode === 'waveform' ||
    input.zoomPxPerSec <= 0 ||
    input.playerDuration <= 0
  ) {
    return null;
  }

  const rect = input.event.currentTarget.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const offsetX = clampAcousticValue(input.event.clientX - rect.left, 0, rect.width);
  const offsetY = clampAcousticValue(input.event.clientY - rect.top, 0, rect.height);
  const timeSec = Math.max(
    0,
    Math.min(input.playerDuration, (input.waveformScrollLeft + offsetX) / input.zoomPxPerSec),
  );
  const sampleRate = input.acousticAnalysis?.sampleRate ?? 16000;
  const maxFrequencyHz = sampleRate / 2;
  const melMax = hzToMel(maxFrequencyHz);
  const melValue = (1 - offsetY / rect.height) * melMax;
  const frequencyHz = clampAcousticValue(melToHz(melValue), 0, maxFrequencyHz);

  return {
    timeSec,
    frequencyHz,
    f0Hz: resolveNearestAcousticFrame(input.acousticAnalysis, timeSec)?.f0Hz ?? null,
    intensityDb: resolveNearestIntensityDb(input.acousticAnalysis, timeSec),
  };
}
