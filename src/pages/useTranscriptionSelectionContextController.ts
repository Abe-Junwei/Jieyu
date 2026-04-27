import { useMemo } from 'react';
import type { LayerDocType, LayerLinkDocType, LayerUnitDocType, MediaItemDocType } from '../types/jieyuDbDocTypes';
import type { TimelineUnit } from '../hooks/transcriptionTypes';
import { isSegmentTimelineUnit } from '../hooks/transcriptionTypes';
import { layerUsesOwnSegments, resolveSegmentTimelineSourceLayer } from '../hooks/useLayerSegments';
import { collectNoteTimelineUnitIds, resolveSelectedTimelineMedia, resolveSelectedTimelineRowMeta, type SelectedTimelineRowMeta } from './transcriptionSelectionContextResolver';
import { resolveNextUnitIdForDictation } from './voiceDictationFlow';
import { resolveSegmentOwnerUnit } from './transcriptionSelectionOwnerResolver';

interface UseTranscriptionSelectionContextControllerInput {
  layers: LayerDocType[];
  defaultTranscriptionLayerId?: string;
  layerLinks: ReadonlyArray<Pick<LayerLinkDocType, 'layerId' | 'transcriptionLayerKey' | 'hostTranscriptionLayerId' | 'isPreferred'>>;
  mediaItems: MediaItemDocType[];
  units: LayerUnitDocType[];
  unitsOnCurrentMedia: LayerUnitDocType[];
  selectedUnit: LayerUnitDocType | null;
  selectedUnitMedia?: MediaItemDocType;
  selectedTimelineUnit: TimelineUnit | null;
  segmentsByLayer: ReadonlyMap<string, LayerUnitDocType[]>;
}

interface UseTranscriptionSelectionContextControllerResult {
  layerById: Map<string, LayerDocType>;
  mediaItemById: Map<string, MediaItemDocType>;
  selectedTimelineSegment: LayerUnitDocType | null;
  selectedTimelineOwnerUnit: LayerUnitDocType | null;
  selectedTimelineMedia: MediaItemDocType | undefined;
  selectedTimelineUnitForTime: Pick<LayerUnitDocType, 'startTime' | 'endTime'> | Pick<LayerUnitDocType, 'startTime' | 'endTime'> | null;
  selectedTimelineRowMeta: SelectedTimelineRowMeta | null;
  nextUnitIdForVoiceDictation: string | null;
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

    return resolveSegmentOwnerUnit(selectedTimelineSegment, input.units) ?? null;
  }, [input.selectedUnit, input.units, selectedTimelineSegment]);

  const selectedTimelineMedia = useMemo(() => resolveSelectedTimelineMedia(
    input.selectedUnitMedia,
    mediaItemById,
    selectedTimelineSegment,
    selectedTimelineOwnerUnit,
  ), [input.selectedUnitMedia, mediaItemById, selectedTimelineOwnerUnit, selectedTimelineSegment]);

  const selectedTimelineUnitForTime = selectedTimelineSegment ?? selectedTimelineOwnerUnit ?? null;

  const selectedTimelineRowMeta = useMemo<SelectedTimelineRowMeta | null>(() => resolveSelectedTimelineRowMeta(
    input.unitsOnCurrentMedia,
    selectedTimelineOwnerUnit,
    input.units,
  ), [input.units, input.unitsOnCurrentMedia, selectedTimelineOwnerUnit]);

  const nextUnitIdForVoiceDictation = useMemo(() => resolveNextUnitIdForDictation({
    unitIdsOnCurrentMedia: input.unitsOnCurrentMedia.map((item) => item.id),
    activeUnitId: selectedTimelineOwnerUnit?.id ?? null,
  }), [input.unitsOnCurrentMedia, selectedTimelineOwnerUnit?.id]);

  const independentLayerIds = useMemo(() => new Set(
    input.layers.filter((layer) => layerUsesOwnSegments(layer, input.defaultTranscriptionLayerId)).map((layer) => layer.id),
  ), [input.defaultTranscriptionLayerId, input.layers]);

  const noteTimelineUnitIds = useMemo(
    () => collectNoteTimelineUnitIds(input.units, input.segmentsByLayer),
    [input.segmentsByLayer, input.units],
  );

  const segmentTimelineLayerIds = useMemo(() => new Set(
    input.layers
      .filter((layer) => Boolean(resolveSegmentTimelineSourceLayer(layer, layerById, input.defaultTranscriptionLayerId, input.layerLinks)))
      .map((layer) => layer.id),
  ), [input.defaultTranscriptionLayerId, input.layerLinks, input.layers, layerById]);

  return {
    layerById,
    mediaItemById,
    selectedTimelineSegment,
    selectedTimelineOwnerUnit,
    selectedTimelineMedia,
    selectedTimelineUnitForTime,
    selectedTimelineRowMeta,
    nextUnitIdForVoiceDictation,
    independentLayerIds,
    noteTimelineUnitIds,
    segmentTimelineLayerIds,
  };
}