import { useEffect, useMemo, useState } from 'react';
import { AcousticAnalysisService } from '../services/acoustic/AcousticAnalysisService';
import type { AcousticRuntimeStatus } from '../contexts/AiPanelContext';
import { buildAcousticPromptSummary, type AcousticPromptSummary } from './transcriptionAcousticSummary';
import {
  buildAcousticPanelDetail,
  deriveAcousticCalibrationStatus,
  type AcousticCalibrationStatus,
  type AcousticPanelDetail,
} from '../utils/acousticPanelDetail';
import type { AcousticAnalysisConfig, AcousticFeatureResult } from '../utils/acousticOverlayTypes';
import type { ResolvedAcousticProviderState } from '../services/acoustic/acousticProviderContract';

interface UseTranscriptionAiAcousticRuntimeInput {
  selectedMediaUrl?: string;
  selectedTimelineMediaId?: string;
  selectionStartSec?: number;
  selectionEndSec?: number;
  seekToTimeRef: React.MutableRefObject<((timeSeconds: number) => void) | undefined>;
  configOverride?: Partial<AcousticAnalysisConfig> | null;
  providerPreference?: string | null;
}

interface UseTranscriptionAiAcousticRuntimeResult {
  acousticRuntimeStatus: AcousticRuntimeStatus;
  acousticSummary: AcousticPromptSummary | null;
  acousticDetail: AcousticPanelDetail | null;
  acousticDetailFullMedia: AcousticPanelDetail | null;
  acousticCalibrationStatus: AcousticCalibrationStatus;
  acousticProviderState: ResolvedAcousticProviderState;
  handleJumpToAcousticHotspot: (timeSec: number) => void;
}

export function useTranscriptionAiAcousticRuntime(
  input: UseTranscriptionAiAcousticRuntimeInput,
): UseTranscriptionAiAcousticRuntimeResult {
  const service = AcousticAnalysisService.getInstance();
  const [acousticAnalysis, setAcousticAnalysis] = useState<AcousticFeatureResult | null>(null);
  const [acousticRuntimeStatus, setAcousticRuntimeStatus] = useState<AcousticRuntimeStatus>({ state: 'idle' });
  const [acousticProviderState, setAcousticProviderState] = useState<ResolvedAcousticProviderState>(() => service.resolveProviderState(input.providerPreference));

  useEffect(() => {
    const providerState = service.resolveProviderState(input.providerPreference);
    setAcousticProviderState(providerState);

    if (!input.selectedMediaUrl) {
      setAcousticAnalysis(null);
      setAcousticRuntimeStatus({ state: 'idle' });
      return;
    }

    const controller = new AbortController();
    const mediaKey = input.selectedTimelineMediaId ?? input.selectedMediaUrl;
    const configPartial = input.configOverride && Object.keys(input.configOverride).length > 0 ? input.configOverride : undefined;
    setAcousticRuntimeStatus({
      state: 'loading',
      phase: 'analyzing',
      progressRatio: 0,
      processedFrames: 0,
      totalFrames: 0,
    });
    service.analyzeMedia({
      mediaKey,
      mediaUrl: input.selectedMediaUrl,
      ...(input.providerPreference ? { providerId: input.providerPreference } : {}),
      signal: controller.signal,
      ...(configPartial ? { config: configPartial } : {}),
      onProgress: (progress) => {
        if (controller.signal.aborted) return;
        setAcousticRuntimeStatus({
          state: 'loading',
          phase: progress.phase,
          progressRatio: progress.ratio,
          processedFrames: progress.processedFrames,
          totalFrames: progress.totalFrames,
        });
      },
    }).then((result) => {
      if (controller.signal.aborted) return;
      setAcousticAnalysis(result);
      setAcousticRuntimeStatus((previous) => ({
        state: 'ready',
        phase: 'done',
        progressRatio: previous.progressRatio ?? 1,
        processedFrames: previous.processedFrames,
        totalFrames: previous.totalFrames,
      }));
    }).catch(() => {
      if (controller.signal.aborted) return;
      setAcousticAnalysis(null);
      setAcousticRuntimeStatus({ state: 'error' });
    });
    return () => {
      controller.abort();
    };
  }, [input.selectedMediaUrl, input.selectedTimelineMediaId, input.configOverride, input.providerPreference, service]);

  const acousticSummary = useMemo(() => buildAcousticPromptSummary(
    acousticAnalysis,
    input.selectionStartSec,
    input.selectionEndSec,
  ), [acousticAnalysis, input.selectionEndSec, input.selectionStartSec]);

  const acousticDetail = useMemo(() => buildAcousticPanelDetail(
    acousticAnalysis,
    input.selectionStartSec,
    input.selectionEndSec,
  ), [acousticAnalysis, input.selectionEndSec, input.selectionStartSec]);

  const acousticDetailFullMedia = useMemo(() => {
    if (!acousticAnalysis) return null;
    return buildAcousticPanelDetail(acousticAnalysis, 0, acousticAnalysis.durationSec);
  }, [acousticAnalysis]);

  const acousticCalibrationStatus = useMemo(
    () => deriveAcousticCalibrationStatus(acousticDetail),
    [acousticDetail],
  );

  const handleJumpToAcousticHotspot = (timeSec: number): void => {
    input.seekToTimeRef.current?.(timeSec);
  };

  return {
    acousticRuntimeStatus,
    acousticSummary,
    acousticDetail,
    acousticDetailFullMedia,
    acousticCalibrationStatus,
    acousticProviderState,
    handleJumpToAcousticHotspot,
  };
}
