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
      ...(unit.startAnchorId !== undefined && unit.startAnchorId.length > 0
        ? { startAnchorId: unit.startAnchorId }
        : {}),
      ...(unit.endAnchorId !== undefined && unit.endAnchorId.length > 0
        ? { endAnchorId: unit.endAnchorId }
        : {}),
      ...(unit.ordinal !== undefined ? { orderKey: String(unit.ordinal) } : {}),
      ...(unit.speakerId !== undefined && unit.speakerId.length > 0
        ? { speakerId: unit.speakerId }
        : {}),
      ...(unit.selfCertainty !== undefined ? { selfCertainty: unit.selfCertainty } : {}),
      ...(unit.annotationStatus !== undefined && unit.annotationStatus.length > 0
        ? { status: unit.annotationStatus }
        : {}),
      ...(unit.provenance !== undefined ? { provenance: unit.provenance } : {}),
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
      ...(unit.ai_metadata !== undefined ? { ai_metadata: unit.ai_metadata } : {}),
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
    ...(speakerDisplayName !== undefined && speakerDisplayName.length > 0
      ? { speaker: speakerDisplayName }
      : {}),
    ...(unit.speakerId !== undefined && unit.speakerId.length > 0
      ? { speakerId: unit.speakerId }
      : {}),
    ...(unit.selfCertainty !== undefined ? { selfCertainty: unit.selfCertainty } : {}),
    startTime: unit.startTime,
    endTime: unit.endTime,
    ...(ordinal !== undefined ? { ordinal } : {}),
    ...(unit.startAnchorId !== undefined && unit.startAnchorId.length > 0
      ? { startAnchorId: unit.startAnchorId }
      : {}),
    ...(unit.endAnchorId !== undefined && unit.endAnchorId.length > 0
      ? { endAnchorId: unit.endAnchorId }
      : {}),
    ...(unit.status !== undefined && unit.status.length > 0
      ? { annotationStatus: unit.status }
      : {}),
    ...(unit.provenance !== undefined ? { provenance: unit.provenance } : {}),
    createdAt: unit.createdAt,
    updatedAt: unit.updatedAt,
  };
}

export function mapSegmentToLayerUnit(input: {
  segment: LayerUnitDocType;
  content?: LayerUnitContentDocType;
}): { unit: LayerUnitDocType; content?: LayerUnitContentDocType; relation?: UnitRelationDocType } {
  const { segment, content } = input;
  const segmentUnitId = segment.unitId;
  const resolvedSegmentStatus = segment.status ?? segment.annotationStatus;
  return {
    unit: {
      id: segment.id,
      textId: segment.textId,
      mediaId: segment.mediaId ?? '',
      layerId: segment.layerId ?? '',
      unitType: 'segment',
      ...(segmentUnitId !== undefined && segmentUnitId.length > 0
        ? { parentUnitId: segmentUnitId, rootUnitId: segmentUnitId }
        : {}),
      startTime: segment.startTime,
      endTime: segment.endTime,
      ...(segment.startAnchorId !== undefined && segment.startAnchorId.length > 0
        ? { startAnchorId: segment.startAnchorId }
        : {}),
      ...(segment.endAnchorId !== undefined && segment.endAnchorId.length > 0
        ? { endAnchorId: segment.endAnchorId }
        : {}),
      ...(segment.ordinal !== undefined ? { orderKey: String(segment.ordinal) } : {}),
      ...(segment.speakerId !== undefined && segment.speakerId.length > 0
        ? { speakerId: segment.speakerId }
        : {}),
      ...(segment.externalRef !== undefined && segment.externalRef.length > 0
        ? { externalRef: segment.externalRef }
        : {}),
      ...(segment.selfCertainty !== undefined ? { selfCertainty: segment.selfCertainty } : {}),
      ...(resolvedSegmentStatus !== undefined && resolvedSegmentStatus.length > 0
        ? { status: resolvedSegmentStatus }
        : {}),
      ...(segment.provenance !== undefined ? { provenance: segment.provenance } : {}),
      createdAt: segment.createdAt,
      updatedAt: segment.updatedAt,
    },
    ...(content !== undefined
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
            ...(content.ai_metadata !== undefined ? { ai_metadata: content.ai_metadata } : {}),
            ...(content.provenance !== undefined ? { provenance: content.provenance } : {}),
            ...(content.accessRights !== undefined ? { accessRights: content.accessRights } : {}),
            createdAt: content.createdAt,
            updatedAt: content.updatedAt,
          } satisfies LayerUnitContentDocType,
        }
      : {}),
    ...(segmentUnitId !== undefined && segmentUnitId.length > 0
      ? {
          relation: {
            id: `${segment.id}:derived_from:${segmentUnitId}`,
            textId: segment.textId,
            sourceUnitId: segment.id,
            targetUnitId: segmentUnitId,
            relationType: 'derived_from',
            createdAt: segment.createdAt,
            updatedAt: segment.updatedAt,
          } satisfies UnitRelationDocType,
        }
      : {}),
  };
}
