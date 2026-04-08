import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { AcousticAnalysisService } from '../services/acoustic/AcousticAnalysisService';
import type { AcousticFeatureResult, AcousticOverlayMode } from '../utils/acousticOverlayTypes';
import type { WaveformDisplayMode } from '../utils/waveformDisplayMode';
import type {
  AcousticOverlayVisibleSummary,
  SpectrogramHoverReadout,
  WaveformHoverReadout,
} from './transcriptionWaveformBridge.types';
import {
  buildAcousticPath,
  buildSpectrogramHoverReadout,
  clampAcousticValue,
  resolveNearestAcousticFrame,
} from './waveformAcousticOverlay.utils';

interface UseWaveformAcousticOverlayInput {
  selectedMediaUrl: string | undefined;
  mediaId?: string;
  acousticOverlayMode: AcousticOverlayMode;
  waveformDisplayMode: WaveformDisplayMode;
  containerWidth: number;
  waveformScrollLeft: number;
  zoomPxPerSec: number;
  hoverTime: { time: number; x: number; y: number } | null;
  playerDuration: number;
  seekTo: (timeSec: number) => void;
}

interface UseWaveformAcousticOverlayResult {
  acousticOverlayViewportWidth: number;
  acousticOverlayF0Path: string | null;
  acousticOverlayIntensityPath: string | null;
  acousticOverlayVisibleSummary: AcousticOverlayVisibleSummary | null;
  acousticOverlayLoading: boolean;
  waveformHoverReadout: WaveformHoverReadout | null;
  spectrogramHoverReadout: SpectrogramHoverReadout | null;
  handleSpectrogramMouseMove: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleSpectrogramMouseLeave: () => void;
  handleSpectrogramClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
}

