import type { JieyuDatabase, LayerUnitContentDocType, LayerUnitContentViewDocType, LayerUnitDocType, UnitRelationDocType, UnitRelationViewDocType } from '../db';
import { newId } from '../utils/transcriptionFormatters';

const UNKNOWN_MEDIA_ID = '__unknown_media__';

function mapLegacyLinkTypeToRelationType(linkType: UnitRelationViewDocType['linkType']): UnitRelationDocType['relationType'] {
  if (linkType === 'projection' || linkType === 'time_subdivision') return 'derived_from';
  if (linkType === 'equivalent' || linkType === 'bridge') return 'aligned_to';
  return undefined;
}

export function normalizeMediaId(mediaId: string | undefined): string {
  const trimmed = mediaId?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : UNKNOWN_MEDIA_ID;
}

function normalizeLayerUnitForStorage(unit: LayerUnitDocType): LayerUnitDocType {
  const {
    unitId: _legacyUnitId,
    ordinal: _legacyOrdinal,
    annotationStatus: _legacyAnnotationStatus,
    ...rest
  } = unit as LayerUnitDocType & {
    unitId?: string;
    ordinal?: number;
    annotationStatus?: string;
  };
  const normalizedMediaId = normalizeMediaId(rest.mediaId);
  const parentUnitId = rest.parentUnitId?.trim() || undefined;
  const orderKey = rest.orderKey?.trim().length
    ? rest.orderKey.trim()
    : undefined;

  return {
    ...rest,
    mediaId: normalizedMediaId,
    unitType: unit.unitType ?? (parentUnitId ? 'segment' : 'unit'),
    ...(parentUnitId ? { parentUnitId, rootUnitId: unit.rootUnitId ?? parentUnitId } : {}),
    ...(orderKey ? { orderKey } : {}),
  };
}

function normalizeLayerUnitContentForStorage(content: LayerUnitContentDocType | LayerUnitContentViewDocType): LayerUnitContentDocType {
  const {
    segmentId: _legacySegmentId,
    translationAudioMediaId: _legacyTranslationAudioMediaId,
    ...rest
  } = content as LayerUnitContentViewDocType;
  const legacySegmentId = typeof _legacySegmentId === 'string' ? _legacySegmentId.trim() : '';
  const legacyMediaRefId = typeof _legacyTranslationAudioMediaId === 'string' ? _legacyTranslationAudioMediaId.trim() : '';
  const unitId = rest.unitId?.trim() || legacySegmentId || rest.id;
  const mediaRefId = rest.mediaRefId?.trim() || legacyMediaRefId || undefined;
  return {
    ...rest,
    unitId,
    contentRole: rest.contentRole ?? 'primary_text',
    modality: rest.modality ?? 'text',
    sourceType: rest.sourceType ?? 'human',
    ...(mediaRefId ? { mediaRefId } : {}),
  };
}

function normalizeUnitRelationForStorage(relation: UnitRelationDocType | UnitRelationViewDocType): UnitRelationDocType {
  const {
    sourceSegmentId: _legacySourceSegmentId,
    targetSegmentId: _legacyTargetSegmentId,
    linkType: _legacyLinkType,
    ...rest
  } = relation as UnitRelationViewDocType;
  const legacySourceUnitId = typeof _legacySourceSegmentId === 'string' ? _legacySourceSegmentId.trim() : '';
  const legacyTargetUnitId = typeof _legacyTargetSegmentId === 'string' ? _legacyTargetSegmentId.trim() : '';
  const sourceUnitId = rest.sourceUnitId?.trim() || legacySourceUnitId || rest.id;
  const targetUnitId = rest.targetUnitId?.trim() || legacyTargetUnitId || rest.id;
  const relationType = rest.relationType ?? mapLegacyLinkTypeToRelationType(_legacyLinkType) ?? 'aligned_to';
  return {
    ...rest,
    sourceUnitId,
    targetUnitId,
    relationType,
  };
}

export async function bulkUpsertSegmentLayerUnits(db: JieyuDatabase, segments: readonly LayerUnitDocType[]): Promise<void> {
  if (segments.length === 0) return;
  await db.dexie.layer_units.bulkPut(segments.map(normalizeLayerUnitForStorage));
}

export async function putLayerUnit(db: JieyuDatabase, unit: LayerUnitDocType): Promise<void> {
  await db.dexie.layer_units.put(normalizeLayerUnitForStorage(unit));
}

export async function updateLayerUnit(db: JieyuDatabase, unitId: string, changes: Partial<LayerUnitDocType>): Promise<void> {
  await db.dexie.layer_units.where(':id').equals(unitId).modify((row) => {
    Object.assign(row, normalizeLayerUnitForStorage({ ...row, ...changes }));
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
  await db.dexie.layer_units.bulkPut(units.map(normalizeLayerUnitForStorage));
}

export async function bulkUpsertSegmentLayerUnitContents(db: JieyuDatabase, contents: readonly LayerUnitContentDocType[]): Promise<void> {
  if (contents.length === 0) return;
  await db.dexie.layer_unit_contents.bulkPut(contents.map(normalizeLayerUnitContentForStorage));
}

export async function putLayerUnitContent(db: JieyuDatabase, content: LayerUnitContentDocType): Promise<void> {
  await db.dexie.layer_unit_contents.put(normalizeLayerUnitContentForStorage(content));
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
  await db.dexie.layer_unit_contents.bulkPut(contents.map(normalizeLayerUnitContentForStorage));
}

export async function putUnitRelation(db: JieyuDatabase, relation: UnitRelationDocType): Promise<void> {
  await db.dexie.unit_relations.put(normalizeUnitRelationForStorage(relation));
}

export async function bulkUpsertUnitRelations(
  db: JieyuDatabase,
  relations: readonly UnitRelationDocType[],
): Promise<void> {
  if (relations.length === 0) return;
  await db.dexie.unit_relations.bulkPut(relations.map(normalizeUnitRelationForStorage));
}

export async function upsertSegmentLinkUnitRelation(db: JieyuDatabase, link: UnitRelationDocType): Promise<void> {
  await db.dexie.unit_relations.put(normalizeUnitRelationForStorage(link));
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