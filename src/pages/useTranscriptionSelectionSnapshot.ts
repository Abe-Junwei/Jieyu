import { useMemo } from 'react';
import { buildTranscriptionSelectionSnapshot, type BuildTranscriptionSelectionSnapshotInput } from './transcriptionSelectionSnapshot';

export function useTranscriptionSelectionSnapshot(input: BuildTranscriptionSelectionSnapshotInput) {
  return useMemo(() => buildTranscriptionSelectionSnapshot(input), [
    input.formatTime,
    input.getUnitTextForLayer,
    input.layers,
    input.segmentContentByLayer,
    input.selectedLayerId,
    input.primaryUnitView,
    input.selectedTimelineOwnerUnit,
    input.selectedTimelineRowMeta,
    input.selectedTimelineSegment,
    input.selectedTimelineUnit,
  ]);
}
