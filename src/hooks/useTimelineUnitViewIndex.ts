import { useMemo, useRef } from 'react';
import type { LayerDocType, LayerLinkDocType, LayerUnitDocType } from '../db';
import { buildTimelineUnitViewIndex, type TimelineUnitViewIndex } from './timelineUnitView';

export interface UseTimelineUnitViewIndexInput {
  units: LayerUnitDocType[];
  unitsOnCurrentMedia: LayerUnitDocType[];
  segmentsByLayer: ReadonlyMap<string, LayerUnitDocType[]> | undefined;
  segmentContentByLayer: ReadonlyMap<string, ReadonlyMap<string, { text?: string }>> | undefined;
  currentMediaId: string | undefined;
  activeLayerIdForEdits: string | undefined;
  defaultTranscriptionLayerId: string | undefined;
  segmentsLoadComplete?: boolean;
  existingIndex?: TimelineUnitViewIndex;
  transcriptionLaneReadScope?: Readonly<{
    transcriptionLayers: readonly LayerDocType[];
    allLayersOrdered: readonly LayerDocType[];
    layerLinks?: ReadonlyArray<Pick<LayerLinkDocType, 'layerId' | 'transcriptionLayerKey' | 'hostTranscriptionLayerId' | 'isPreferred'>>;
  }>;
}

export type TimelineUnitViewIndexWithEpoch = TimelineUnitViewIndex;

/**
 * Derived read model over units + segments; single facade for timeline AI/UI consumers.
 */
export function useTimelineUnitViewIndex(input: UseTimelineUnitViewIndexInput): TimelineUnitViewIndexWithEpoch {
  const epochRef = useRef(0);

  return useMemo(() => {
    if (input.existingIndex) {
      return input.existingIndex;
    }
    epochRef.current += 1;
    return buildTimelineUnitViewIndex({
      units: input.units,
      unitsOnCurrentMedia: input.unitsOnCurrentMedia,
      segmentsByLayer: input.segmentsByLayer,
      segmentContentByLayer: input.segmentContentByLayer,
      currentMediaId: input.currentMediaId,
      activeLayerIdForEdits: input.activeLayerIdForEdits,
      defaultTranscriptionLayerId: input.defaultTranscriptionLayerId,
      epoch: epochRef.current,
      ...(input.segmentsLoadComplete !== undefined ? { segmentsLoadComplete: input.segmentsLoadComplete } : {}),
      ...(input.transcriptionLaneReadScope ? { transcriptionLaneReadScope: input.transcriptionLaneReadScope } : {}),
    });
  }, [
    input.existingIndex,
    input.units,
    input.unitsOnCurrentMedia,
    input.segmentsByLayer,
    input.segmentContentByLayer,
    input.currentMediaId,
    input.activeLayerIdForEdits,
    input.defaultTranscriptionLayerId,
    input.segmentsLoadComplete,
    input.transcriptionLaneReadScope,
  ]);
}
