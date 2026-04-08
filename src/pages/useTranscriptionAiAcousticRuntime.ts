import { useEffect, useMemo, useState } from 'react';
import { AcousticAnalysisService } from '../services/acoustic/AcousticAnalysisService';
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
  acousticSummary: AcousticPromptSummary | null;
  acousticDetail: AcousticPanelDetail | null;
  handleJumpToAcousticHotspot: (timeSec: number) => void;
}

export function useTranscriptionAiAcousticRuntime(
  input: UseTranscriptionAiAcousticRuntimeInput,
): UseTranscriptionAiAcousticRuntimeResult {
  const [acousticAnalysis, setAcousticAnalysis] = useState<AcousticFeatureResult | null>(null);

  useEffect(() => {
    if (!input.selectedMediaUrl) {
      setAcousticAnalysis(null);
      return;
    }
    const service = AcousticAnalysisService.getInstance();
    let cancelled = false;
    const mediaKey = input.selectedTimelineMediaId ?? input.selectedMediaUrl;
    service.analyzeMedia({ mediaKey, mediaUrl: input.selectedMediaUrl }).then((result) => {
      if (cancelled) return;
      setAcousticAnalysis(result);
    }).catch(() => {
      if (cancelled) return;
      setAcousticAnalysis(null);
    });
    return () => {
      cancelled = true;
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

  return { acousticSummary, acousticDetail, handleJumpToAcousticHotspot };
}
