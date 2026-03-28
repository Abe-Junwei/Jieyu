import type { LayerDocType, UtteranceDocType } from '../db';
import type { AiPromptContext } from '../hooks/useAiChat';
import { isSegmentTimelineUnit, type TimelineUnit } from '../hooks/transcriptionTypes';

interface TimeRangeUnitLike {
  id: string;
  startTime: number;
  endTime: number;
}

interface SegmentContentLike {
  text?: string;
}

interface BuildTranscriptionAiPromptContextParams {
  selectedTimelineUnit: TimelineUnit | null;
  selectedUtterance: UtteranceDocType | null;
  selectedLayerId: string | null;
  layers: LayerDocType[];
  segmentsByLayer: Map<string, TimeRangeUnitLike[]>;
  segmentContentByLayer: Map<string, Map<string, SegmentContentLike>>;
  getUtteranceTextForLayer: (utterance: UtteranceDocType, layerId?: string) => string;
  formatTime: (seconds: number) => string;
  utteranceCount: number;
  translationLayerCount: number;
  aiConfidenceAvg: number | null;
  observerStage: string | null;
  topLexemes: string[];
  recommendations: string[];
  audioTimeSec?: number;
  recentEdits: string[];
}

export function buildTranscriptionAiPromptContext({
  selectedTimelineUnit,
  selectedUtterance,
  selectedLayerId,
  layers,
  segmentsByLayer,
  segmentContentByLayer,
  getUtteranceTextForLayer,
  formatTime,
  utteranceCount,
  translationLayerCount,
  aiConfidenceAvg,
  observerStage,
  topLexemes,
  recommendations,
  audioTimeSec,
  recentEdits,
}: BuildTranscriptionAiPromptContextParams): AiPromptContext {
  const selectedSegmentForContext = isSegmentTimelineUnit(selectedTimelineUnit)
    ? segmentsByLayer.get(selectedTimelineUnit.layerId)?.find((segment) => segment.id === selectedTimelineUnit.unitId)
    : undefined;
  const selectedText = selectedUtterance
    ? getUtteranceTextForLayer(selectedUtterance)
    : (segmentContentByLayer.get(selectedTimelineUnit?.layerId ?? '')?.get(selectedTimelineUnit?.unitId ?? '')?.text ?? '');
  const selectedUnitForTime = selectedUtterance ?? selectedSegmentForContext;
  const selectionTimeRange = selectedUnitForTime
    ? `${formatTime(selectedUnitForTime.startTime)}-${formatTime(selectedUnitForTime.endTime)}`
    : undefined;
  const selectedLayer = layers.find((layer) => layer.id === selectedLayerId) ?? null;
  const selectedLayerType: 'transcription' | 'translation' | undefined = selectedLayer
    ? (selectedLayer.layerType === 'translation' ? 'translation' : 'transcription')
    : undefined;
  const selectedTranslationLayerId = selectedLayerType === 'translation'
    ? selectedLayer?.id
    : undefined;
  const selectedTranscriptionLayerId = selectedLayerType === 'transcription'
    ? selectedLayer?.id
    : undefined;

  return {
    shortTerm: {
      page: 'transcription',
      ...(selectedUtterance?.id ? { activeUtteranceUnitId: selectedUtterance.id } : {}),
      ...(isSegmentTimelineUnit(selectedTimelineUnit) ? { activeSegmentUnitId: selectedTimelineUnit.unitId } : {}),
      ...(selectedUnitForTime
        ? { selectedUtteranceStartSec: selectedUnitForTime.startTime, selectedUtteranceEndSec: selectedUnitForTime.endTime }
        : {}),
      ...(selectedLayer?.id ? { selectedLayerId: selectedLayer.id } : {}),
      ...(selectedLayerType ? { selectedLayerType } : {}),
      ...(selectedTranslationLayerId ? { selectedTranslationLayerId } : {}),
      ...(selectedTranscriptionLayerId ? { selectedTranscriptionLayerId } : {}),
      selectedText,
      ...(selectionTimeRange ? { selectionTimeRange } : {}),
      ...(audioTimeSec !== undefined ? { audioTimeSec } : {}),
      recentEdits,
    },
    longTerm: {
      projectStats: {
        utteranceCount,
        translationLayerCount,
        aiConfidenceAvg,
      },
      ...(observerStage ? { observerStage } : {}),
      topLexemes,
      recommendations,
    },
  };
}