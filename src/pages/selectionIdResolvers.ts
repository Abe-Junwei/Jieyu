import type { TimelineUnit } from '../hooks/transcriptionTypes';

type SelectionMappingInput = {
  selectedUtteranceIds: Set<string>;
  selectedTimelineUnit: TimelineUnit | null | undefined;
};

export type UtteranceSelectionMappingResult = {
  hasSelectionSource: boolean;
  sourceUnitCount: number;
  unmappedSourceCount: number;
  mappedUtteranceIds: Set<string>;
};

function resolveSelectionSourceUnitIds(input: SelectionMappingInput): string[] {
  if (input.selectedUtteranceIds.size > 0) {
    return Array.from(new Set(
      Array.from(input.selectedUtteranceIds)
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    ));
  }
  const selectedUnitId = input.selectedTimelineUnit?.unitId?.trim() ?? '';
  return selectedUnitId.length > 0 ? [selectedUnitId] : [];
}

export function resolveMappedUtteranceIds(
  unitIds: Iterable<string>,
  unitToUtteranceId: ReadonlyMap<string, string>,
): string[] {
  const unique = new Set<string>();
  for (const rawId of unitIds) {
    const id = rawId.trim();
    if (!id) continue;
    const resolved = unitToUtteranceId.get(id);
    if (!resolved) continue;
    unique.add(resolved);
  }
  return Array.from(unique);
}

export function resolveMappedUtteranceIdsFromSelection(input: {
  selectedUtteranceIds: Set<string>;
  selectedTimelineUnit: TimelineUnit | null | undefined;
  unitToUtteranceId: ReadonlyMap<string, string>;
}): Set<string> {
  return resolveUtteranceSelectionMapping(input).mappedUtteranceIds;
}

export function hasSelectionSourceForUtteranceMapping(input: SelectionMappingInput): boolean {
  return resolveSelectionSourceUnitIds(input).length > 0;
}

export function resolveUtteranceSelectionMapping(input: {
  selectedUtteranceIds: Set<string>;
  selectedTimelineUnit: TimelineUnit | null | undefined;
  unitToUtteranceId: ReadonlyMap<string, string>;
}): UtteranceSelectionMappingResult {
  const sourceUnitIds = resolveSelectionSourceUnitIds(input);
  const hasSelectionSource = sourceUnitIds.length > 0;
  if (!hasSelectionSource) {
    return {
      hasSelectionSource: false,
      sourceUnitCount: 0,
      unmappedSourceCount: 0,
      mappedUtteranceIds: new Set<string>(),
    };
  }

  let mappedSourceCount = 0;
  const mappedUtteranceIds = new Set<string>();
  for (const unitId of sourceUnitIds) {
    const mappedUtteranceId = input.unitToUtteranceId.get(unitId);
    if (!mappedUtteranceId) continue;
    mappedSourceCount += 1;
    mappedUtteranceIds.add(mappedUtteranceId);
  }

  return {
    hasSelectionSource,
    sourceUnitCount: sourceUnitIds.length,
    unmappedSourceCount: sourceUnitIds.length - mappedSourceCount,
    mappedUtteranceIds,
  };
}
