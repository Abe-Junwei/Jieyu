import {
  createTimelineUnit,
  isSegmentTimelineUnit,
  isUtteranceTimelineUnit,
  type TimelineUnit,
  type TimelineUnitKind,
} from '../hooks/transcriptionTypes';

interface ResolveTranscriptionUnitKindInput {
  layerId: string;
  preferredKind: TimelineUnitKind;
  independentLayerIds?: ReadonlySet<string>;
}

interface ResolveTranscriptionUnitTargetInput extends ResolveTranscriptionUnitKindInput {
  unitId: string;
}

interface ResolveTranscriptionSelectionAnchorInput {
  expectedKind: TimelineUnitKind;
  fallbackUnitId: string;
  selectedTimelineUnit: TimelineUnit | null | undefined;
}

export function resolveTranscriptionUnitKind(input: ResolveTranscriptionUnitKindInput): TimelineUnitKind {
  if (input.independentLayerIds?.has(input.layerId)) {
    return 'segment';
  }
  return input.preferredKind;
}

export function resolveTranscriptionUnitTarget(input: ResolveTranscriptionUnitTargetInput): TimelineUnit {
  return createTimelineUnit(
    input.layerId,
    input.unitId,
    resolveTranscriptionUnitKind(input),
  );
}

export function resolveTranscriptionSelectionAnchor(input: ResolveTranscriptionSelectionAnchorInput): string {
  if (input.expectedKind === 'segment') {
    return isSegmentTimelineUnit(input.selectedTimelineUnit)
      ? input.selectedTimelineUnit.unitId
      : input.fallbackUnitId;
  }
  return isUtteranceTimelineUnit(input.selectedTimelineUnit)
    ? input.selectedTimelineUnit.unitId
    : input.fallbackUnitId;
}