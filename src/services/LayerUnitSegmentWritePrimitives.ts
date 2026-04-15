import type {
  JieyuDatabase,
  LayerSegmentContentDocType,
  LayerSegmentDocType,
  LayerUnitContentDocType,
  LayerUnitDocType,
  SegmentLinkDocType,
  UnitRelationDocType,
} from '../db';
import { newId } from '../utils/transcriptionFormatters';

const UNKNOWN_MEDIA_ID = '__unknown_media__';

export function normalizeMediaId(mediaId: string | undefined): string {
  const trimmed = mediaId?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : UNKNOWN_MEDIA_ID;
}

function mapSegmentLinkTypeToUnitRelationType(linkType: SegmentLinkDocType['linkType']): UnitRelationDocType['relationType'] {
  return linkType === 'time_subdivision' ? 'derived_from' : 'aligned_to';
}

export function toLayerUnitFromSegment(segment: LayerSegmentDocType): LayerUnitDocType {
  return {
    id: segment.id,
    textId: segment.textId,
    mediaId: normalizeMediaId(segment.mediaId),
    layerId: segment.layerId,
    unitType: 'segment',
    startTime: segment.startTime,
    endTime: segment.endTime,
    ...(segment.startAnchorId ? { startAnchorId: segment.startAnchorId } : {}),
    ...(segment.endAnchorId ? { endAnchorId: segment.endAnchorId } : {}),
    ...(segment.ordinal !== undefined ? { orderKey: String(segment.ordinal) } : {}),
    ...(segment.speakerId ? { speakerId: segment.speakerId } : {}),
    ...(segment.externalRef ? { externalRef: segment.externalRef } : {}),
    ...(segment.utteranceId ? { parentUnitId: segment.utteranceId, rootUnitId: segment.utteranceId } : {}),
    ...(segment.provenance ? { provenance: segment.provenance } : {}),
    createdAt: segment.createdAt,
    updatedAt: segment.updatedAt,
  };
}

export function toLayerUnitContentFromSegmentContent(content: LayerSegmentContentDocType): LayerUnitContentDocType {
  return {
    id: content.id,
    textId: content.textId,
    unitId: content.segmentId,
    layerId: content.layerId,
    contentRole: 'primary_text',
    modality: content.modality,
    ...(content.text !== undefined ? { text: content.text } : {}),
    ...(content.translationAudioMediaId ? { mediaRefId: content.translationAudioMediaId } : {}),
    sourceType: content.sourceType,
    ...(content.ai_metadata ? { ai_metadata: content.ai_metadata } : {}),
    ...(content.provenance ? { provenance: content.provenance } : {}),
    ...(content.accessRights ? { accessRights: content.accessRights } : {}),
    createdAt: content.createdAt,
    updatedAt: content.updatedAt,
  };
}

export async function bulkUpsertSegmentLayerUnits(db: JieyuDatabase, segments: readonly LayerSegmentDocType[]): Promise<void> {
  if (segments.length === 0) return;
  await db.dexie.layer_units.bulkPut(segments.map(toLayerUnitFromSegment));
}

export async function putLayerUnit(db: JieyuDatabase, unit: LayerUnitDocType): Promise<void> {
  await db.dexie.layer_units.put(unit);
}

export async function updateLayerUnit(db: JieyuDatabase, unitId: string, changes: Partial<LayerUnitDocType>): Promise<void> {
  await db.dexie.layer_units.where(':id').equals(unitId).modify((row) => {
    Object.assign(row, changes);
  });
}

export async function getLayerUnitById(db: JieyuDatabase, unitId: string): Promise<LayerUnitDocType | undefined> {
  return db.dexie.layer_units.get(unitId);
}

export async function listLayerUnitsByIds(db: JieyuDatabase, unitIds: readonly string[]): Promise<LayerUnitDocType[]> {
  const ids = [...new Set(unitIds.filter((id) => id.trim().length > 0))];
  if (ids.length === 0) return [];
  const rows = await db.dexie.layer_units.bulkGet(ids);
  return rows.filter((row): row is LayerUnitDocType => Boolean(row));
}

