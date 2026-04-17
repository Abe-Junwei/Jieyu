import type { LayerUnitDocType } from '../types/transcriptionDomain.types';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import { resolveSegmentOwnerUnit } from './transcriptionSelectionOwnerResolver';
import { unitDocForSpeakerTargetFromUnitView } from './timelineUnitViewUnitHelpers';

/**
 * AI 选择上下文收口 | Narrow AI selection context into pure helpers.
 */
export function buildOwnerUnitCandidates(
  allUnits: ReadonlyArray<TimelineUnitView>,
  getUnitDocById: (id: string) => LayerUnitDocType | undefined,
  toSyntheticUnit: (unit: TimelineUnitView) => LayerUnitDocType,
): LayerUnitDocType[] {
  const byId = new Map<string, LayerUnitDocType>();
  for (const unit of allUnits) {
    if (unit.kind !== 'unit') continue;
    if (byId.has(unit.id)) continue;
    const fromDb = getUnitDocById(unit.id);
    byId.set(unit.id, fromDb ?? toSyntheticUnit(unit));
  }
  return [...byId.values()];
}

export function resolveOwnerUnitForAi(input: {
  selectedUnit: TimelineUnitView | null;
  getUnitDocById: (id: string) => LayerUnitDocType | undefined;
  selectedTimelineSegment: LayerUnitDocType | null | undefined;
  ownerCandidates: ReadonlyArray<LayerUnitDocType>;
}): LayerUnitDocType | undefined {
  const direct = resolveExplicitOwnerUnitForAi(input);
  if (direct) return direct;
  if (!input.selectedTimelineSegment) return undefined;
  return resolveSegmentOwnerUnit(input.selectedTimelineSegment, input.ownerCandidates);
}

export function resolveExplicitOwnerUnitForAi(input: {
  selectedUnit: TimelineUnitView | null;
  getUnitDocById: (id: string) => LayerUnitDocType | undefined;
  selectedTimelineSegment: LayerUnitDocType | null | undefined;
  ownerCandidates: ReadonlyArray<LayerUnitDocType>;
}): LayerUnitDocType | undefined {
  const direct = unitDocForSpeakerTargetFromUnitView(input.selectedUnit, input.getUnitDocById);
  if (direct) return direct;

  const explicitOwnerId = input.selectedTimelineSegment?.unitId?.trim();
  if (!explicitOwnerId) return undefined;

  return input.ownerCandidates.find((item) => item.id === explicitOwnerId)
    ?? input.getUnitDocById(explicitOwnerId);
}

export function resolveWritableAiTargetId(input: {
  selectedUnitKind?: string | null | undefined;
  selectedTimelineSegmentId: string | undefined;
  snapshotTimelineUnitId: string | undefined;
  explicitOwnerUnitId: string | undefined;
}): string | undefined {
  if (input.selectedUnitKind === 'segment') {
    return input.selectedTimelineSegmentId ?? input.snapshotTimelineUnitId ?? undefined;
  }
  if (input.selectedUnitKind === 'unit') {
    return input.explicitOwnerUnitId ?? undefined;
  }
  return undefined;
}
