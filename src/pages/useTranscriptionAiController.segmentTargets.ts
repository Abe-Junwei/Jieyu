import type {
  LayerSegmentDocType,
  MediaItemDocType,
  UtteranceDocType,
} from '../db';
import type { SegmentTargetDescriptor } from '../hooks/useAiToolCallHandler.segmentTargeting';
import type { SegmentRoutingResult } from './transcriptionSegmentRouting';

function orderUtterancesByTimeline(utterances: UtteranceDocType[]): UtteranceDocType[] {
  return [...utterances].sort((left, right) => {
    const startDiff = Number(left.startTime) - Number(right.startTime);
    if (startDiff !== 0) return startDiff;
    const endDiff = Number(left.endTime) - Number(right.endTime);
    if (endDiff !== 0) return endDiff;
    return left.id.localeCompare(right.id);
  });
}

export function resolveAiSegmentTargetScopeUtterances(input: {
  utterances: UtteranceDocType[];
  utterancesOnCurrentMedia: UtteranceDocType[];
  selectedTimelineMedia?: MediaItemDocType;
}): UtteranceDocType[] {
  if (input.utterancesOnCurrentMedia.length > 0) {
    return input.utterancesOnCurrentMedia;
  }

  const orderedUtterances = orderUtterancesByTimeline(input.utterances);
  if (orderedUtterances.length === 0) {
    return [];
  }

  const selectedTimelineMediaId = typeof input.selectedTimelineMedia?.id === 'string'
    ? input.selectedTimelineMedia.id.trim()
    : '';
  if (selectedTimelineMediaId.length > 0) {
    const onSelectedTimelineMedia = orderedUtterances.filter((utterance) => utterance.mediaId === selectedTimelineMediaId);
    if (onSelectedTimelineMedia.length > 0) {
      return onSelectedTimelineMedia;
    }
  }

  const distinctMediaIds = Array.from(new Set(
    orderedUtterances
      .map((utterance) => (typeof utterance.mediaId === 'string' ? utterance.mediaId.trim() : ''))
      .filter((mediaId) => mediaId.length > 0),
  ));

  if (distinctMediaIds.length === 0 || distinctMediaIds.length === 1) {
    return orderedUtterances;
  }

  return [];
}

export function buildAiSegmentTargetDescriptors(input: {
  utteranceTargets: UtteranceDocType[];
  selectedLayerId: string;
  activeLayerIdForEdits?: string;
  segmentsByLayer?: ReadonlyMap<string, LayerSegmentDocType[]>;
  segmentContentByLayer?: ReadonlyMap<string, ReadonlyMap<string, { text?: string }>>;
  resolveSegmentRoutingForLayer?: (layerId?: string) => SegmentRoutingResult;
  getUtteranceTextForLayer: (utterance: UtteranceDocType, layerId?: string) => string;
}): SegmentTargetDescriptor[] {
  const activeLayerId = input.activeLayerIdForEdits?.trim() ?? input.selectedLayerId.trim();
  const routing = activeLayerId && input.resolveSegmentRoutingForLayer
    ? input.resolveSegmentRoutingForLayer(activeLayerId)
    : undefined;
  if (routing && routing.editMode !== 'utterance') {
    const scopedSegments = input.segmentsByLayer?.get(routing.sourceLayerId) ?? [];
    if (scopedSegments.length > 0) {
      const contentCandidates = [input.selectedLayerId.trim(), activeLayerId, routing.sourceLayerId]
        .filter((value, index, array) => value.length > 0 && array.indexOf(value) === index)
        .map((layerId) => input.segmentContentByLayer?.get(layerId));
      return scopedSegments.map((segment) => {
        const text = contentCandidates
          .map((contentMap) => contentMap?.get(segment.id)?.text?.trim() ?? '')
          .find((value) => value.length > 0) ?? '';
        return {
          id: segment.id,
          kind: 'segment',
          startTime: segment.startTime,
          endTime: segment.endTime,
          text,
          ...(segment.utteranceId ? { utteranceId: segment.utteranceId } : {}),
        } satisfies SegmentTargetDescriptor;
      });
    }
  }

  return input.utteranceTargets.map((utterance) => ({
    id: utterance.id,
    kind: 'utterance',
    startTime: utterance.startTime,
    endTime: utterance.endTime,
    text: input.getUtteranceTextForLayer(utterance).trim(),
    utteranceId: utterance.id,
  }));
}

export function useTranscriptionAiControllerSegmentTargets(input: {
  utterances: UtteranceDocType[];
  utterancesOnCurrentMedia: UtteranceDocType[];
  selectedTimelineMedia?: MediaItemDocType;
  selectedLayerId: string;
  activeLayerIdForEdits?: string;
  segmentsByLayer?: ReadonlyMap<string, LayerSegmentDocType[]>;
  segmentContentByLayer?: ReadonlyMap<string, ReadonlyMap<string, { text?: string }>>;
  resolveSegmentRoutingForLayer?: (layerId?: string) => SegmentRoutingResult;
  getUtteranceTextForLayer: (utterance: UtteranceDocType, layerId?: string) => string;
}): {
  utteranceTargets: UtteranceDocType[];
  segmentTargets: SegmentTargetDescriptor[];
} {
  const utteranceTargets = resolveAiSegmentTargetScopeUtterances({
    utterances: input.utterances,
    utterancesOnCurrentMedia: input.utterancesOnCurrentMedia,
    ...(input.selectedTimelineMedia ? { selectedTimelineMedia: input.selectedTimelineMedia } : {}),
  });

  const segmentTargets = buildAiSegmentTargetDescriptors({
    utteranceTargets,
    selectedLayerId: input.selectedLayerId,
    ...(input.activeLayerIdForEdits ? { activeLayerIdForEdits: input.activeLayerIdForEdits } : {}),
    ...(input.segmentsByLayer ? { segmentsByLayer: input.segmentsByLayer } : {}),
    ...(input.segmentContentByLayer ? { segmentContentByLayer: input.segmentContentByLayer } : {}),
    ...(input.resolveSegmentRoutingForLayer ? { resolveSegmentRoutingForLayer: input.resolveSegmentRoutingForLayer } : {}),
    getUtteranceTextForLayer: input.getUtteranceTextForLayer,
  });

  return {
    utteranceTargets,
    segmentTargets,
  };
}