export async function listLayerUnitsByLayerMedia(
  db: JieyuDatabase,
  layerId: string,
  mediaId: string,
): Promise<LayerUnitDocType[]> {
  return db.dexie.layer_units.where('[layerId+mediaId]').equals([layerId, mediaId]).toArray();
}

export async function bulkUpsertLayerUnits(db: JieyuDatabase, units: readonly LayerUnitDocType[]): Promise<void> {
  if (units.length === 0) return;
  await db.dexie.layer_units.bulkPut([...units]);
}

export async function bulkUpsertSegmentLayerUnitContents(db: JieyuDatabase, contents: readonly LayerSegmentContentDocType[]): Promise<void> {
  if (contents.length === 0) return;
  await db.dexie.layer_unit_contents.bulkPut(contents.map(toLayerUnitContentFromSegmentContent));
}

export async function putLayerUnitContent(db: JieyuDatabase, content: LayerUnitContentDocType): Promise<void> {
  await db.dexie.layer_unit_contents.put(content);
}

export async function listLayerUnitContentsByUnitId(
  db: JieyuDatabase,
  unitId: string,
): Promise<LayerUnitContentDocType[]> {
  return db.dexie.layer_unit_contents.where('unitId').equals(unitId).toArray();
}

export async function bulkUpsertLayerUnitContents(
  db: JieyuDatabase,
  contents: readonly LayerUnitContentDocType[],
): Promise<void> {
  if (contents.length === 0) return;
  await db.dexie.layer_unit_contents.bulkPut([...contents]);
}

export async function putUnitRelation(db: JieyuDatabase, relation: UnitRelationDocType): Promise<void> {
  await db.dexie.unit_relations.put(relation);
}

export async function bulkUpsertUnitRelations(
  db: JieyuDatabase,
  relations: readonly UnitRelationDocType[],
): Promise<void> {
  if (relations.length === 0) return;
  await db.dexie.unit_relations.bulkPut([...relations]);
}

export async function upsertSegmentLinkUnitRelation(db: JieyuDatabase, link: SegmentLinkDocType): Promise<void> {
  await db.dexie.unit_relations.put({
    id: link.id,
    textId: link.textId,
    sourceUnitId: link.sourceSegmentId,
    targetUnitId: link.targetSegmentId,
    relationType: mapSegmentLinkTypeToUnitRelationType(link.linkType),
    ...(link.provenance ? { provenance: link.provenance } : {}),
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
  });
}

export async function bulkDeleteLayerUnitContentsByIds(db: JieyuDatabase, contentIds: readonly string[]): Promise<void> {
  const ids = [...new Set(contentIds.filter((id) => id.trim().length > 0))];
  if (ids.length === 0) return;
  await db.dexie.layer_unit_contents.bulkDelete(ids);
}

export async function deleteSegmentLayerUnitCascade(db: JieyuDatabase, segmentIds: readonly string[]): Promise<void> {
  await deleteLayerUnitCascade(db, segmentIds);
}

export async function collectLayerUnitCascadeIds(
  db: JieyuDatabase,
  unitIds: readonly string[],
): Promise<{
  contentIds: string[];
  relationIds: string[];
}> {
  const ids = [...new Set(unitIds.filter((id) => id.trim().length > 0))];
  if (ids.length === 0) {
    return { contentIds: [], relationIds: [] };
  }

  const [contentIds, sourceRelationIds, targetRelationIds] = await Promise.all([
    db.dexie.layer_unit_contents.where('unitId').anyOf(ids).primaryKeys() as Promise<string[]>,
    db.dexie.unit_relations.where('sourceUnitId').anyOf(ids).primaryKeys() as Promise<string[]>,
    db.dexie.unit_relations.where('targetUnitId').anyOf(ids).primaryKeys() as Promise<string[]>,
  ]);

  return {
    contentIds,
    relationIds: [...new Set([...sourceRelationIds, ...targetRelationIds])],
  };
}

