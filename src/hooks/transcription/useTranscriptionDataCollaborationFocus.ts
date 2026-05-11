import type { TimelineUnit } from './transcriptionTypes';
import { isSegmentTimelineUnit, isUnitTimelineUnit } from './transcriptionTypes';

export type CollaborationPresenceFocus =
  | { entityType: 'layer_unit'; entityId: string }
  | { entityType: 'layer'; entityId: string }
  | Record<string, never>;

export function buildCollaborationPresenceFocus(
  selectedTimelineUnit: TimelineUnit | null,
  selectedLayerId: string | null | undefined,
): CollaborationPresenceFocus {
  if (isUnitTimelineUnit(selectedTimelineUnit) || isSegmentTimelineUnit(selectedTimelineUnit)) {
    return {
      entityType: 'layer_unit',
      entityId: selectedTimelineUnit.unitId,
    };
  }

  if (selectedLayerId) {
    return {
      entityType: 'layer',
      entityId: selectedLayerId,
    };
  }

  return {};
}
