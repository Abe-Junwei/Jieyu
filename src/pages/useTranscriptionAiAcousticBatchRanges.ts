import { useMemo } from 'react';
import type { MediaItemDocType } from '../types/jieyuDbDocTypes';
import type { TimelineUnitViewIndexWithEpoch } from '../hooks/transcription/useTimelineUnitViewIndex';

export function useTranscriptionAiAcousticBatchRanges(input: {
  timelineUnitViewIndex: TimelineUnitViewIndexWithEpoch;
  scopeMediaItemForAi?: MediaItemDocType | undefined;
  selectedUnitIds: Set<string>;
}) {
  const { timelineUnitViewIndex, scopeMediaItemForAi, selectedUnitIds } = input;
  return useMemo(() => {
    const selectedUnits = new Map<
      string,
      (typeof timelineUnitViewIndex.currentMediaUnits)[number]
    >();
    const selectedMediaId = scopeMediaItemForAi?.id;
    for (const selectedId of selectedUnitIds) {
      const directHit = timelineUnitViewIndex.resolveBySemanticId(selectedId);
      if (
        directHit &&
        (selectedMediaId === undefined ||
          selectedMediaId.length === 0 ||
          directHit.mediaId === selectedMediaId)
      ) {
        selectedUnits.set(directHit.id, directHit);
      }
      for (const referringUnit of timelineUnitViewIndex.getReferringUnits(selectedId)) {
        if (
          selectedMediaId === undefined ||
          selectedMediaId.length === 0 ||
          referringUnit.mediaId === selectedMediaId
        ) {
          selectedUnits.set(referringUnit.id, referringUnit);
        }
      }
    }
    return Array.from(selectedUnits.values())
      .sort((left, right) => left.startTime - right.startTime)
      .map((unit) => ({
        selectionId: unit.id,
        selectionLabel: unit.id,
        selectionStartSec: unit.startTime,
        selectionEndSec: unit.endTime,
      }));
  }, [timelineUnitViewIndex, scopeMediaItemForAi?.id, selectedUnitIds]);
}
