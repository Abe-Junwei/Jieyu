import type { LayerUnitContentDocType, LayerUnitDocType, UnitRelationDocType } from '../types';
import { pickDefaultTranscriptionText } from '../../utils/transcriptionFormatters';

export function mapUnitToLayerUnit(
  unit: LayerUnitDocType,
  defaultLayerId: string,
): { unit: LayerUnitDocType; content: LayerUnitContentDocType } {
  return {
    unit: {
      id: unit.id,
      textId: unit.textId,
      mediaId: unit.mediaId ?? '',
      layerId: defaultLayerId,
      unitType: 'unit',
      startTime: unit.startTime,
      endTime: unit.endTime,
      ...(unit.startAnchorId ? { startAnchorId: unit.startAnchorId } : {}),
      ...(unit.endAnchorId ? { endAnchorId: unit.endAnchorId } : {}),
      ...(unit.ordinal !== undefined ? { orderKey: String(unit.ordinal) } : {}),
      ...(unit.speakerId ? { speakerId: unit.speakerId } : {}),
      ...(unit.selfCertainty ? { selfCertainty: unit.selfCertainty } : {}),
      ...(unit.annotationStatus ? { status: unit.annotationStatus } : {}),
      ...(unit.provenance ? { provenance: unit.provenance } : {}),
      createdAt: unit.createdAt,
      updatedAt: unit.updatedAt,
    },
    content: {
      id: unit.id,
      textId: unit.textId,
      unitId: unit.id,
      layerId: defaultLayerId,
      contentRole: 'primary_text',
      modality: 'text',
      text: pickDefaultTranscriptionText(unit.transcription),
      sourceType: 'human',
      ...(unit.ai_metadata ? { ai_metadata: unit.ai_metadata } : {}),
      createdAt: unit.createdAt,
      updatedAt: unit.updatedAt,
    },
  };
}

/** Project in-memory LayerUnitDocType from canonical LayerUnit + primary_text content (read model). */
export function projectUnitDocFromLayerUnit(
  unit: LayerUnitDocType,
  primary: LayerUnitContentDocType | undefined,
  speakerDisplayName?: string,
): LayerUnitDocType {
  const textStr = primary?.text?.trim() ?? '';
  let ordinal: number | undefined;
  if (unit.orderKey !== undefined && unit.orderKey.trim().length > 0) {
    const parsed = Number(unit.orderKey);
    if (Number.isFinite(parsed)) ordinal = parsed;
  }
  return {
    id: unit.id,
    textId: unit.textId,
    ...((unit.mediaId?.trim() ?? '').length > 0 ? { mediaId: unit.mediaId } : {}),
    ...(textStr.length > 0 ? { transcription: { default: textStr } } : {}),
    ...(speakerDisplayName ? { speaker: speakerDisplayName } : {}),
    ...(unit.speakerId ? { speakerId: unit.speakerId } : {}),
    ...(unit.selfCertainty ? { selfCertainty: unit.selfCertainty } : {}),
    startTime: unit.startTime,
    endTime: unit.endTime,
    ...(ordinal !== undefined ? { ordinal } : {}),
    ...(unit.startAnchorId ? { startAnchorId: unit.startAnchorId } : {}),
    ...(unit.endAnchorId ? { endAnchorId: unit.endAnchorId } : {}),
    ...(unit.status ? { annotationStatus: unit.status } : {}),
    ...(unit.provenance ? { provenance: unit.provenance } : {}),
    createdAt: unit.createdAt,
    updatedAt: unit.updatedAt,
  };
}

export function mapSegmentToLayerUnit(input: {
  segment: LayerUnitDocType;
  content?: LayerUnitContentDocType;
}): { unit: LayerUnitDocType; content?: LayerUnitContentDocType; relation?: UnitRelationDocType } {
  const { segment, content } = input;
  return {
    unit: {
      id: segment.id,
      textId: segment.textId,
      mediaId: segment.mediaId ?? '',
      layerId: segment.layerId ?? '',
      unitType: 'segment',
      ...(segment.unitId ? { parentUnitId: segment.unitId, rootUnitId: segment.unitId } : {}),
      startTime: segment.startTime,
      endTime: segment.endTime,
      ...(segment.startAnchorId ? { startAnchorId: segment.startAnchorId } : {}),
      ...(segment.endAnchorId ? { endAnchorId: segment.endAnchorId } : {}),
      ...(segment.ordinal !== undefined ? { orderKey: String(segment.ordinal) } : {}),
      ...(segment.speakerId ? { speakerId: segment.speakerId } : {}),
      ...(segment.externalRef ? { externalRef: segment.externalRef } : {}),
      ...(segment.selfCertainty ? { selfCertainty: segment.selfCertainty } : {}),
      ...((segment.status ?? segment.annotationStatus)
        ? { status: segment.status ?? segment.annotationStatus }
        : {}),
      ...(segment.provenance ? { provenance: segment.provenance } : {}),
      createdAt: segment.createdAt,
      updatedAt: segment.updatedAt,
    },
    ...(content
      ? {
          content: {
            id: content.id,
            textId: content.textId ?? segment.textId,
            unitId: segment.id,
            segmentId: segment.id,
            layerId: content.layerId ?? segment.layerId,
            contentRole: 'primary_text',
            modality: content.modality ?? 'text',
            ...(content.text !== undefined ? { text: content.text } : {}),
            sourceType: content.sourceType ?? 'human',
            ...(content.ai_metadata ? { ai_metadata: content.ai_metadata } : {}),
            ...(content.provenance ? { provenance: content.provenance } : {}),
            ...(content.accessRights ? { accessRights: content.accessRights } : {}),
            createdAt: content.createdAt,
            updatedAt: content.updatedAt,
          } satisfies LayerUnitContentDocType,
        }
      : {}),
    ...(segment.unitId
      ? {
          relation: {
            id: `${segment.id}:derived_from:${segment.unitId}`,
            textId: segment.textId,
            sourceUnitId: segment.id,
            targetUnitId: segment.unitId,
            relationType: 'derived_from',
            createdAt: segment.createdAt,
            updatedAt: segment.updatedAt,
          } satisfies UnitRelationDocType,
        }
      : {}),
  };
}
