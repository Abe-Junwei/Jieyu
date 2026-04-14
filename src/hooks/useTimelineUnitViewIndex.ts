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
  utteranceCount: number;
  segmentsLoadComplete?: boolean;
}

export interface TimelineUnitViewIndexWithEpoch extends TimelineUnitViewIndex {
  /** Increments on each successful rebuild — for stale-write detection (AI preview). */
  epoch: number;
}

/**
 * Derived read model over utterances + segments; single facade for timeline AI/UI consumers.
 */
export function useTimelineUnitViewIndex(input: UseTimelineUnitViewIndexInput): TimelineUnitViewIndexWithEpoch {
  const epochRef = useRef(0);

  return useMemo(() => {
    epochRef.current += 1;
    const base = buildTimelineUnitViewIndex({
      utterances: input.utterances,
      utterancesOnCurrentMedia: input.utterancesOnCurrentMedia,
      segmentsByLayer: input.segmentsByLayer,
      segmentContentByLayer: input.segmentContentByLayer,
      currentMediaId: input.currentMediaId,
      activeLayerIdForEdits: input.activeLayerIdForEdits,
      defaultTranscriptionLayerId: input.defaultTranscriptionLayerId,
      utteranceCount: input.utteranceCount,
      ...(input.segmentsLoadComplete !== undefined ? { segmentsLoadComplete: input.segmentsLoadComplete } : {}),
    });
    return { ...base, epoch: epochRef.current };
  }, [
    input.utterances,
    input.utterancesOnCurrentMedia,
    input.segmentsByLayer,
    input.segmentContentByLayer,
    input.currentMediaId,
    input.activeLayerIdForEdits,
    input.defaultTranscriptionLayerId,
    input.utteranceCount,
    input.segmentsLoadComplete,
  ]);
}