export async function collectLayerUnitGraphIdsByTextId(
  db: JieyuDatabase,
  textId: string,
): Promise<{
  unitIds: string[];
  contentIds: string[];
  relationIds: string[];
}> {
  const normalizedTextId = textId.trim();
  if (!normalizedTextId) {
    return { unitIds: [], contentIds: [], relationIds: [] };
  }

  const [contentIds, unitIds, relationIds] = await Promise.all([
    db.dexie.layer_unit_contents.where('textId').equals(normalizedTextId).primaryKeys() as Promise<string[]>,
    db.dexie.layer_units.where('textId').equals(normalizedTextId).primaryKeys() as Promise<string[]>,
    db.dexie.unit_relations.where('textId').equals(normalizedTextId).primaryKeys() as Promise<string[]>,
  ]);

  return { unitIds, contentIds, relationIds };
}

export async function listLayerUnitIdsByMediaId(db: JieyuDatabase, mediaId: string): Promise<string[]> {
  const normalizedMediaId = mediaId.trim();
  if (!normalizedMediaId) return [];
  return (await db.dexie.layer_units.where('mediaId').equals(normalizedMediaId).primaryKeys()) as string[];
}

export async function deleteLayerUnitCascade(db: JieyuDatabase, unitIds: readonly string[]): Promise<void> {
  await deleteLayerUnitGraphByIds(db, unitIds);
}

export async function deleteLayerUnitGraphByRecordIds(
  db: JieyuDatabase,
  graph: {
    unitIds?: readonly string[];
    contentIds?: readonly string[];
    relationIds?: readonly string[];
  },
): Promise<{
  deletedUnitIds: string[];
  deletedContentIds: string[];
  deletedRelationIds: string[];
}> {
  const deletedUnitIds = [...new Set((graph.unitIds ?? []).filter((id) => id.trim().length > 0))];
  const deletedContentIds = [...new Set((graph.contentIds ?? []).filter((id) => id.trim().length > 0))];
  const deletedRelationIds = [...new Set((graph.relationIds ?? []).filter((id) => id.trim().length > 0))];

  if (deletedContentIds.length > 0) {
    await db.dexie.layer_unit_contents.bulkDelete(deletedContentIds);
  }
  if (deletedRelationIds.length > 0) {
    await db.dexie.unit_relations.bulkDelete(deletedRelationIds);
  }
  if (deletedUnitIds.length > 0) {
    await db.dexie.layer_units.bulkDelete(deletedUnitIds);
  }

  return {
    deletedUnitIds,
    deletedContentIds,
    deletedRelationIds,
  };
}

export async function deleteLayerUnitGraphByIds(
  db: JieyuDatabase,
  unitIds: readonly string[],
): Promise<{
  deletedUnitIds: string[];
  deletedContentIds: string[];
  deletedRelationIds: string[];
}> {
  const ids = [...new Set(unitIds.filter((id) => id.trim().length > 0))];
  if (ids.length === 0) {
    return { deletedUnitIds: [], deletedContentIds: [], deletedRelationIds: [] };
  }

  const { contentIds, relationIds } = await collectLayerUnitCascadeIds(db, ids);
  return deleteLayerUnitGraphByRecordIds(db, {
    unitIds: ids,
    contentIds,
    relationIds,
  });
}

export async function buildClonedLayerUnitGraphForSplit(
  db: JieyuDatabase,
  unitId: string,
  nextUnitId: string,
  now: string,
): Promise<{
  clonedContents: LayerUnitContentDocType[];
  clonedRelations: UnitRelationDocType[];
}> {
  const [existingContents, sourceRelations] = await Promise.all([
    db.dexie.layer_unit_contents.where('unitId').equals(unitId).toArray(),
    db.dexie.unit_relations.where('sourceUnitId').equals(unitId).toArray(),
  ]);

  const clonedContents: LayerUnitContentDocType[] = existingContents.map((content) => ({
    ...content,
    id: newId('luc'),
    unitId: nextUnitId,
    createdAt: now,
    updatedAt: now,
  }));
  const clonedRelations: UnitRelationDocType[] = sourceRelations.map((relation) => ({
    ...relation,
    id: newId('lur'),
    sourceUnitId: nextUnitId,
    createdAt: now,
    updatedAt: now,
  }));

  return {
    clonedContents,
    clonedRelations,
  };
}