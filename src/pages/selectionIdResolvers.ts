import type { TimelineUnit } from '../hooks/transcriptionTypes';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import { resolveSpeakerTargetUtteranceIdFromUnitId } from './timelineUnitViewUtteranceHelpers';

type SelectionMappingInput = {
  selectedUnitIds: Set<string>;
  selectedTimelineUnit: TimelineUnit | null | undefined;
};

export type UnitSelectionMappingResult = {
  hasSelectionSource: boolean;
  sourceUnitCount: number;
  unmappedSourceCount: number;
  mappedUnitIds: Set<string>;
};

function resolveSelectionSourceUnitIds(input: SelectionMappingInput): string[] {
  if (input.selectedUnitIds.size > 0) {
    return Array.from(new Set(
      Array.from(input.selectedUnitIds)
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    ));
  }
  const selectedUnitId = input.selectedTimelineUnit?.unitId?.trim() ?? '';
  return selectedUnitId.length > 0 ? [selectedUnitId] : [];
}

export function resolveMappedUnitIds(
  unitIds: Iterable<string>,
  unitViewById: ReadonlyMap<string, TimelineUnitView>,
  resolveUnitViewById?: (unitId: string) => TimelineUnitView | undefined,
): string[] {
  const unique = new Set<string>();
  for (const rawId of unitIds) {
    const id = rawId.trim();
    if (!id) continue;
    const resolved = resolveSpeakerTargetUtteranceIdFromUnitId(id, unitViewById, resolveUnitViewById);
    if (!resolved) continue;
    unique.add(resolved);
  }
  return Array.from(unique);
}

export function resolveMappedUnitIdsFromSelection(input: {
  selectedUnitIds: Set<string>;
  selectedTimelineUnit: TimelineUnit | null | undefined;
  unitViewById: ReadonlyMap<string, TimelineUnitView>;
  resolveUnitViewById?: (unitId: string) => TimelineUnitView | undefined;
}): Set<string> {
  return resolveUnitSelectionMapping(input).mappedUnitIds;
}

export function hasSelectionSourceForUnitMapping(input: SelectionMappingInput): boolean {
  return resolveSelectionSourceUnitIds(input).length > 0;
}

export function resolveUnitSelectionMapping(input: {
  selectedUnitIds: Set<string>;
  selectedTimelineUnit: TimelineUnit | null | undefined;
  unitViewById: ReadonlyMap<string, TimelineUnitView>;
  resolveUnitViewById?: (unitId: string) => TimelineUnitView | undefined;
}): UnitSelectionMappingResult {
  const sourceUnitIds = resolveSelectionSourceUnitIds(input);
  const hasSelectionSource = sourceUnitIds.length > 0;
  if (!hasSelectionSource) {
    return {
      hasSelectionSource: false,
      sourceUnitCount: 0,
      unmappedSourceCount: 0,
      mappedUnitIds: new Set<string>(),
    };
  }

  let mappedSourceCount = 0;
  const mappedUnitIds = new Set<string>();
  for (const unitId of sourceUnitIds) {
    const mappedUnitId = resolveSpeakerTargetUtteranceIdFromUnitId(unitId, input.unitViewById, input.resolveUnitViewById);
    if (!mappedUnitId) continue;
    mappedSourceCount += 1;
    mappedUnitIds.add(mappedUnitId);
  }

  return {
    hasSelectionSource,
    sourceUnitCount: sourceUnitIds.length,
    unmappedSourceCount: sourceUnitIds.length - mappedSourceCount,
    mappedUnitIds,
  };
}
