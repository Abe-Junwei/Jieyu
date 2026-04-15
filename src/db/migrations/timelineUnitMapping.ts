import type {
  LayerSegmentContentDocType,
  LayerSegmentDocType,
  LayerUnitContentDocType,
  LayerUnitDocType,
  UnitRelationDocType,
  UtteranceDocType,
} from '../types';
import { pickDefaultTranscriptionText } from '../../utils/transcriptionFormatters';

export function mapUtteranceToLayerUnit(
  utterance: UtteranceDocType,
  defaultLayerId: string,
): { unit: LayerUnitDocType; content: LayerUnitContentDocType } {
  return {
    unit: {
      id: utterance.id,
      textId: utterance.textId,
      mediaId: utterance.mediaId ?? '',
      layerId: defaultLayerId,
      unitType: 'utterance',
      startTime: utterance.startTime,
      endTime: utterance.endTime,
      ...(utterance.startAnchorId ? { startAnchorId: utterance.startAnchorId } : {}),
      ...(utterance.endAnchorId ? { endAnchorId: utterance.endAnchorId } : {}),
      ...(utterance.ordinal !== undefined ? { orderKey: String(utterance.ordinal) } : {}),
      ...(utterance.speakerId ? { speakerId: utterance.speakerId } : {}),
      ...(utterance.selfCertainty ? { selfCertainty: utterance.selfCertainty } : {}),
      ...(utterance.annotationStatus ? { status: utterance.annotationStatus } : {}),
      ...(utterance.provenance ? { provenance: utterance.provenance } : {}),
      createdAt: utterance.createdAt,
      updatedAt: utterance.updatedAt,
    },
    content: {
      id: utterance.id,
      textId: utterance.textId,
      unitId: utterance.id,
      layerId: defaultLayerId,
      contentRole: 'primary_text',
      modality: 'text',
      text: pickDefaultTranscriptionText(utterance.transcription),
      sourceType: 'human',
      ...(utterance.ai_metadata ? { ai_metadata: utterance.ai_metadata } : {}),
      createdAt: utterance.createdAt,
      updatedAt: utterance.updatedAt,
    },
  };
}

/** Project in-memory UtteranceDocType from canonical LayerUnit + primary_text content (read model). */
export function projectUtteranceDocFromLayerUnit(
  unit: LayerUnitDocType,
  primary: LayerUnitContentDocType | undefined,
  speakerDisplayName?: string,
): UtteranceDocType {
  const textStr = primary?.text?.trim() ?? '';
  let ordinal: number | undefined;
  if (unit.orderKey !== undefined && unit.orderKey.trim().length > 0) {
    const parsed = Number(unit.orderKey);
    if (Number.isFinite(parsed)) ordinal = parsed;
  }
  return {
    id: unit.id,
    textId: unit.textId,
    ...(unit.mediaId.trim().length > 0 ? { mediaId: unit.mediaId } : {}),
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
  segment: LayerSegmentDocType;
  content?: LayerSegmentContentDocType;
}): { unit: LayerUnitDocType; content?: LayerUnitContentDocType; relation?: UnitRelationDocType } {
  const { segment, content } = input;
  return {
    unit: {
      id: segment.id,
      textId: segment.textId,
      mediaId: segment.mediaId,
      layerId: segment.layerId,
      unitType: 'segment',
      ...(segment.utteranceId ? { parentUnitId: segment.utteranceId, rootUnitId: segment.utteranceId } : {}),
      startTime: segment.startTime,
      endTime: segment.endTime,
      ...(segment.startAnchorId ? { startAnchorId: segment.startAnchorId } : {}),
      ...(segment.endAnchorId ? { endAnchorId: segment.endAnchorId } : {}),
      ...(segment.ordinal !== undefined ? { orderKey: String(segment.ordinal) } : {}),
      ...(segment.speakerId ? { speakerId: segment.speakerId } : {}),
      ...(segment.externalRef ? { externalRef: segment.externalRef } : {}),
      ...(segment.provenance ? { provenance: segment.provenance } : {}),
      createdAt: segment.createdAt,
      updatedAt: segment.updatedAt,
    },
    ...(content
      ? {
          content: {
            id: content.id,
            textId: content.textId,
            unitId: segment.id,
            layerId: content.layerId,
            contentRole: 'primary_text',
            modality: content.modality,
            ...(content.text !== undefined ? { text: content.text } : {}),
            sourceType: content.sourceType,
            ...(content.ai_metadata ? { ai_metadata: content.ai_metadata } : {}),
            ...(content.provenance ? { provenance: content.provenance } : {}),
            ...(content.accessRights ? { accessRights: content.accessRights } : {}),
            createdAt: content.createdAt,
            updatedAt: content.updatedAt,
          } satisfies LayerUnitContentDocType,
        }
      : {}),
    ...(segment.utteranceId
      ? {
          relation: {
            id: `${segment.id}:derived_from:${segment.utteranceId}`,
            textId: segment.textId,
            sourceUnitId: segment.id,
            targetUnitId: segment.utteranceId,
            relationType: 'derived_from',
            createdAt: segment.createdAt,
            updatedAt: segment.updatedAt,
          } satisfies UnitRelationDocType,
        }
      : {}),
  };
}
