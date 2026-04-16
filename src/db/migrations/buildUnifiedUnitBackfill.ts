import type { LayerUnitContentDocType, LayerUnitDocType, UnitRelationDocType } from '../types';
import { mapSegmentToLayerUnit, mapUnitToLayerUnit } from './timelineUnitMapping';

export interface UnifiedUnitBackfillPayload {
  units: LayerUnitDocType[];
  contents: LayerUnitContentDocType[];
  relations: UnitRelationDocType[];
}

export function buildUnifiedUnitBackfill(input: {
  units: readonly LayerUnitDocType[];
  segments: readonly LayerUnitDocType[];
  segmentContents?: readonly LayerUnitContentDocType[];
  defaultTranscriptionLayerId: string;
}): UnifiedUnitBackfillPayload {
  const contentsBySegmentId = new Map((input.segmentContents ?? []).map((content) => [content.segmentId, content] as const));
  const unitRows = input.units.map((unit) => mapUnitToLayerUnit(unit, input.defaultTranscriptionLayerId));
  const segmentRows = input.segments.map((segment) => {
    const content = contentsBySegmentId.get(segment.id);
    return mapSegmentToLayerUnit({
      segment,
      ...(content ? { content } : {}),
    });
  });
  return {
    units: [...unitRows.map((row) => row.unit), ...segmentRows.map((row) => row.unit)],
    contents: [
      ...unitRows.map((row) => row.content),
      ...segmentRows.flatMap((row) => (row.content ? [row.content] : [])),
    ],
    relations: segmentRows.flatMap((row) => (row.relation ? [row.relation] : [])),
  };
}
