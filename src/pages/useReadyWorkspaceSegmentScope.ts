import { useEffect, useMemo, useState } from 'react';

import { useLayerSegmentContents } from '../hooks/useLayerSegmentContents';
import { useLayerSegments } from '../hooks/useLayerSegments';
import { isSegmentTimelineUnit, isUnitTimelineUnit } from '../hooks/transcriptionTypes';
import { resolveSegmentMediaIdFromSegmentGraph, resolveSegmentScopeMediaId } from '../utils/resolveSegmentScopeMediaId';

interface UseReadyWorkspaceSegmentScopeInput {
  selectedUnitMedia: Parameters<typeof resolveSegmentScopeMediaId>[0];
  selectedTimelineUnit: Parameters<typeof resolveSegmentScopeMediaId>[1];
  units: Parameters<typeof resolveSegmentScopeMediaId>[2];
  mediaItems: Parameters<typeof resolveSegmentScopeMediaId>[3];
  layers: Parameters<typeof useLayerSegments>[0];
  defaultTranscriptionLayerId: Parameters<typeof useLayerSegments>[2];
  layerLinks: Parameters<typeof useLayerSegments>[3];
}

export function useReadyWorkspaceSegmentScope(input: UseReadyWorkspaceSegmentScopeInput) {
  const {
    selectedUnitMedia,
    selectedTimelineUnit,
    units,
    mediaItems,
    layers,
    defaultTranscriptionLayerId,
    layerLinks,
  } = input;

  const activeTimelineUnitId = selectedTimelineUnit != null
    && (isUnitTimelineUnit(selectedTimelineUnit) || isSegmentTimelineUnit(selectedTimelineUnit))
    ? selectedTimelineUnit.unitId
    : '';

  const segmentScopeMediaIdBase = useMemo(
    () => resolveSegmentScopeMediaId(selectedUnitMedia, selectedTimelineUnit, units, mediaItems),
    [selectedUnitMedia, selectedTimelineUnit, units, mediaItems],
  );

  const [segmentScopeMediaOverride, setSegmentScopeMediaOverride] = useState<string | undefined>(undefined);
  useEffect(() => {
    setSegmentScopeMediaOverride(undefined);
  }, [segmentScopeMediaIdBase]);

  const segmentScopeMediaId = segmentScopeMediaOverride ?? segmentScopeMediaIdBase;

  const {
    segmentsByLayer,
    segmentsLoadComplete,
    reloadSegments,
    updateSegmentsLocally,
  } = useLayerSegments(layers, segmentScopeMediaId, defaultTranscriptionLayerId, layerLinks);

  const { segmentContentByLayer, reloadSegmentContents } = useLayerSegmentContents(
    layers,
    segmentScopeMediaId,
    segmentsByLayer,
    defaultTranscriptionLayerId,
    layerLinks,
  );

  useEffect(() => {
    const fromGraph = resolveSegmentMediaIdFromSegmentGraph(selectedTimelineUnit, segmentsByLayer);
    if (!fromGraph) return;
    const current = segmentScopeMediaOverride ?? segmentScopeMediaIdBase;
    if (fromGraph !== current) {
      setSegmentScopeMediaOverride(fromGraph);
    }
  }, [segmentScopeMediaIdBase, segmentScopeMediaOverride, segmentsByLayer, selectedTimelineUnit]);

  return {
    activeTimelineUnitId,
    segmentScopeMediaId,
    segmentsByLayer,
    segmentsLoadComplete,
    reloadSegments,
    updateSegmentsLocally,
    segmentContentByLayer,
    reloadSegmentContents,
  };
}
