import type { LayerSegmentContentDocType, LayerSegmentDocType, LayerUnitContentDocType, LayerUnitDocType, UnitRelationDocType, UtteranceDocType } from '../types';
import { mapSegmentToLayerUnit, mapUtteranceToLayerUnit } from './timelineUnitMapping';

export interface UnifiedUnitBackfillPayload {
  units: LayerUnitDocType[];
  contents: LayerUnitContentDocType[];
  relations: UnitRelationDocType[];
}

export function buildUnifiedUnitBackfill(input: {
  utterances: readonly UtteranceDocType[];
  segments: readonly LayerSegmentDocType[];
  segmentContents?: readonly LayerSegmentContentDocType[];
  defaultTranscriptionLayerId: string;
}): UnifiedUnitBackfillPayload {
  const contentsBySegmentId = new Map((input.segmentContents ?? []).map((content) => [content.segmentId, content] as const));
  const utteranceRows = input.utterances.map((utterance) => mapUtteranceToLayerUnit(utterance, input.defaultTranscriptionLayerId));
  const segmentRows = input.segments.map((segment) => {
    const content = contentsBySegmentId.get(segment.id);
    return mapSegmentToLayerUnit({
      segment,
      ...(content ? { content } : {}),
    });
  });
  return {
    units: [...utteranceRows.map((row) => row.unit), ...segmentRows.map((row) => row.unit)],
    contents: [
      ...utteranceRows.map((row) => row.content),
      ...segmentRows.flatMap((row) => (row.content ? [row.content] : [])),
    ],
    relations: segmentRows.flatMap((row) => (row.relation ? [row.relation] : [])),
  };
}
