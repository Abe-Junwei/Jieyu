import type { LayerUnitContentDocType, LayerUnitDocType } from '../db/types';
import { pickDefaultTranscriptionText } from './transcriptionFormatters';

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
      ...(unit.addressee !== undefined && unit.addressee.length > 0
        ? { addressee: unit.addressee }
        : {}),
      ...(unit.ungrammatical !== undefined ? { ungrammatical: unit.ungrammatical } : {}),
      ...(unit.actualForm !== undefined && unit.actualForm.length > 0
        ? { actualForm: unit.actualForm }
        : {}),
      ...(unit.targetForm !== undefined && unit.targetForm.length > 0
        ? { targetForm: unit.targetForm }
        : {}),
      ...(unit.selfCertainty !== undefined ? { selfCertainty: unit.selfCertainty } : {}),
      ...(unit.annotationStatus !== undefined && unit.annotationStatus.length > 0
        ? { status: unit.annotationStatus }
        : {}),
      ...(unit.provenance !== undefined ? { provenance: unit.provenance } : {}),
      ...(unit.analysisGraph !== undefined ? { analysisGraph: unit.analysisGraph } : {}),
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
    ...(unit.addressee !== undefined && unit.addressee.length > 0
      ? { addressee: unit.addressee }
      : {}),
    ...(unit.ungrammatical !== undefined ? { ungrammatical: unit.ungrammatical } : {}),
    ...(unit.actualForm !== undefined && unit.actualForm.length > 0
      ? { actualForm: unit.actualForm }
      : {}),
    ...(unit.targetForm !== undefined && unit.targetForm.length > 0
      ? { targetForm: unit.targetForm }
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
    ...(unit.analysisGraph !== undefined ? { analysisGraph: unit.analysisGraph } : {}),
    createdAt: unit.createdAt,
    updatedAt: unit.updatedAt,
  };
}
