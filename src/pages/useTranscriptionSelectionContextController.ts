import { useMemo } from 'react';
import type { LayerDocType, LayerSegmentDocType, MediaItemDocType, UtteranceDocType } from '../db';
import type { TimelineUnit } from '../hooks/transcriptionTypes';
import { isSegmentTimelineUnit } from '../hooks/transcriptionTypes';
import { layerUsesOwnSegments, resolveSegmentTimelineSourceLayer } from '../hooks/useLayerSegments';
import {
  collectNoteTimelineUnitIds,
  resolveSelectedTimelineMedia,
  resolveSelectedTimelineRowMeta,
  type SelectedTimelineRowMeta,
} from './transcriptionSelectionContextResolver';
import { resolveNextUtteranceIdForDictation } from './voiceDictationFlow';
import { resolveSegmentOwnerUtterance } from './transcriptionSelectionOwnerResolver';

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

    return resolveSegmentOwnerUtterance(selectedTimelineSegment, input.utterances) ?? null;
  }, [input.selectedUnit, input.utterances, selectedTimelineSegment]);

  const selectedTimelineMedia = useMemo(() => resolveSelectedTimelineMedia(
    input.selectedUnitMedia,
    mediaItemById,
    selectedTimelineSegment,
    selectedTimelineOwnerUnit,
  ), [input.selectedUnitMedia, mediaItemById, selectedTimelineOwnerUnit, selectedTimelineSegment]);

  const selectedTimelineUnitForTime = selectedTimelineSegment ?? selectedTimelineOwnerUnit ?? null;

  const selectedTimelineRowMeta = useMemo<SelectedTimelineRowMeta | null>(() => resolveSelectedTimelineRowMeta(
    input.utterancesOnCurrentMedia,
    selectedTimelineOwnerUnit,
    input.utterances,
  ), [input.utterances, input.utterancesOnCurrentMedia, selectedTimelineOwnerUnit]);

  const nextUtteranceIdForVoiceDictation = useMemo(() => resolveNextUtteranceIdForDictation({
    utteranceIdsOnCurrentMedia: input.utterancesOnCurrentMedia.map((item) => item.id),
    activeUnitId: selectedTimelineOwnerUnit?.id ?? null,
  }), [input.utterancesOnCurrentMedia, selectedTimelineOwnerUnit?.id]);

  const independentLayerIds = useMemo(() => new Set(
    input.layers.filter((layer) => layerUsesOwnSegments(layer, input.defaultTranscriptionLayerId)).map((layer) => layer.id),
  ), [input.defaultTranscriptionLayerId, input.layers]);

  const noteTimelineUnitIds = useMemo(
    () => collectNoteTimelineUnitIds(input.utterances, input.segmentsByLayer),
    [input.segmentsByLayer, input.utterances],
  );

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