import { useEffect, useMemo, useRef, useState } from 'react';
import { AcousticAnalysisService } from '../app/transcriptionServicesPageAccess';
import type { AcousticRuntimeStatus } from '../contexts/AiPanelContext';
import { buildAcousticPromptSummary, type AcousticPromptSummary } from './transcriptionAcousticSummary';
import { buildAcousticPanelBatchBuildResult, buildAcousticPanelDetail, deriveAcousticCalibrationStatus, type AcousticBatchSelectionRange, type AcousticCalibrationStatus, type AcousticPanelBatchDetail, type AcousticPanelDetail } from '../utils/acousticPanelDetail';
import type { AcousticAnalysisConfig, AcousticFeatureResult } from '../utils/acousticOverlayTypes';
import type { ResolvedAcousticProviderState } from '../types/acousticProviderResolved.types';

const PROGRESS_UPDATE_MIN_INTERVAL_MS = 100;
const PROGRESS_UPDATE_MIN_RATIO_DELTA = 0.01;

type ProgressSnapshot = {
  phase?: AcousticRuntimeStatus extends { phase?: infer T } ? T : string;
  ratio: number;
  timestampMs: number;
};

interface UseTranscriptionAiAcousticRuntimeInput {
  selectedMediaUrl?: string;
  selectedTimelineMediaId?: string;
  selectionStartSec?: number;
  selectionEndSec?: number;
  batchSelectionRanges?: AcousticBatchSelectionRange[];
  seekToTimeRef: React.MutableRefObject<((timeSeconds: number) => void) | undefined>;
  configOverride?: Partial<AcousticAnalysisConfig> | null;
  providerPreference?: string | null;
}

interface UseTranscriptionAiAcousticRuntimeResult {
  acousticRuntimeStatus: AcousticRuntimeStatus;
  acousticSummary: AcousticPromptSummary | null;
  acousticDetail: AcousticPanelDetail | null;
  acousticDetailFullMedia: AcousticPanelDetail | null;
  acousticBatchDetails: AcousticPanelBatchDetail[];
  acousticBatchSelectionCount: number;
  acousticBatchDroppedSelectionRanges: AcousticBatchSelectionRange[];
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
  const progressSnapshotRef = useRef<ProgressSnapshot>({ ratio: 0, timestampMs: 0 });
  const acousticProviderState = service.resolveProviderState(input.providerPreference);

  useEffect(() => {
    if (!input.selectedMediaUrl) {
      setAcousticAnalysis(null);
      setAcousticRuntimeStatus({ state: 'idle' });
      return;
    }

    const controller = new AbortController();
    const mediaKey = input.selectedTimelineMediaId ?? input.selectedMediaUrl;
    const configPartial = input.configOverride && Object.keys(input.configOverride).length > 0 ? input.configOverride : undefined;
    progressSnapshotRef.current = {
      phase: 'analyzing',
      ratio: 0,
      timestampMs: Date.now(),
    };
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
        const now = Date.now();
        const previous = progressSnapshotRef.current;
        const isFinal = progress.processedFrames >= progress.totalFrames;
        const phaseChanged = progress.phase !== previous.phase;
        const ratioDeltaReached = (progress.ratio - previous.ratio) >= PROGRESS_UPDATE_MIN_RATIO_DELTA;
        const intervalReached = (now - previous.timestampMs) >= PROGRESS_UPDATE_MIN_INTERVAL_MS;
        if (!isFinal && !phaseChanged && !ratioDeltaReached && !intervalReached) {
          return;
        }

        progressSnapshotRef.current = {
          phase: progress.phase,
          ratio: progress.ratio,
          timestampMs: now,
        };
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
      progressSnapshotRef.current = {
        phase: 'done',
        ratio: 1,
        timestampMs: Date.now(),
      };
      setAcousticRuntimeStatus((previous) => ({
        state: 'ready',
        phase: 'done',
        progressRatio: 1,
        ...(typeof previous.processedFrames === 'number' ? { processedFrames: previous.processedFrames } : {}),
        ...(typeof previous.totalFrames === 'number' ? { totalFrames: previous.totalFrames } : {}),
      }));
    }).catch((error) => {
      if (controller.signal.aborted) return;
      setAcousticAnalysis(null);
      setAcousticRuntimeStatus({
        state: 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
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

  const acousticBatchBuildResult = useMemo(() => buildAcousticPanelBatchBuildResult(
    acousticAnalysis,
    input.batchSelectionRanges,
  ), [acousticAnalysis, input.batchSelectionRanges]);
  const acousticBatchDetails = acousticBatchBuildResult.details;
  const acousticBatchDroppedSelectionRanges = acousticBatchBuildResult.droppedSelectionRanges;
  const acousticBatchSelectionCount = input.batchSelectionRanges?.length ?? 0;

  const acousticCalibrationStatus = useMemo(
    () => deriveAcousticCalibrationStatus(acousticDetailFullMedia),
    [acousticDetailFullMedia],
  );

  const handleJumpToAcousticHotspot = (timeSec: number): void => {
    input.seekToTimeRef.current?.(timeSec);
  };

  return {
    acousticRuntimeStatus,
    acousticSummary,
    acousticDetail,
    acousticDetailFullMedia,
    acousticBatchDetails,
    acousticBatchSelectionCount,
    acousticBatchDroppedSelectionRanges,
    acousticCalibrationStatus,
    acousticProviderState,
    handleJumpToAcousticHotspot,
  };
}
