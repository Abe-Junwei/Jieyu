import { useMemo } from 'react';
import type { VadSegmentLike } from '../utils/waveformAnalysisOverlays';
import { buildWaveformAnalysisOverlaySummary } from '../utils/waveformAnalysisOverlays';
import type { WaveformLowConfidenceOverlay, WaveformNoteIndicator, WaveformOverlapOverlay } from './transcriptionWaveformBridge.types';

interface UseWaveformSignalOverlaysInput {
  unitsOnCurrentMedia: Array<{ id: string; startTime: number; endTime: number; ai_metadata?: { confidence?: number } }>;
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
}

export function useWaveformSignalOverlays(input: UseWaveformSignalOverlaysInput): UseWaveformSignalOverlaysResult {
  const visibleWaveformAnalysisRows = useMemo(() => {
    const confidenceById = new Map(
      input.unitsOnCurrentMedia.map((unit) => [unit.id, unit.ai_metadata] as const),
    );

    return input.waveformTimelineItems.map((item) => ({
      id: item.id,
      startTime: item.startTime,
      endTime: item.endTime,
      ...(confidenceById.get(item.id) ? { ai_metadata: confidenceById.get(item.id) } : {}),
    }));
  }, [input.unitsOnCurrentMedia, input.waveformTimelineItems]);

  const waveformAnalysisSummary = useMemo(() => buildWaveformAnalysisOverlaySummary(visibleWaveformAnalysisRows, {
    ...(input.vadSegments ? { vadSegments: input.vadSegments } : {}),
  }), [input.vadSegments, visibleWaveformAnalysisRows]);

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


  return {
    waveformNoteIndicators,
    waveformLowConfidenceOverlays,
    waveformOverlapOverlays,
  };
}
