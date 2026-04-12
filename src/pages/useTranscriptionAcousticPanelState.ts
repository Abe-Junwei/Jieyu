import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { AcousticInspectorReadout, VadCacheStatus } from '../contexts/AiPanelContext';
import { AcousticAnalysisService } from '../services/acoustic/AcousticAnalysisService';
import type { AcousticAnalysisConfig } from '../utils/acousticOverlayTypes';
import type { DeferredTranscriptionAiRuntimeState } from './TranscriptionPage.AssistantBridge';
import type { SpectrogramHoverReadout, WaveformHoverReadout } from './transcriptionWaveformBridge.types';

type UseTranscriptionAcousticPanelStateInput = {
  deferredAiRuntime: DeferredTranscriptionAiRuntimeState;
  setDeferredAiRuntime: Dispatch<SetStateAction<DeferredTranscriptionAiRuntimeState>>;
  setAcousticProviderPreference: Dispatch<SetStateAction<string | null>>;
  selectedTimelineMediaId?: string;
  selectedMediaUrl?: string | null;
  waveformHoverReadout: WaveformHoverReadout | null;
  spectrogramHoverReadout: SpectrogramHoverReadout | null;
  acousticProviderPreference: string | null;
  vadCacheStatus: VadCacheStatus | null | undefined;
};

