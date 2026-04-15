import { useMemo, useRef } from 'react';
import type { LayerSegmentDocType, UtteranceDocType } from '../db';
import {
  buildTimelineUnitViewIndex,
  type TimelineUnitViewIndex,
} from './timelineUnitView';

export interface UseTimelineUnitViewIndexInput {
  utterances: UtteranceDocType[];
  utterancesOnCurrentMedia: UtteranceDocType[];
  segmentsByLayer: ReadonlyMap<string, LayerSegmentDocType[]> | undefined;
  segmentContentByLayer: ReadonlyMap<string, ReadonlyMap<string, { text?: string }>> | undefined;
  currentMediaId: string | undefined;
  activeLayerIdForEdits: string | undefined;
  defaultTranscriptionLayerId: string | undefined;
  segmentsLoadComplete?: boolean;
  existingIndex?: TimelineUnitViewIndex;
}

export type TimelineUnitViewIndexWithEpoch = TimelineUnitViewIndex;

/**
 * Derived read model over utterances + segments; single facade for timeline AI/UI consumers.
 */
export function useTimelineUnitViewIndex(input: UseTimelineUnitViewIndexInput): TimelineUnitViewIndexWithEpoch {
  const epochRef = useRef(0);

  return useMemo(() => {
    if (input.existingIndex) {
      return input.existingIndex;
    }
    epochRef.current += 1;
    return buildTimelineUnitViewIndex({
      utterances: input.utterances,
      utterancesOnCurrentMedia: input.utterancesOnCurrentMedia,
      segmentsByLayer: input.segmentsByLayer,
      segmentContentByLayer: input.segmentContentByLayer,
      currentMediaId: input.currentMediaId,
      activeLayerIdForEdits: input.activeLayerIdForEdits,
      defaultTranscriptionLayerId: input.defaultTranscriptionLayerId,
      epoch: epochRef.current,
      ...(input.segmentsLoadComplete !== undefined ? { segmentsLoadComplete: input.segmentsLoadComplete } : {}),
    });
  }, [
    input.existingIndex,
    input.utterances,
    input.utterancesOnCurrentMedia,
    input.segmentsByLayer,
    input.segmentContentByLayer,
    input.currentMediaId,
    input.activeLayerIdForEdits,
    input.defaultTranscriptionLayerId,
    input.segmentsLoadComplete,
  ]);
}
