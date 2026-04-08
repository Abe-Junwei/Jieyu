import { useMemo } from 'react';
import type { VadSegmentLike } from '../utils/waveformAnalysisOverlays';
import { buildWaveformAnalysisOverlaySummary } from '../utils/waveformAnalysisOverlays';
import type {
  WaveformGapOverlay,
  WaveformLowConfidenceOverlay,
  WaveformNoteIndicator,
  WaveformOverlapOverlay,
} from './transcriptionWaveformBridge.types';

interface UseWaveformSignalOverlaysInput {
  utterancesOnCurrentMedia: Array<{ id: string; startTime: number; endTime: number; ai_metadata?: { confidence?: number } }>;
  vadSegments?: VadSegmentLike[];
  waveformTimelineItems: Array<{ id: string; startTime: number; endTime: number }>;
  activeLayerIdForEdits: string;
  resolveNoteIndicatorTarget: (unitId: string, layerId?: string, scope?: 'timeline' | 'waveform') => { count: number; layerId?: string } | null;
  waveformScrollLeft: number;
  zoomPxPerSec: number;
}

interface UseWaveformSignalOverlaysResult {
  waveformNoteIndicators: WaveformNoteIndicator[];
  waveformLowConfidenceOverlays: WaveformLowConfidenceOverlay[];
  waveformOverlapOverlays: WaveformOverlapOverlay[];
  waveformGapOverlays: WaveformGapOverlay[];
}

export function useWaveformSignalOverlays(input: UseWaveformSignalOverlaysInput): UseWaveformSignalOverlaysResult {
  const waveformAnalysisSummary = useMemo(() => buildWaveformAnalysisOverlaySummary(input.utterancesOnCurrentMedia, {
    ...(input.vadSegments ? { vadSegments: input.vadSegments } : {}),
  }), [input.utterancesOnCurrentMedia, input.vadSegments]);

  const waveformNoteIndicators = useMemo(() => {
    const result: WaveformNoteIndicator[] = [];
    for (const item of input.waveformTimelineItems) {
      const noteIndicator = input.resolveNoteIndicatorTarget(item.id, input.activeLayerIdForEdits || undefined, 'waveform');
      if (!noteIndicator) continue;
      result.push({
        uttId: item.id,
        leftPx: item.startTime * input.zoomPxPerSec - input.waveformScrollLeft,
        widthPx: (item.endTime - item.startTime) * input.zoomPxPerSec,
        count: noteIndicator.count,
        ...(noteIndicator.layerId ? { layerId: noteIndicator.layerId } : {}),
      });
    }
    return result;
  }, [input.activeLayerIdForEdits, input.resolveNoteIndicatorTarget, input.waveformScrollLeft, input.waveformTimelineItems, input.zoomPxPerSec]);

  const waveformLowConfidenceOverlays = useMemo(() => waveformAnalysisSummary.lowConfidenceBands.map((band) => ({
    id: band.id,
    leftPx: band.startTime * input.zoomPxPerSec - input.waveformScrollLeft,
    widthPx: Math.max(2, (band.endTime - band.startTime) * input.zoomPxPerSec),
    confidence: band.confidence,
  })), [input.waveformScrollLeft, input.zoomPxPerSec, waveformAnalysisSummary.lowConfidenceBands]);

  const waveformOverlapOverlays = useMemo(() => waveformAnalysisSummary.overlapBands.map((band) => ({
    id: band.id,
    leftPx: band.startTime * input.zoomPxPerSec - input.waveformScrollLeft,
    widthPx: Math.max(2, (band.endTime - band.startTime) * input.zoomPxPerSec),
    concurrentCount: band.concurrentCount,
  })), [input.waveformScrollLeft, input.zoomPxPerSec, waveformAnalysisSummary.overlapBands]);

  const waveformGapOverlays = useMemo(() => waveformAnalysisSummary.gapBands.map((band) => ({
    id: band.id,
    leftPx: band.startTime * input.zoomPxPerSec - input.waveformScrollLeft,
    widthPx: Math.max(2, (band.endTime - band.startTime) * input.zoomPxPerSec),
    gapSeconds: band.gapSeconds,
  })), [input.waveformScrollLeft, input.zoomPxPerSec, waveformAnalysisSummary.gapBands]);

  return {
    waveformNoteIndicators,
    waveformLowConfidenceOverlays,
    waveformOverlapOverlays,
    waveformGapOverlays,
  };
}
