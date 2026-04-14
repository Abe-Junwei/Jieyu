import { useMemo } from 'react';
import type { LayerDocType, LayerSegmentDocType, MediaItemDocType, UtteranceDocType } from '../db';
import type { TimelineUnit } from '../hooks/transcriptionTypes';
import { isSegmentTimelineUnit } from '../hooks/transcriptionTypes';
import { layerUsesOwnSegments, resolveSegmentTimelineSourceLayer } from '../hooks/useLayerSegments';
import { resolveNextUtteranceIdForDictation } from './voiceDictationFlow';

interface SelectedTimelineRowMeta {
  rowNumber: number;
  start: number;
  end: number;
}

interface UseTranscriptionSelectionContextControllerInput {
  layers: LayerDocType[];
  defaultTranscriptionLayerId?: string;
  mediaItems: MediaItemDocType[];
  utterances: UtteranceDocType[];
  utterancesOnCurrentMedia: UtteranceDocType[];
  selectedUnit: UtteranceDocType | null;
  selectedUnitMedia?: MediaItemDocType;
  selectedTimelineUnit: TimelineUnit | null;
  segmentsByLayer: ReadonlyMap<string, LayerSegmentDocType[]>;
}

interface UseTranscriptionSelectionContextControllerResult {
  layerById: Map<string, LayerDocType>;
  mediaItemById: Map<string, MediaItemDocType>;
  selectedTimelineSegment: LayerSegmentDocType | null;
  selectedTimelineOwnerUnit: UtteranceDocType | null;
  selectedTimelineMedia: MediaItemDocType | undefined;
  selectedTimelineUnitForTime: Pick<UtteranceDocType, 'startTime' | 'endTime'> | Pick<LayerSegmentDocType, 'startTime' | 'endTime'> | null;
  selectedTimelineRowMeta: SelectedTimelineRowMeta | null;
  nextUtteranceIdForVoiceDictation: string | null;
  independentLayerIds: Set<string>;
  noteTimelineUnitIds: string[];
  segmentTimelineLayerIds: Set<string>;
}

export function useTranscriptionSelectionContextController(
  input: UseTranscriptionSelectionContextControllerInput,
): UseTranscriptionSelectionContextControllerResult {
  const layerById = useMemo(
    () => new Map(input.layers.map((layer) => [layer.id, layer] as const)),
    [input.layers],
  );

  const mediaItemById = useMemo(
    () => new Map(input.mediaItems.map((item) => [item.id, item] as const)),
    [input.mediaItems],
  );

  const selectedTimelineSegment = useMemo(() => {
    const selectedUnit = input.selectedTimelineUnit;
    if (!selectedUnit || !isSegmentTimelineUnit(selectedUnit)) return null;
    return input.segmentsByLayer.get(selectedUnit.layerId)?.find((segment) => segment.id === selectedUnit.unitId) ?? null;
  }, [input.segmentsByLayer, input.selectedTimelineUnit]);

  const selectedTimelineOwnerUnit = useMemo(() => {
    if (input.selectedUnit) return input.selectedUnit;
    if (!selectedTimelineSegment) return null;

    const explicitOwnerId = selectedTimelineSegment.utteranceId?.trim();
    if (explicitOwnerId) {
      return input.utterances.find((item) => item.id === explicitOwnerId) ?? null;
    }

    return input.utterances.find((item) => {
      if (selectedTimelineSegment.mediaId && item.mediaId !== selectedTimelineSegment.mediaId) {
        return false;
      }
      return item.startTime <= selectedTimelineSegment.endTime - 0.01
        && item.endTime >= selectedTimelineSegment.startTime + 0.01;
    }) ?? null;
  }, [input.selectedUnit, input.utterances, selectedTimelineSegment]);

  const selectedTimelineMedia = useMemo(() => {
    if (input.selectedUnitMedia) return input.selectedUnitMedia;
    const mediaId = selectedTimelineSegment?.mediaId ?? selectedTimelineOwnerUnit?.mediaId ?? '';
    return mediaId ? mediaItemById.get(mediaId) : undefined;
  }, [input.selectedUnitMedia, mediaItemById, selectedTimelineOwnerUnit?.mediaId, selectedTimelineSegment?.mediaId]);

  const selectedTimelineUnitForTime = selectedTimelineSegment ?? selectedTimelineOwnerUnit ?? null;

  const selectedTimelineRowMeta = useMemo<SelectedTimelineRowMeta | null>(() => {
    if (!selectedTimelineOwnerUnit) return null;

    const rowIndex = input.utterancesOnCurrentMedia.findIndex((item) => item.id === selectedTimelineOwnerUnit.id);
    if (rowIndex >= 0) {
      const row = input.utterancesOnCurrentMedia[rowIndex];
      if (!row) return null;
      return {
        rowNumber: rowIndex + 1,
        start: row.startTime,
        end: row.endTime,
      };
    }

    const sameMediaRows = [...input.utterances]
      .filter((item) => item.mediaId === selectedTimelineOwnerUnit.mediaId)
      .sort((a, b) => a.startTime - b.startTime);
    const fallbackIndex = sameMediaRows.findIndex((item) => item.id === selectedTimelineOwnerUnit.id);
    const fallbackRow = fallbackIndex >= 0 ? sameMediaRows[fallbackIndex] : undefined;
    if (!fallbackRow) return null;
    return {
      rowNumber: fallbackIndex + 1,
      start: fallbackRow.startTime,
      end: fallbackRow.endTime,
    };
  }, [input.utterances, input.utterancesOnCurrentMedia, selectedTimelineOwnerUnit]);

  const nextUtteranceIdForVoiceDictation = useMemo(() => resolveNextUtteranceIdForDictation({
    utteranceIdsOnCurrentMedia: input.utterancesOnCurrentMedia.map((item) => item.id),
    activeUnitId: selectedTimelineOwnerUnit?.id ?? null,
  }), [input.utterancesOnCurrentMedia, selectedTimelineOwnerUnit?.id]);

  const independentLayerIds = useMemo(() => new Set(
    input.layers.filter((layer) => layerUsesOwnSegments(layer, input.defaultTranscriptionLayerId)).map((layer) => layer.id),
  ), [input.defaultTranscriptionLayerId, input.layers]);

  const noteTimelineUnitIds = useMemo(() => {
    const ids = new Set<string>();
    for (const utterance of input.utterances) {
      ids.add(utterance.id);
    }
    for (const segments of input.segmentsByLayer.values()) {
      for (const segment of segments) {
        ids.add(segment.id);
      }
    }
    return [...ids];
  }, [input.segmentsByLayer, input.utterances]);

  const segmentTimelineLayerIds = useMemo(() => new Set(
    input.layers
      .filter((layer) => Boolean(resolveSegmentTimelineSourceLayer(layer, layerById, input.defaultTranscriptionLayerId)))
      .map((layer) => layer.id),
  ), [input.defaultTranscriptionLayerId, input.layers, layerById]);

  return {
    layerById,
    mediaItemById,
    selectedTimelineSegment,
    selectedTimelineOwnerUnit,
    selectedTimelineMedia,
    selectedTimelineUnitForTime,
    selectedTimelineRowMeta,
    nextUtteranceIdForVoiceDictation,
    independentLayerIds,
    noteTimelineUnitIds,
    segmentTimelineLayerIds,
  };
}