export function useTranscriptionAcousticPanelState({
  deferredAiRuntime,
  setDeferredAiRuntime,
  setAcousticProviderPreference,
  selectedTimelineMediaId,
  selectedMediaUrl,
  waveformHoverReadout,
  spectrogramHoverReadout,
  acousticProviderPreference,
  vadCacheStatus,
}: UseTranscriptionAcousticPanelStateInput) {
  const waveformAcousticRuntimeStatus = deferredAiRuntime.acousticRuntimeStatus?.state === 'loading'
    ? deferredAiRuntime.acousticRuntimeStatus
    : undefined;
  const waveformVadCacheStatus = vadCacheStatus?.state === 'warming'
    ? vadCacheStatus
    : undefined;
  const bottomToolbarAcousticRuntimeStatus = deferredAiRuntime.acousticRuntimeStatus?.state === 'error'
    ? deferredAiRuntime.acousticRuntimeStatus
    : undefined;
  // 时间轴底栏保持清爽，仅在 AI 面板内承载错误细节 | Keep timeline footer clean; error details stay in AI panel
  const showBottomToolbarAiProgress = false;

  const [pinnedInspector, setPinnedInspector] = useState<AcousticInspectorReadout | null>(null);
  const [selectedHotspotTimeSec, setSelectedHotspotTimeSec] = useState<number | null>(null);
  const [acousticConfigOverride, setAcousticConfigOverride] = useState<Partial<AcousticAnalysisConfig> | null>(null);
  const activeAcousticHotspots = deferredAiRuntime.acousticSummary?.hotspots ?? [];

  useEffect(() => {
    setSelectedHotspotTimeSec(null);
    setPinnedInspector(null);
  }, [selectedTimelineMediaId, selectedMediaUrl]);

  useEffect(() => {
    if (selectedHotspotTimeSec == null) return;
    if (deferredAiRuntime.acousticRuntimeStatus?.state === 'loading') {
      return;
    }
    if (deferredAiRuntime.acousticSummary == null) {
      setSelectedHotspotTimeSec(null);
      return;
    }
    const stillExists = activeAcousticHotspots.some((hotspot) => Math.abs(hotspot.timeSec - selectedHotspotTimeSec) <= 0.01);
    if (!stillExists) {
      setSelectedHotspotTimeSec(null);
    }
  }, [activeAcousticHotspots, deferredAiRuntime.acousticRuntimeStatus?.state, deferredAiRuntime.acousticSummary, selectedHotspotTimeSec]);

  const acousticInspector = useMemo<AcousticInspectorReadout | null>(() => {
    const activeReadout = spectrogramHoverReadout
      ? {
          source: 'spectrogram' as const,
          timeSec: spectrogramHoverReadout.timeSec,
          frequencyHz: spectrogramHoverReadout.frequencyHz,
          f0Hz: spectrogramHoverReadout.f0Hz,
          intensityDb: spectrogramHoverReadout.intensityDb,
        }
      : waveformHoverReadout
        ? {
            source: 'waveform' as const,
            timeSec: waveformHoverReadout.timeSec,
            f0Hz: waveformHoverReadout.f0Hz,
            intensityDb: waveformHoverReadout.intensityDb,
          }
        : null;

    if (!activeReadout) return null;

    const hotspots = deferredAiRuntime.acousticSummary?.hotspots ?? [];
    const nearestHotspot = hotspots
      .map((hotspot) => ({ hotspot, distance: Math.abs(hotspot.timeSec - activeReadout.timeSec) }))
      .sort((left, right) => left.distance - right.distance)[0];
    const matchedHotspot = nearestHotspot && nearestHotspot.distance <= 0.2 ? nearestHotspot.hotspot : null;
    const selectionStart = deferredAiRuntime.acousticSummary?.selectionStartSec;
    const selectionEnd = deferredAiRuntime.acousticSummary?.selectionEndSec;
    const selectionDuration = deferredAiRuntime.acousticSummary?.durationSec;
    const isTerminalSelection = selectionEnd !== undefined
      && selectionDuration !== undefined
      && Math.abs(selectionEnd - selectionDuration) <= 1e-6;

    return {
      ...activeReadout,
      ...(matchedHotspot ? { matchedHotspotKind: matchedHotspot.kind, matchedHotspotTimeSec: matchedHotspot.timeSec } : {}),
      ...(selectionStart !== undefined && selectionEnd !== undefined
        ? {
            inSelection: activeReadout.timeSec >= selectionStart
              && (isTerminalSelection ? activeReadout.timeSec <= selectionEnd : activeReadout.timeSec < selectionEnd),
          }
        : {}),
    };
  }, [deferredAiRuntime.acousticSummary, spectrogramHoverReadout, waveformHoverReadout]);

  const handlePinInspector = useCallback(() => {
    if (acousticInspector) setPinnedInspector({ ...acousticInspector });
  }, [acousticInspector]);

  const handleClearPinnedInspector = () => {
    setPinnedInspector(null);
  };

  const handleSelectHotspot = (timeSec: number | null) => {
    setSelectedHotspotTimeSec(timeSec);
  };

  const handleChangeAcousticConfig = useCallback((
    config: Partial<AcousticAnalysisConfig>,
    options?: { replace?: boolean },
  ) => {
    setAcousticConfigOverride((prev) => {
      if (options?.replace) {
        return { ...config };
      }
      return { ...(prev ?? {}), ...config };
    });
  }, []);

  const handleResetAcousticConfig = useCallback(() => {
    setAcousticConfigOverride(null);
  }, []);

  const handleChangeAcousticProvider = useCallback((providerId: string | null) => {
    setAcousticProviderPreference(providerId);
  }, [setAcousticProviderPreference]);

  const handleRefreshAcousticProviderState = useCallback(() => {
    const service = AcousticAnalysisService.getInstance();
    const nextProviderState = service.resolveProviderState(acousticProviderPreference);
    setDeferredAiRuntime((previous) => ({
      ...previous,
      acousticProviderState: nextProviderState,
    }));
  }, [acousticProviderPreference, setDeferredAiRuntime]);

  return {
    waveformAcousticRuntimeStatus,
    waveformVadCacheStatus,
    bottomToolbarAcousticRuntimeStatus,
    showBottomToolbarAiProgress,
    pinnedInspector,
    selectedHotspotTimeSec,
    acousticConfigOverride,
    acousticInspector,
    handlePinInspector,
    handleClearPinnedInspector,
    handleSelectHotspot,
    handleChangeAcousticConfig,
    handleResetAcousticConfig,
    handleChangeAcousticProvider,
    handleRefreshAcousticProviderState,
  };
}
