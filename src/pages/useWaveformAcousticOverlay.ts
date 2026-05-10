import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { AcousticAnalysisService } from '../app/transcriptionServicesPageAccess';
import type { AcousticFeatureResult, AcousticOverlayMode } from '../utils/acousticOverlayTypes';
import type { WaveformDisplayMode } from '../utils/waveformDisplayMode';
import type {
  AcousticOverlayVisibleSummary,
  SpectrogramHoverReadout,
  WaveformHoverReadout,
} from './transcriptionWaveformBridge.types';
import {
  buildAcousticOverlayVisiblePaths,
  buildSpectrogramHoverReadout,
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

export function useWaveformAcousticOverlay(
  input: UseWaveformAcousticOverlayInput,
): UseWaveformAcousticOverlayResult {
  const [acousticAnalysis, setAcousticAnalysis] = useState<AcousticFeatureResult | null>(null);
  const [acousticOverlayLoading, setAcousticOverlayLoading] = useState(false);
  const [spectrogramHoverReadout, setSpectrogramHoverReadout] =
    useState<SpectrogramHoverReadout | null>(null);

  useEffect(() => {
    if (input.selectedMediaUrl === undefined || input.selectedMediaUrl.length === 0) {
      setAcousticAnalysis(null);
      setAcousticOverlayLoading(false);
      return;
    }
    const shouldAnalyze =
      input.acousticOverlayMode !== 'none' || input.waveformDisplayMode !== 'waveform';
    if (!shouldAnalyze) {
      setAcousticAnalysis(null);
      setAcousticOverlayLoading(false);
      return;
    }

    const service = AcousticAnalysisService.getInstance();
    const mediaKey = input.mediaId ?? input.selectedMediaUrl;
    const controller = new AbortController();
    setAcousticOverlayLoading(true);
    setAcousticAnalysis(null);

    service
      .analyzeMedia({ mediaKey, mediaUrl: input.selectedMediaUrl, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setAcousticAnalysis(result);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setAcousticAnalysis(null);
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setAcousticOverlayLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [input.acousticOverlayMode, input.mediaId, input.selectedMediaUrl, input.waveformDisplayMode]);

  const acousticOverlayViewportWidth = input.containerWidth;
  const { acousticOverlayF0Path, acousticOverlayIntensityPath, acousticOverlayVisibleSummary } =
    useMemo(() => {
      if (!acousticAnalysis || input.acousticOverlayMode === 'none' || input.zoomPxPerSec <= 0) {
        return {
          acousticOverlayF0Path: null,
          acousticOverlayIntensityPath: null,
          acousticOverlayVisibleSummary: null,
        };
      }
      return buildAcousticOverlayVisiblePaths({
        acousticAnalysis,
        acousticOverlayMode: input.acousticOverlayMode,
        zoomPxPerSec: input.zoomPxPerSec,
        waveformScrollLeft: input.waveformScrollLeft,
        acousticOverlayViewportWidth,
      });
    }, [
      acousticAnalysis,
      acousticOverlayViewportWidth,
      input.acousticOverlayMode,
      input.waveformScrollLeft,
      input.zoomPxPerSec,
    ]);

  const waveformHoverReadout = useMemo(() => {
    if (!input.hoverTime || !acousticAnalysis) return null;
    const nearestFrame = resolveNearestAcousticFrame(acousticAnalysis, input.hoverTime.time);
    return {
      timeSec: input.hoverTime.time,
      f0Hz: nearestFrame?.f0Hz ?? null,
      intensityDb: nearestFrame?.intensityDb ?? null,
    };
  }, [acousticAnalysis, input.hoverTime]);

  const updateSpectrogramReadout = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (
        input.waveformDisplayMode === 'waveform' ||
        input.zoomPxPerSec <= 0 ||
        input.playerDuration <= 0
      ) {
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
    },
    [
      acousticAnalysis,
      input.playerDuration,
      input.waveformDisplayMode,
      input.waveformScrollLeft,
      input.zoomPxPerSec,
    ],
  );

  const handleSpectrogramMouseMove = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      updateSpectrogramReadout(event);
    },
    [updateSpectrogramReadout],
  );

  const handleSpectrogramMouseLeave = useCallback(() => {
    setSpectrogramHoverReadout(null);
  }, []);

  const handleSpectrogramClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const nextReadout = updateSpectrogramReadout(event);
      if (!nextReadout) return;
      input.seekTo(nextReadout.timeSec);
    },
    [input, updateSpectrogramReadout],
  );

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
