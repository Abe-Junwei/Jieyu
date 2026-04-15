import type { TimelineUnitView } from '../hooks/timelineUnitView';
import type { SegmentRoutingResult } from './transcriptionSegmentRouting';

/**
 * Where timeline edit side-effects must land for a unified unit id.
 * - `utterance-doc`: RxDB `utterances` (+ LayerUnit utterance row via existing hooks)
 * - `segment-layer`: independent / time-subdivision segment graph (`LayerSegmentationV2Service` / legacy app facades)
 */
export type TimelineUnitWritePath = 'utterance-doc' | 'segment-layer';

/**
 * Single routing policy for timeline mutations (ADR / plan: one dispatcher, explicit kind vs layer mode).
 *
 * Order of precedence matches legacy behavior:
 * 1. View model says `utterance` → always utterance-doc path.
 * 2. Active layer is independent segment or time-subdivision → segment-layer path.
 * 3. Otherwise (utterance edit mode on a non-utterance view row) → utterance-doc path.
 */
export function resolveTimelineUnitWritePath(
  unit: TimelineUnitView | undefined,
  routing: SegmentRoutingResult,
): TimelineUnitWritePath {
  if (unit?.kind === 'utterance') return 'utterance-doc';
  if (routing.editMode === 'independent-segment' || routing.editMode === 'time-subdivision') {
    return 'segment-layer';
  }
  return 'utterance-doc';
}

/**
 * Batch selection: if every selected id is an utterance-shaped view row, use utterance-doc;
 * otherwise same layer-mode rules as {@link resolveTimelineUnitWritePath} using `routing` only
 * (caller should still pass the same routing used for the active layer).
 */
export function resolveTimelineUnitSelectionWritePath(
  ids: ReadonlySet<string>,
  unitById: ReadonlyMap<string, TimelineUnitView>,
  routing: SegmentRoutingResult,
): TimelineUnitWritePath {
  if (ids.size > 0 && [...ids].every((id) => unitById.get(id)?.kind === 'utterance')) {
    return 'utterance-doc';
  }
  if (routing.editMode === 'independent-segment' || routing.editMode === 'time-subdivision') {
    return 'segment-layer';
  }
  return 'utterance-doc';
}

export async function dispatchTimelineUnitMutation<T>(input: {
  unit: TimelineUnitView | undefined;
  routing: SegmentRoutingResult;
  onUtteranceDoc: () => Promise<T>;
  onSegmentLayer: () => Promise<T>;
}): Promise<T> {
  const path = resolveTimelineUnitWritePath(input.unit, input.routing);
  if (path === 'utterance-doc') return input.onUtteranceDoc();
  return input.onSegmentLayer();
}

export async function dispatchTimelineUnitSelectionMutation<T>(input: {
  ids: ReadonlySet<string>;
  unitById: ReadonlyMap<string, TimelineUnitView>;
  routing: SegmentRoutingResult;
  onUtteranceDoc: () => Promise<T>;
  onSegmentLayer: () => Promise<T>;
}): Promise<T> {
  const path = resolveTimelineUnitSelectionWritePath(input.ids, input.unitById, input.routing);
  if (path === 'utterance-doc') return input.onUtteranceDoc();
  return input.onSegmentLayer();
}
