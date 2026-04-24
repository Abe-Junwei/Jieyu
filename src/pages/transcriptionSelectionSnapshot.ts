import type { LayerDocType, LayerLinkDocType, LayerUnitDocType } from '../db';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import { isSegmentTimelineUnit, type TimelineUnit, type TimelineUnitKind } from '../hooks/transcriptionTypes';
import { resolveHostAwareTranslationLayerIdFromSnapshot } from '../utils/translationLayerTargetResolver';

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
  layerLinks: LayerLinkDocType[];
  segmentContentByLayer: ReadonlyMap<string, ReadonlyMap<string, SegmentContentLike>>;
  getUnitTextForLayer: (unit: LayerUnitDocType, layerId?: string) => string;
  formatTime: (seconds: number) => string;
}

/**
 * 三页深链 / AI 上下文应与 `unitId` + **显式层 id** 一致（联评 R6）：`selectedLayerId`、
 * `selectedTranscriptionLayerId` / `selectedTranslationLayerId` 由当前聚焦轨与宿主解析导出，勿与未 stamp 的 canonical `layerId` 混读。
 */
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
  const translationLayers = input.layers.filter((layer) => layer.layerType === 'translation');
  const selectedLayerType: 'transcription' | 'translation' | undefined = selectedLayer
    ? (selectedLayer.layerType === 'translation' ? 'translation' : 'transcription')
    : undefined;
  const selectedUnitLayerId = input.primaryUnitView?.layerId
    ?? input.selectedTimelineUnit?.layerId
    ?? undefined;
  const hostAwareTranslationLayerId = resolveHostAwareTranslationLayerIdFromSnapshot({
    selectedLayerId: input.selectedLayerId,
    selectedUnitLayerId,
    defaultTranscriptionLayerId: selectedLayerType === 'transcription' ? selectedLayer?.id : null,
    allowFirstTranslationFallback: false,
    translationLayers,
    transcriptionLayers: input.layers.filter((layer) => layer.layerType === 'transcription'),
    layerLinks: input.layerLinks,
  });
  const selectedTranslationLayerId = selectedLayerType === 'translation'
    ? selectedLayer?.id
    : hostAwareTranslationLayerId;
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