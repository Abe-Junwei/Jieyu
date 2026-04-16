import type { LayerSegmentDocType, UtteranceDocType } from '../db';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import { resolveSegmentOwnerUtterance } from './transcriptionSelectionOwnerResolver';
import { utteranceDocForSpeakerTargetFromUnitView } from './timelineUnitViewUtteranceHelpers';

/**
 * AI 选择上下文收口 | Narrow AI selection context into pure helpers.
 */
export function buildOwnerUtteranceCandidates(
  allUnits: ReadonlyArray<TimelineUnitView>,
  getUtteranceDocById: (id: string) => UtteranceDocType | undefined,
  toSyntheticUtterance: (unit: TimelineUnitView) => UtteranceDocType,
): UtteranceDocType[] {
  const byId = new Map<string, UtteranceDocType>();
  for (const unit of allUnits) {
    if (unit.kind !== 'utterance') continue;
    if (byId.has(unit.id)) continue;
    const fromDb = getUtteranceDocById(unit.id);
    byId.set(unit.id, fromDb ?? toSyntheticUtterance(unit));
  }
  return [...byId.values()];
}

export function resolveOwnerUtteranceForAi(input: {
  selectedUnit: TimelineUnitView | null;
  getUtteranceDocById: (id: string) => UtteranceDocType | undefined;
  selectedTimelineSegment: LayerSegmentDocType | null | undefined;
  ownerCandidates: ReadonlyArray<UtteranceDocType>;
}): UtteranceDocType | undefined {
  const direct = utteranceDocForSpeakerTargetFromUnitView(input.selectedUnit, input.getUtteranceDocById);
  if (direct) return direct;
  if (!input.selectedTimelineSegment) return undefined;
  return resolveSegmentOwnerUtterance(input.selectedTimelineSegment, input.ownerCandidates);
}

export function resolveSelectedAiSegmentTargetId(input: {
  selectedUnitKind?: string | null | undefined;
  selectedTimelineSegmentId: string | undefined;
  snapshotTimelineUnitId: string | undefined;
  resolvedOwnerUtteranceId: string | undefined;
}): string | undefined {
  if (input.selectedUnitKind === 'segment') {
    return input.selectedTimelineSegmentId ?? input.snapshotTimelineUnitId ?? undefined;
  }
  return input.resolvedOwnerUtteranceId ?? undefined;
}
