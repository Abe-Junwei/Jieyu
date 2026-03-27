import type {
  LayerSegmentContentDocType,
  LayerSegmentDocType,
  LayerUnitContentDocType,
  LayerUnitDocType,
  SegmentLinkDocType,
  UnitRelationDocType,
} from '../db';

type RowWithId = { id: string };
type RowWithUpdatedAt = RowWithId & { updatedAt: string };

function mapUnitRelationTypeToSegmentLinkType(relationType: UnitRelationDocType['relationType']): SegmentLinkDocType['linkType'] {
  switch (relationType) {
    case 'derived_from':
      return 'time_subdivision';
    case 'linked_reference':
      return 'projection';
    case 'aligned_to':
    default:
      return 'bridge';
  }
}

export function mergeRowsByIdPreferNewest<Row extends RowWithUpdatedAt>(
  baseRows: readonly Row[],
  overlayRows: readonly Row[],
): Row[] {
  const mergedById = new Map<string, Row>();

  for (const row of baseRows) {
    mergedById.set(row.id, row);
  }
  for (const row of overlayRows) {
    const existing = mergedById.get(row.id);
    if (!existing || row.updatedAt >= existing.updatedAt) {
      mergedById.set(row.id, row);
    }
  }

  return [...mergedById.values()];
}

export function overlayRowsById<Row extends RowWithId>(
  baseRows: readonly Row[],
  overlayRows: readonly Row[],
): Row[] {
  const mergedById = new Map<string, Row>();

  for (const row of baseRows) {
    mergedById.set(row.id, row);
  }
  for (const row of overlayRows) {
    mergedById.set(row.id, row);
  }

  return [...mergedById.values()];
}

export function collectStaleRowsByIdAndUpdatedAt<
  LegacyRow extends RowWithUpdatedAt,
  CanonicalRow extends RowWithUpdatedAt,
>(legacyRows: readonly LegacyRow[], canonicalRows: readonly CanonicalRow[]): LegacyRow[] {
  const canonicalById = new Map(canonicalRows.map((row) => [row.id, row] as const));
  return legacyRows.filter((row) => {
    const canonical = canonicalById.get(row.id);
    return !canonical || row.updatedAt > canonical.updatedAt;
  });
}

export function toLegacySegmentFromLayerUnit(unit: LayerUnitDocType): LayerSegmentDocType {
  const parsedOrdinal = unit.orderKey !== undefined && unit.orderKey.trim().length > 0
    ? Number(unit.orderKey)
    : undefined;
  return {
    id: unit.id,
    textId: unit.textId,
    mediaId: unit.mediaId,
    layerId: unit.layerId,
    ...(unit.parentUnitId ? { utteranceId: unit.parentUnitId } : {}),
    ...(unit.speakerId ? { speakerId: unit.speakerId } : {}),
    startTime: unit.startTime,
    endTime: unit.endTime,
    ...(unit.startAnchorId ? { startAnchorId: unit.startAnchorId } : {}),
    ...(unit.endAnchorId ? { endAnchorId: unit.endAnchorId } : {}),
    ...(parsedOrdinal !== undefined && Number.isFinite(parsedOrdinal) ? { ordinal: parsedOrdinal } : {}),
    ...(unit.externalRef ? { externalRef: unit.externalRef } : {}),
    ...(unit.provenance ? { provenance: unit.provenance } : {}),
    createdAt: unit.createdAt,
    updatedAt: unit.updatedAt,
  };
}

export function toLegacySegmentLinkFromUnitRelation(relation: UnitRelationDocType): SegmentLinkDocType {
  return {
    id: relation.id,
    textId: relation.textId,
    sourceSegmentId: relation.sourceUnitId,
    targetSegmentId: relation.targetUnitId,
    linkType: mapUnitRelationTypeToSegmentLinkType(relation.relationType),
    ...(relation.provenance ? { provenance: relation.provenance } : {}),
    createdAt: relation.createdAt,
    updatedAt: relation.updatedAt,
  };
}

export function toLegacySegmentContentFromLayerUnitContent(content: LayerUnitContentDocType): LayerSegmentContentDocType {
  return {
    id: content.id,
    textId: content.textId,
    segmentId: content.unitId,
    layerId: content.layerId,
    modality: content.modality,
    ...(content.text !== undefined ? { text: content.text } : {}),
    ...(content.mediaRefId ? { translationAudioMediaId: content.mediaRefId } : {}),
    sourceType: content.sourceType,
    ...(content.ai_metadata ? { ai_metadata: content.ai_metadata } : {}),
    ...(content.provenance ? { provenance: content.provenance } : {}),
    ...(content.accessRights ? { accessRights: content.accessRights } : {}),
    createdAt: content.createdAt,
    updatedAt: content.updatedAt,
  };
}

export function mergeLegacySegments(
  unitRows: readonly LayerUnitDocType[],
  legacyRows: readonly LayerSegmentDocType[],
): LayerSegmentDocType[] {
  const segmentRows = unitRows
    .filter((row) => row.unitType === 'segment')
    .map(toLegacySegmentFromLayerUnit);

  return mergeRowsByIdPreferNewest(legacyRows, segmentRows).sort((left, right) => {
    if (left.startTime !== right.startTime) return left.startTime - right.startTime;
    if (left.endTime !== right.endTime) return left.endTime - right.endTime;
    return left.id.localeCompare(right.id);
  });
}

export function mergeLegacySegmentLinks(
  relationRows: readonly UnitRelationDocType[],
  legacyRows: readonly SegmentLinkDocType[],
): SegmentLinkDocType[] {
  return mergeRowsByIdPreferNewest(legacyRows, relationRows.map(toLegacySegmentLinkFromUnitRelation));
}