import type { TimelineUnit } from '../hooks/transcription/transcriptionTypes';

export function buildSelectedUnitIdsForSpeakerActions(input: {
  selectedUnitIds: Set<string>;
  selectedTimelineUnit: TimelineUnit | null;
}): string[] {
  const { selectedUnitIds, selectedTimelineUnit } = input;
  if (selectedUnitIds.size > 0) {
    return Array.from(selectedUnitIds)
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
  }
  if (selectedTimelineUnit?.unitId) {
    return selectedTimelineUnit.unitId.trim().length > 0 ? [selectedTimelineUnit.unitId] : [];
  }
  return [];
}
