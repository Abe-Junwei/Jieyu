import { useCallback } from 'react';

import { clampIndependentSegmentInsertionRange } from '../utils/independentSegmentInsertionRange';
import { independentSegmentInsertionUpperBoundSec } from '../utils/timelineMediaDurationForBounds';

interface SegmentRoutingResult {
  editMode: string;
  sourceLayerId?: string | null;
}

interface SegmentUnitForClamp {
  kind: string;
  layerId: string;
  startTime: number;
  endTime: number;
}

interface UseReadyWorkspaceSegmentRangeClampInput {
  activeLayerIdForEdits?: string;
  resolveSegmentRoutingForLayer: (layerId?: string) => SegmentRoutingResult;
  currentMediaUnits: readonly SegmentUnitForClamp[];
  segmentScopeMediaItem: Parameters<typeof independentSegmentInsertionUpperBoundSec>[0];
  selectedTimelineMedia: Parameters<typeof independentSegmentInsertionUpperBoundSec>[0];
  getDocumentSpanSec: () => number;
}

export function useReadyWorkspaceSegmentRangeClamp(input: UseReadyWorkspaceSegmentRangeClampInput) {
  const {
    activeLayerIdForEdits,
    resolveSegmentRoutingForLayer,
    currentMediaUnits,
    segmentScopeMediaItem,
    selectedTimelineMedia,
    getDocumentSpanSec,
  } = input;

  return useCallback((rawStart: number, rawEnd: number) => {
    const routing = resolveSegmentRoutingForLayer(activeLayerIdForEdits);
    if (routing.editMode !== 'independent-segment') return null;
    if (!routing.sourceLayerId) return null;
    const siblings = currentMediaUnits
      .filter((u) => u.kind === 'segment' && u.layerId === routing.sourceLayerId)
      .map((u) => ({ startTime: u.startTime, endTime: u.endTime }));
    const mediaDuration = independentSegmentInsertionUpperBoundSec(
      segmentScopeMediaItem ?? selectedTimelineMedia,
      getDocumentSpanSec(),
    );
    const r = clampIndependentSegmentInsertionRange(rawStart, rawEnd, siblings, mediaDuration);
    if (!r.ok) return null;
    return { start: r.start, end: r.end };
  }, [
    activeLayerIdForEdits,
    currentMediaUnits,
    getDocumentSpanSec,
    resolveSegmentRoutingForLayer,
    segmentScopeMediaItem,
    selectedTimelineMedia,
  ]);
}
