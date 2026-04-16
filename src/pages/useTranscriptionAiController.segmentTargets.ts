import type { LayerSegmentViewDocType, LayerUnitDocType, MediaItemDocType } from '../db';
import type { SegmentTargetDescriptor } from '../hooks/useAiToolCallHandler.segmentTargeting';
import type { SegmentRoutingResult } from './transcriptionSegmentRouting';

function orderUnitsByTimeline(units: LayerUnitDocType[]): LayerUnitDocType[] {
  return [...units].sort((left, right) => {
    const startDiff = Number(left.startTime) - Number(right.startTime);
    if (startDiff !== 0) return startDiff;
    const endDiff = Number(left.endTime) - Number(right.endTime);
    if (endDiff !== 0) return endDiff;
    return left.id.localeCompare(right.id);
  });
}

export function resolveAiSegmentTargetScopeUnits(input: {
  units: LayerUnitDocType[];
  unitsOnCurrentMedia: LayerUnitDocType[];
  selectedTimelineMedia?: MediaItemDocType;
}): LayerUnitDocType[] {
  if (input.unitsOnCurrentMedia.length > 0) {
    return input.unitsOnCurrentMedia;
  }

  const orderedUnits = orderUnitsByTimeline(input.units);
  if (orderedUnits.length === 0) {
    return [];
  }

  const selectedTimelineMediaId = typeof input.selectedTimelineMedia?.id === 'string'
    ? input.selectedTimelineMedia.id.trim()
    : '';
  if (selectedTimelineMediaId.length > 0) {
    const onSelectedTimelineMedia = orderedUnits.filter((unit) => unit.mediaId === selectedTimelineMediaId);
    if (onSelectedTimelineMedia.length > 0) {
      return onSelectedTimelineMedia;
    }
  }

  const distinctMediaIds = Array.from(new Set(
    orderedUnits
      .map((unit) => (typeof unit.mediaId === 'string' ? unit.mediaId.trim() : ''))
      .filter((mediaId) => mediaId.length > 0),
  ));

  if (distinctMediaIds.length === 0 || distinctMediaIds.length === 1) {
    return orderedUnits;
  }

  return [];
}

export function buildAiSegmentTargetDescriptors(input: {
  unitTargets: LayerUnitDocType[];
  selectedLayerId: string;
  activeLayerIdForEdits?: string;
  segmentsByLayer?: ReadonlyMap<string, LayerSegmentViewDocType[]>;
  segmentContentByLayer?: ReadonlyMap<string, ReadonlyMap<string, { text?: string }>>;
  resolveSegmentRoutingForLayer?: (layerId?: string) => SegmentRoutingResult;
  getUnitTextForLayer: (unit: LayerUnitDocType, layerId?: string) => string;
}): SegmentTargetDescriptor[] {
  const activeLayerId = input.activeLayerIdForEdits?.trim() ?? input.selectedLayerId.trim();
  const routing = activeLayerId && input.resolveSegmentRoutingForLayer
    ? input.resolveSegmentRoutingForLayer(activeLayerId)
    : undefined;
  if (routing && routing.editMode !== 'unit') {
    const scopedSegments = input.segmentsByLayer?.get(routing.sourceLayerId) ?? [];
    if (scopedSegments.length > 0) {
      const contentCandidates = [input.selectedLayerId.trim(), activeLayerId, routing.sourceLayerId]
        .filter((value, index, array) => value.length > 0 && array.indexOf(value) === index)
        .map((layerId) => input.segmentContentByLayer?.get(layerId));
      return scopedSegments.map((segment) => {
        const text = contentCandidates
          .map((contentMap) => contentMap?.get(segment.id)?.text?.trim() ?? '')
          .find((value) => value.length > 0) ?? '';
        const ownerUnitId = (segment.parentUnitId ?? segment.unitId)?.trim() ?? '';
        return {
          id: segment.id,
          kind: 'segment',
          startTime: segment.startTime,
          endTime: segment.endTime,
          text,
          ...(ownerUnitId ? { unitId: ownerUnitId } : {}),
        } satisfies SegmentTargetDescriptor;
      });
    }
  }

  return input.unitTargets.map((unit) => ({
    id: unit.id,
    kind: 'unit',
    startTime: unit.startTime,
    endTime: unit.endTime,
    text: input.getUnitTextForLayer(unit).trim(),
    unitId: unit.id,
  }));
}

export function useTranscriptionAiControllerSegmentTargets(input: {
  units: LayerUnitDocType[];
  unitsOnCurrentMedia: LayerUnitDocType[];
  selectedTimelineMedia?: MediaItemDocType;
  selectedLayerId: string;
  activeLayerIdForEdits?: string;
  segmentsByLayer?: ReadonlyMap<string, LayerUnitDocType[]>;
  segmentContentByLayer?: ReadonlyMap<string, ReadonlyMap<string, { text?: string }>>;
  resolveSegmentRoutingForLayer?: (layerId?: string) => SegmentRoutingResult;
  getUnitTextForLayer: (unit: LayerUnitDocType, layerId?: string) => string;
}): {
  unitTargets: LayerUnitDocType[];
  segmentTargets: SegmentTargetDescriptor[];
} {
  const unitTargets = resolveAiSegmentTargetScopeUnits({
    units: input.units,
    unitsOnCurrentMedia: input.unitsOnCurrentMedia,
    ...(input.selectedTimelineMedia ? { selectedTimelineMedia: input.selectedTimelineMedia } : {}),
  });

  const segmentTargets = buildAiSegmentTargetDescriptors({
    unitTargets,
    selectedLayerId: input.selectedLayerId,
    ...(input.activeLayerIdForEdits ? { activeLayerIdForEdits: input.activeLayerIdForEdits } : {}),
    ...(input.segmentsByLayer ? { segmentsByLayer: input.segmentsByLayer } : {}),
    ...(input.segmentContentByLayer ? { segmentContentByLayer: input.segmentContentByLayer } : {}),
    ...(input.resolveSegmentRoutingForLayer ? { resolveSegmentRoutingForLayer: input.resolveSegmentRoutingForLayer } : {}),
    getUnitTextForLayer: input.getUnitTextForLayer,
  });

  return {
    unitTargets,
    segmentTargets,
  };
}
