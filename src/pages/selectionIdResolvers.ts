import type { TimelineUnit } from '../hooks/transcriptionTypes';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import { resolveSpeakerTargetUnitIdFromUnitId } from './timelineUnitViewUnitHelpers';

type SelectionMappingInput = {
  selectedUnitIds: Set<string>;
  selectedTimelineUnit: Pick<TimelineUnit, 'unitId'> | TimelineUnit | null | undefined;
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
    const resolved = resolveSpeakerTargetUnitIdFromUnitId(id, unitViewById, resolveUnitViewById);
    if (!resolved) continue;
    unique.add(resolved);
  }
  return Array.from(unique);
}

export function resolveSegmentOnlyIds(
  unitIds: Iterable<string>,
  unitViewById: ReadonlyMap<string, TimelineUnitView>,
  resolveUnitViewById?: (unitId: string) => TimelineUnitView | undefined,
): string[] {
  const unique = new Set<string>();
  for (const rawId of unitIds) {
    const id = rawId.trim();
    if (!id) continue;
    const view = resolveUnitViewById?.(id) ?? unitViewById.get(id);
    if (!view || view.kind !== 'segment') continue;
    unique.add(view.id);
  }
  return Array.from(unique);
}

export function resolveMappedUnitIdsFromSelection(input: {
  selectedUnitIds: Set<string>;
  selectedTimelineUnit: Pick<TimelineUnit, 'unitId'> | TimelineUnit | null | undefined;
  unitViewById: ReadonlyMap<string, TimelineUnitView>;
  resolveUnitViewById?: (unitId: string) => TimelineUnitView | undefined;
}): Set<string> {
  return resolveUnitSelectionMapping(input).mappedUnitIds;
}

export function resolveSegmentOnlyIdsFromSelection(input: {
  selectedUnitIds: Set<string>;
  selectedTimelineUnit: Pick<TimelineUnit, 'unitId'> | TimelineUnit | null | undefined;
  unitViewById: ReadonlyMap<string, TimelineUnitView>;
  resolveUnitViewById?: (unitId: string) => TimelineUnitView | undefined;
}): Set<string> {
  const sourceUnitIds = resolveSelectionSourceUnitIds(input);
  return new Set(resolveSegmentOnlyIds(sourceUnitIds, input.unitViewById, input.resolveUnitViewById));
}

/** 与治理方案文档中的命名对齐；语义同 {@link resolveSegmentOnlyIds}。 | Doc-aligned alias for parent-unit governance plan. */
export const resolveSegmentActionIds = resolveSegmentOnlyIds;

/** 语义同 {@link resolveSegmentOnlyIdsFromSelection}。 | Doc-aligned alias. */
export const resolveSegmentActionIdsFromSelection = resolveSegmentOnlyIdsFromSelection;

export function hasSelectionSourceForUnitMapping(input: SelectionMappingInput): boolean {
  return resolveSelectionSourceUnitIds(input).length > 0;
}

export function resolveUnitSelectionMapping(input: {
  selectedUnitIds: Set<string>;
  selectedTimelineUnit: Pick<TimelineUnit, 'unitId'> | TimelineUnit | null | undefined;
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
    const mappedUnitId = resolveSpeakerTargetUnitIdFromUnitId(unitId, input.unitViewById, input.resolveUnitViewById);
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
