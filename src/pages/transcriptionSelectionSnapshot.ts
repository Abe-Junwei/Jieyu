import type { LayerDocType, LayerUnitDocType } from '../db';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import { isSegmentTimelineUnit, type TimelineUnit, type TimelineUnitKind } from '../hooks/transcriptionTypes';

function activeUnitIdFromPrimaryView(
  primary: TimelineUnitView | null,
  ownerFallback: LayerUnitDocType | null,
): string | null {
  if (!primary) return ownerFallback?.id ?? null;
  if (primary.kind === 'unit') return primary.id;
  const parent = primary.parentUnitId?.trim();
  return parent ? parent : (ownerFallback?.id ?? null);
}

export interface TranscriptionSelectionRowMeta {
  rowNumber: number;
  start: number;
  end: number;
}

interface SegmentContentLike {
  text?: string;
}

export interface BuildTranscriptionSelectionSnapshotInput {
  selectedTimelineUnit: TimelineUnit | null;
  selectedTimelineSegment: LayerUnitDocType | null;
  selectedTimelineOwnerUnit: LayerUnitDocType | null;
  /** Primary row in the unified read model (timeline unit view); null when unknown. */
  primaryUnitView: TimelineUnitView | null;
  selectedTimelineRowMeta: TranscriptionSelectionRowMeta | null;
  selectedLayerId: string | null;
  layers: LayerDocType[];
  segmentContentByLayer: ReadonlyMap<string, ReadonlyMap<string, SegmentContentLike>>;
  getUnitTextForLayer: (unit: LayerUnitDocType, layerId?: string) => string;
  formatTime: (seconds: number) => string;
}

export interface TranscriptionSelectionSnapshot {
  timelineUnit: TimelineUnit | null;
  selectedUnitKind: TimelineUnitKind | null;
  activeUnitId: string | null;
  selectedUnit: TimelineUnitView | null;
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
    : input.selectedTimelineOwnerUnit
      ? input.getUnitTextForLayer(input.selectedTimelineOwnerUnit, input.selectedLayerId ?? undefined)
      : '';

  const selectedTimeSource = selectedSegmentUnit
    ? input.selectedTimelineSegment
    : input.selectedTimelineOwnerUnit;
  const selectedTimeRangeLabel = selectedTimeSource
    ? `${input.formatTime(selectedTimeSource.startTime)}-${input.formatTime(selectedTimeSource.endTime)}`
    : undefined;

  return {
    timelineUnit: input.selectedTimelineUnit,
    selectedUnitKind: input.selectedTimelineUnit?.kind ?? null,
    activeUnitId: activeUnitIdFromPrimaryView(input.primaryUnitView, input.selectedTimelineOwnerUnit),
    selectedUnit: input.primaryUnitView,
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