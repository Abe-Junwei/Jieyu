import type { TimelineUnitView } from '../hooks/timelineUnitView';
import type { SegmentRoutingResult } from './transcriptionSegmentRouting';

/**
 * Where timeline edit side-effects must land for a unified unit id.
 * - `unit-doc`: RxDB `units` (+ LayerUnit unit row via existing hooks)
 * - `segment-layer`: independent / time-subdivision segment graph (`LayerSegmentationV2Service` / legacy app facades)
 */
export type TimelineUnitWritePath = 'unit-doc' | 'segment-layer';

/**
 * Single routing policy for timeline mutations (ADR / plan: one dispatcher, explicit kind vs layer mode).
 *
 * Order of precedence matches legacy behavior:
 * 1. View model says `unit` → always unit-doc path.
 * 2. Active layer is independent segment or time-subdivision → segment-layer path.
 * 3. Otherwise (unit edit mode on a non-unit view row) → unit-doc path.
 */
export function resolveTimelineUnitWritePath(
  unit: TimelineUnitView | undefined,
  routing: SegmentRoutingResult,
): TimelineUnitWritePath {
  if (unit?.kind === 'unit') return 'unit-doc';
  if (routing.editMode === 'independent-segment' || routing.editMode === 'time-subdivision') {
    return 'segment-layer';
  }
  return 'unit-doc';
}

/**
 * Batch selection: if every selected id is an unit-shaped view row, use unit-doc;
 * otherwise same layer-mode rules as {@link resolveTimelineUnitWritePath} using `routing` only
 * (caller should still pass the same routing used for the active layer).
 */
export function resolveTimelineUnitSelectionWritePath(
  ids: ReadonlySet<string>,
  unitById: ReadonlyMap<string, TimelineUnitView>,
  routing: SegmentRoutingResult,
): TimelineUnitWritePath {
  if (ids.size > 0 && [...ids].every((id) => unitById.get(id)?.kind === 'unit')) {
    return 'unit-doc';
  }
  if (routing.editMode === 'independent-segment' || routing.editMode === 'time-subdivision') {
    return 'segment-layer';
  }
  return 'unit-doc';
}

export async function dispatchTimelineUnitMutation<T>(input: {
  unit: TimelineUnitView | undefined;
  routing: SegmentRoutingResult;
  onUnitDoc: () => Promise<T>;
  onSegmentLayer: () => Promise<T>;
}): Promise<T> {
  const path = resolveTimelineUnitWritePath(input.unit, input.routing);
  if (path === 'unit-doc') return input.onUnitDoc();
  return input.onSegmentLayer();
}

export async function dispatchTimelineUnitSelectionMutation<T>(input: {
  ids: ReadonlySet<string>;
  unitById: ReadonlyMap<string, TimelineUnitView>;
  routing: SegmentRoutingResult;
  onUnitDoc: () => Promise<T>;
  onSegmentLayer: () => Promise<T>;
}): Promise<T> {
  const path = resolveTimelineUnitSelectionWritePath(input.ids, input.unitById, input.routing);
  if (path === 'unit-doc') return input.onUnitDoc();
  return input.onSegmentLayer();
}