export function useWaveformAcousticOverlay(input: UseWaveformAcousticOverlayInput): UseWaveformAcousticOverlayResult {
  const [acousticAnalysis, setAcousticAnalysis] = useState<AcousticFeatureResult | null>(null);
  const [acousticOverlayLoading, setAcousticOverlayLoading] = useState(false);
  const [spectrogramHoverReadout, setSpectrogramHoverReadout] = useState<SpectrogramHoverReadout | null>(null);

  useEffect(() => {
    if (!input.selectedMediaUrl) {
      setAcousticAnalysis(null);
      setAcousticOverlayLoading(false);
      return;
    }
    const shouldAnalyze = input.acousticOverlayMode !== 'none' || input.waveformDisplayMode !== 'waveform';
    if (!shouldAnalyze) {
      setAcousticAnalysis(null);
      setAcousticOverlayLoading(false);
      return;
    }

    const service = AcousticAnalysisService.getInstance();
    const mediaKey = input.mediaId ?? input.selectedMediaUrl;
    let cancelled = false;
    setAcousticOverlayLoading(true);
    setAcousticAnalysis(null);

    service.analyzeMedia({ mediaKey, mediaUrl: input.selectedMediaUrl }).then((result) => {
      if (cancelled) return;
      setAcousticAnalysis(result);
    }).catch(() => {
      if (cancelled) return;
      setAcousticAnalysis(null);
    }).finally(() => {
      if (cancelled) return;
      setAcousticOverlayLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [input.acousticOverlayMode, input.mediaId, input.selectedMediaUrl, input.waveformDisplayMode]);

  const acousticOverlayViewportWidth = input.containerWidth;
  const { acousticOverlayF0Path, acousticOverlayIntensityPath, acousticOverlayVisibleSummary } = useMemo(() => {
    if (!acousticAnalysis || input.acousticOverlayMode === 'none' || input.zoomPxPerSec <= 0) {
      return {
        acousticOverlayF0Path: null,
        acousticOverlayIntensityPath: null,
        acousticOverlayVisibleSummary: null,
      };
    }

    const viewportWidth = Math.max(1, acousticOverlayViewportWidth);
    const visibleStartSec = Math.max(0, input.waveformScrollLeft / input.zoomPxPerSec);
    const visibleEndSec = Math.max(visibleStartSec, (input.waveformScrollLeft + viewportWidth) / input.zoomPxPerSec);
    const framePaddingSec = acousticAnalysis.config.frameStepSec * 2;
    const visibleFrames = acousticAnalysis.frames.filter((frame) => (
      frame.timeSec >= visibleStartSec - framePaddingSec
      && frame.timeSec <= visibleEndSec + framePaddingSec
    ));

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

    const f0Path = input.acousticOverlayMode === 'f0' || input.acousticOverlayMode === 'both'
      ? buildAcousticPath(visibleFrames.map((frame) => {
        if (frame.f0Hz == null) {
          return { x: frame.timeSec * input.zoomPxPerSec - input.waveformScrollLeft, y: null };
        }
        const normalized = 1 - ((clampAcousticValue(frame.f0Hz, f0Min, f0Max) - f0Min) / f0Span);
        return {
          x: frame.timeSec * input.zoomPxPerSec - input.waveformScrollLeft,
          y: topPadding + normalized * drawableHeight,
        };
      }))
      : null;

    const intensityPath = input.acousticOverlayMode === 'intensity' || input.acousticOverlayMode === 'both'
      ? buildAcousticPath(visibleFrames.map((frame) => {
        const normalized = 1 - ((clampAcousticValue(frame.intensityDb, intensityMin, intensityMax) - intensityMin) / intensitySpan);
        return {
          x: frame.timeSec * input.zoomPxPerSec - input.waveformScrollLeft,
          y: topPadding + normalized * drawableHeight,
        };
      }))
      : null;

    const voicedFrames = visibleFrames.filter((frame) => frame.f0Hz != null);
    const f0MeanHz = voicedFrames.length > 0
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
  }, [acousticAnalysis, acousticOverlayViewportWidth, input.acousticOverlayMode, input.waveformScrollLeft, input.zoomPxPerSec]);

  const waveformHoverReadout = useMemo(() => {
    if (!input.hoverTime || !acousticAnalysis) return null;
    const nearestFrame = resolveNearestAcousticFrame(acousticAnalysis, input.hoverTime.time);
    return {
      timeSec: input.hoverTime.time,
      f0Hz: nearestFrame?.f0Hz ?? null,
      intensityDb: nearestFrame?.intensityDb ?? null,
    };
  }, [acousticAnalysis, input.hoverTime]);

  const updateSpectrogramReadout = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (input.waveformDisplayMode === 'waveform' || input.zoomPxPerSec <= 0 || input.playerDuration <= 0) {
      setSpectrogramHoverReadout(null);
      return null;
    }
    const nextReadout = buildSpectrogramHoverReadout({
      event,
      waveformDisplayMode: input.waveformDisplayMode,
      zoomPxPerSec: input.zoomPxPerSec,
      playerDuration: input.playerDuration,
      waveformScrollLeft: input.waveformScrollLeft,
      acousticAnalysis,
    });
    if (!nextReadout) {
      setSpectrogramHoverReadout(null);
      return null;
    }
    setSpectrogramHoverReadout(nextReadout);
    return nextReadout;
  }, [acousticAnalysis, input.playerDuration, input.waveformDisplayMode, input.waveformScrollLeft, input.zoomPxPerSec]);

  const handleSpectrogramMouseMove = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    updateSpectrogramReadout(event);
  }, [updateSpectrogramReadout]);

  const handleSpectrogramMouseLeave = useCallback(() => {
    setSpectrogramHoverReadout(null);
  }, []);

  const handleSpectrogramClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const nextReadout = updateSpectrogramReadout(event);
    if (!nextReadout) return;
    input.seekTo(nextReadout.timeSec);
  }, [input, updateSpectrogramReadout]);

  return {
    acousticOverlayViewportWidth,
    acousticOverlayF0Path,
    acousticOverlayIntensityPath,
    acousticOverlayVisibleSummary,
    acousticOverlayLoading,
    waveformHoverReadout,
    spectrogramHoverReadout,
    handleSpectrogramMouseMove,
    handleSpectrogramMouseLeave,
    handleSpectrogramClick,
  };
}
