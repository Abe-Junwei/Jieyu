import type { TimelineUnit } from '../hooks/transcription/transcriptionTypes';

export type TimelineSelectionProjectionKind = 'none' | 'single' | 'multi';

/** 阶段 F：选集只读投影（聚合 RM selection 字段，不写）。 */
export type TimelineSelectionProjection = {
  focus: TimelineUnit | null;
  selectedIds: readonly string[];
  selectionCount: number;
  isMultiSelect: boolean;
  kind: TimelineSelectionProjectionKind;
  activeLayerIdForEdits?: string;
};

/** 宿主/UI 读路径：由只读投影派生 Set，勿再平行维护另一份 id 集合。 */
export function timelineSelectionUnitIdsSet(projection: TimelineSelectionProjection): Set<string> {
  return new Set(projection.selectedIds);
}

export function buildTimelineSelectionProjection(input: {
  selectedTimelineUnit: TimelineUnit | null;
  selectedUnitIds: readonly string[];
  activeLayerIdForEdits?: string;
}): TimelineSelectionProjection {
  const selectedIds = input.selectedUnitIds;
  const selectionCount = selectedIds.length;
  const focus = input.selectedTimelineUnit;
  const isMultiSelect = selectionCount > 1;
  const kind: TimelineSelectionProjectionKind =
    focus === null && selectionCount === 0 ? 'none' : isMultiSelect ? 'multi' : 'single';

  return {
    focus,
    selectedIds,
    selectionCount,
    isMultiSelect,
    kind,
    ...(input.activeLayerIdForEdits !== undefined
      ? { activeLayerIdForEdits: input.activeLayerIdForEdits }
      : {}),
  };
}
