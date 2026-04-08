import { useEffect, useMemo, useState } from 'react';
import { AcousticAnalysisService } from '../services/acoustic/AcousticAnalysisService';
import type { AcousticRuntimeStatus } from '../contexts/AiPanelContext';
import { buildAcousticPromptSummary, type AcousticPromptSummary } from './transcriptionAcousticSummary';
import { buildAcousticPanelDetail, type AcousticPanelDetail } from '../utils/acousticPanelDetail';
import type { AcousticFeatureResult } from '../utils/acousticOverlayTypes';

interface UseTranscriptionAiAcousticRuntimeInput {
  selectedMediaUrl?: string;
  selectedTimelineMediaId?: string;
  selectionStartSec?: number;
  selectionEndSec?: number;
  seekToTimeRef: React.MutableRefObject<((timeSeconds: number) => void) | undefined>;
}

interface UseTranscriptionAiAcousticRuntimeResult {
  acousticRuntimeStatus: AcousticRuntimeStatus;
  acousticSummary: AcousticPromptSummary | null;
  acousticDetail: AcousticPanelDetail | null;
  handleJumpToAcousticHotspot: (timeSec: number) => void;
}

export function useTranscriptionAiAcousticRuntime(
  input: UseTranscriptionAiAcousticRuntimeInput,
): UseTranscriptionAiAcousticRuntimeResult {
  const [acousticAnalysis, setAcousticAnalysis] = useState<AcousticFeatureResult | null>(null);
  const [acousticRuntimeStatus, setAcousticRuntimeStatus] = useState<AcousticRuntimeStatus>({ state: 'idle' });

  useEffect(() => {
    if (!input.selectedMediaUrl) {
      setAcousticAnalysis(null);
      setAcousticRuntimeStatus({ state: 'idle' });
      return;
    }
    const service = AcousticAnalysisService.getInstance();
    const controller = new AbortController();
    const mediaKey = input.selectedTimelineMediaId ?? input.selectedMediaUrl;
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
      signal: controller.signal,
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
  }, [input.selectedMediaUrl, input.selectedTimelineMediaId]);

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

  const handleJumpToAcousticHotspot = (timeSec: number): void => {
    input.seekToTimeRef.current?.(timeSec);
  };

  return { acousticRuntimeStatus, acousticSummary, acousticDetail, handleJumpToAcousticHotspot };
}
