import type { LayerDocType, LayerSegmentDocType, UtteranceDocType } from '../db';
import {
  isSegmentTimelineUnit,
  type TimelineUnit,
  type TimelineUnitKind,
} from '../hooks/transcriptionTypes';

export interface TranscriptionSelectionRowMeta {
  rowNumber: number;
  start: number;
  end: number;
}

interface SegmentContentLike {
  text?: string;
}

interface BuildTranscriptionSelectionSnapshotInput {
  selectedTimelineUnit: TimelineUnit | null;
  selectedTimelineSegment: LayerSegmentDocType | null;
  selectedTimelineOwnerUtterance: UtteranceDocType | null;
  selectedTimelineRowMeta: TranscriptionSelectionRowMeta | null;
  selectedLayerId: string | null;
  layers: LayerDocType[];
  segmentContentByLayer: ReadonlyMap<string, ReadonlyMap<string, SegmentContentLike>>;
  getUtteranceTextForLayer: (utterance: UtteranceDocType, layerId?: string) => string;
  formatTime: (seconds: number) => string;
}

export interface TranscriptionSelectionSnapshot {
  timelineUnit: TimelineUnit | null;
  selectedUnitKind: TimelineUnitKind | null;
  activeUtteranceUnitId: string | null;
  selectedUtterance: UtteranceDocType | null;
  selectedRowMeta: TranscriptionSelectionRowMeta | null;
  selectedLayerId: string | null;
  selectedText: string;
  selectedTimeRangeLabel?: string;
  selectedUnitStartSec?: number;
  selectedUnitEndSec?: number;
  selectedLayerType?: 'transcription' | 'translation';
  selectedTranslationLayerId?: string;
  selectedTranscriptionLayerId?: string;
}

export function buildTranscriptionSelectionSnapshot(
  input: BuildTranscriptionSelectionSnapshotInput,
): TranscriptionSelectionSnapshot {
  const selectedLayer = input.layers.find((layer) => layer.id === input.selectedLayerId) ?? null;
  const selectedLayerType: 'transcription' | 'translation' | undefined = selectedLayer
    ? (selectedLayer.layerType === 'translation' ? 'translation' : 'transcription')
    : undefined;
  const selectedTranslationLayerId = selectedLayerType === 'translation'
    ? selectedLayer?.id
    : undefined;
  const selectedTranscriptionLayerId = selectedLayerType === 'transcription'
    ? selectedLayer?.id
    : undefined;

  const selectedSegmentUnit = isSegmentTimelineUnit(input.selectedTimelineUnit)
    ? input.selectedTimelineUnit
    : null;
  const selectedText = selectedSegmentUnit
    ? (input.segmentContentByLayer.get(selectedSegmentUnit.layerId)?.get(selectedSegmentUnit.unitId)?.text ?? '')
    : input.selectedTimelineOwnerUtterance
      ? input.getUtteranceTextForLayer(input.selectedTimelineOwnerUtterance, input.selectedLayerId ?? undefined)
      : '';

  const selectedTimeSource = selectedSegmentUnit
    ? input.selectedTimelineSegment
    : input.selectedTimelineOwnerUtterance;
  const selectedTimeRangeLabel = selectedTimeSource
    ? `${input.formatTime(selectedTimeSource.startTime)}-${input.formatTime(selectedTimeSource.endTime)}`
    : undefined;

  return {
    timelineUnit: input.selectedTimelineUnit,
    selectedUnitKind: input.selectedTimelineUnit?.kind ?? null,
    activeUtteranceUnitId: input.selectedTimelineOwnerUtterance?.id ?? null,
    selectedUtterance: input.selectedTimelineOwnerUtterance,
    selectedRowMeta: input.selectedTimelineRowMeta,
    selectedLayerId: input.selectedLayerId,
    selectedText,
    ...(selectedTimeRangeLabel ? { selectedTimeRangeLabel } : {}),
    ...(selectedTimeSource
      ? {
          selectedUnitStartSec: selectedTimeSource.startTime,
          selectedUnitEndSec: selectedTimeSource.endTime,
        }
      : {}),
    ...(selectedLayerType ? { selectedLayerType } : {}),
    ...(selectedTranslationLayerId ? { selectedTranslationLayerId } : {}),
    ...(selectedTranscriptionLayerId ? { selectedTranscriptionLayerId } : {}),
  };
}