import {
  dexieStoresForLayerSegmentGraphRw,
  type JieyuDatabase,
  type LayerUnitContentDocType,
  type LayerUnitContentViewDocType,
  type LayerUnitDocType,
  type UnitRelationDocType,
  type UnitRelationViewDocType,
  type UnitRelationLinkType,
} from '../db';
import { mapUnitToLayerUnit, projectUnitDocFromLayerUnit } from '../db/migrations/timelineUnitMapping';
import { bulkUpsertLayerUnitContents, bulkUpsertLayerUnits, collectLayerUnitGraphIdsByTextId, deleteLayerUnitCascade, deleteLayerUnitGraphByIds, deleteLayerUnitGraphByRecordIds, listLayerUnitIdsByMediaId, normalizeMediaId } from './LayerUnitSegmentWritePrimitives';
import { LayerSegmentQueryService, runDexieScopedReadTask } from './LayerSegmentQueryService';
import { LayerUnitRelationQueryService } from './LayerUnitRelationQueryService';
import { LayerUnitSegmentWriteService } from './LayerUnitSegmentWriteService';
import { newId } from '../utils/transcriptionFormatters';

/**
 * Canonical segment subgraph for independent-boundary layers.
 * Uses `layer_units` / `layer_unit_contents` directly so undo/redo preserves fields
 * (e.g. `contentRole`) that are lossy when round-tripped through legacy segment DTOs.
 */
export type LayerSegmentGraphSnapshot = {
  /** Segment-type `layer_units` rows. */
  units: LayerUnitDocType[];
  contents: LayerUnitContentDocType[];
  links: UnitRelationViewDocType[];
};

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => id.trim().length > 0))];
}

const warnedGraphScopeFallbacks = new Set<string>();

function warnGraphScopeFallback(tableNames: readonly string[]): void {
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') return;
  const key = tableNames.join(',');
  if (warnedGraphScopeFallbacks.has(key)) return;
  warnedGraphScopeFallbacks.add(key);
  console.warn(`[Dexie scope fallback] LayerSegmentGraphService executed outside declared transaction stores: ${tableNames.join(', ')}`);
}

async function runGraphReadWithCompatibleTransaction<T>(
  tableNames: readonly string[],
  task: () => Promise<T>,
): Promise<T> {
  return runDexieScopedReadTask(tableNames, task, () => {
    warnGraphScopeFallback(tableNames);
  });
}

function mapRelationTypeToLinkType(
  relationType: UnitRelationDocType['relationType'] | undefined,
): UnitRelationLinkType {
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

function projectRelationReadModel(relation: UnitRelationDocType): UnitRelationViewDocType {
  return {
    ...relation,
    sourceSegmentId: relation.sourceUnitId,
    targetSegmentId: relation.targetUnitId,
    ...(relation.relationType ? { linkType: mapRelationTypeToLinkType(relation.relationType) } : {}),
  };
}

async function listSegmentLinksBySegmentIds(
  db: JieyuDatabase,
  segmentIds: readonly string[],
): Promise<UnitRelationViewDocType[]> {
  const ids = uniqueIds(segmentIds);
  if (ids.length === 0) return [];

  const [sourceRelations, targetRelations] = await Promise.all([
    db.dexie.unit_relations.where('sourceUnitId').anyOf(ids).toArray(),
    db.dexie.unit_relations.where('targetUnitId').anyOf(ids).toArray(),
  ]);

  const byId = new Map<string, UnitRelationViewDocType>();
  for (const relation of [...sourceRelations, ...targetRelations]) {
    byId.set(relation.id, projectRelationReadModel(relation));
  }
  return [...byId.values()];
}

export async function resolveDefaultTranscriptionLayerId(
  db: JieyuDatabase,
  textId: string,
): Promise<string | undefined> {
  const layers = (await db.collections.layers.findByIndex('textId', textId)).map((doc) => doc.toJSON());
  const transcriptionLayers = layers.filter((layer) => layer.layerType === 'transcription');
  if (transcriptionLayers.length === 0) return undefined;
  const exactDefault = transcriptionLayers.find((layer) => layer.isDefault === true);
  if (exactDefault) return exactDefault.id;
  return [...transcriptionLayers]
    .sort((left, right) => (left.sortOrder ?? Number.MAX_SAFE_INTEGER) - (right.sortOrder ?? Number.MAX_SAFE_INTEGER))[0]
    ?.id;
}

/** Primary keys of unit-type `layer_units` scoped to a text (e.g. last-transcription-layer delete). */
export async function listUnitUnitPrimaryKeysByTextId(db: JieyuDatabase, textId: string): Promise<string[]> {
  return runGraphReadWithCompatibleTransaction(['layer_units'], async () => (
    (await db.dexie.layer_units
      .where('textId')
      .equals(textId)
      .filter((u) => u.unitType === 'unit')
      .primaryKeys()) as string[]
  ));
}

export async function bulkGetLayerUnits(
  db: JieyuDatabase,
  ids: readonly string[],
): Promise<Array<LayerUnitDocType | undefined>> {
  if (ids.length === 0) return [];
  return runGraphReadWithCompatibleTransaction(['layer_units'], async () => db.dexie.layer_units.bulkGet([...ids]));
}

export async function upsertUnitLayerUnit(db: JieyuDatabase, unit: LayerUnitDocType): Promise<void> {
  const layerId = await resolveDefaultTranscriptionLayerId(db, unit.textId);
  if (!layerId) return;
  const { unit: mappedUnit, content } = mapUnitToLayerUnit(unit, layerId);
  await db.dexie.layer_units.put({
    ...mappedUnit,
    mediaId: normalizeMediaId(mappedUnit.mediaId),
  });
  await db.dexie.layer_unit_contents.put(content);
}

export async function bulkUpsertUnitLayerUnits(db: JieyuDatabase, units: readonly LayerUnitDocType[]): Promise<void> {
  if (units.length === 0) return;
  const layerIdByTextId = new Map<string, string>();
  for (const unit of units) {
    if (layerIdByTextId.has(unit.textId)) continue;
    const layerId = await resolveDefaultTranscriptionLayerId(db, unit.textId);
    if (layerId) {
      layerIdByTextId.set(unit.textId, layerId);
    }
  }

  const mappedUnits: LayerUnitDocType[] = [];
  const contents: LayerUnitContentDocType[] = [];
  for (const unit of units) {
    const layerId = layerIdByTextId.get(unit.textId);
    if (!layerId) continue;
    const { unit: mappedUnit, content } = mapUnitToLayerUnit(unit, layerId);
    mappedUnits.push({
      ...mappedUnit,
      mediaId: normalizeMediaId(mappedUnit.mediaId),
    });
    contents.push(content);
  }

  if (mappedUnits.length > 0) {
    await db.dexie.layer_units.bulkPut(mappedUnits);
  }
  if (contents.length > 0) {
    await db.dexie.layer_unit_contents.bulkPut(contents);
  }
}

export async function listUnitDocsFromCanonicalLayerUnits(db: JieyuDatabase): Promise<LayerUnitDocType[]> {
  // 兼容历史库：若 layer_units 尚未恢复，先返回空数组避免首屏崩溃。
  // Compatibility for older DBs: return an empty project view instead of crashing.
  if (!db.dexie.layer_units || !db.dexie.layer_unit_contents) return [];

  return runGraphReadWithCompatibleTransaction(['layer_units', 'layer_unit_contents', 'speakers'], async () => {
    const units = await db.dexie.layer_units.filter((u) => u.unitType === 'unit').toArray();
    if (units.length === 0) return [];
    const unitIds = units.map((u) => u.id);
    const allContents = await db.dexie.layer_unit_contents.where('unitId').anyOf(unitIds).toArray();
    const primaryByUnit = new Map<string, LayerUnitContentDocType>();
    for (const c of allContents) {
      const unitId = c.unitId?.trim();
      if (!unitId || c.contentRole !== 'primary_text') continue;
      const prev = primaryByUnit.get(unitId);
      if (!prev || c.updatedAt >= prev.updatedAt) primaryByUnit.set(unitId, c);
    }
    const speakers = await db.dexie.speakers.toArray();
    const speakerNameById = new Map(speakers.map((s) => [s.id, s.name] as const));
    return units
      .sort((a, b) => (a.startTime !== b.startTime ? a.startTime - b.startTime : a.id.localeCompare(b.id)))
      .map((unit) => projectUnitDocFromLayerUnit(
        unit,
        primaryByUnit.get(unit.id),
        unit.speakerId ? speakerNameById.get(unit.speakerId) : undefined,
      ));
  });
}

export async function getUnitDocProjectionById(
  db: JieyuDatabase,
  id: string,
): Promise<LayerUnitDocType | undefined> {
  return runGraphReadWithCompatibleTransaction(['layer_units', 'layer_unit_contents', 'speakers'], async () => {
    const unit = await db.dexie.layer_units.get(id);
    if (!unit || unit.unitType !== 'unit') return undefined;
    const primary = await db.dexie.layer_unit_contents
      .where('[unitId+contentRole]')
      .equals([id, 'primary_text'])
      .first();
    const speakerName = unit.speakerId
      ? (await db.dexie.speakers.get(unit.speakerId))?.name
      : undefined;
    return projectUnitDocFromLayerUnit(unit, primary ?? undefined, speakerName);
  });
}

export async function listSegmentContentsByIds(
  db: JieyuDatabase,
  contentIds: readonly string[],
): Promise<LayerUnitContentViewDocType[]> {
  void db;
  return LayerSegmentQueryService.listSegmentContentsByIds(contentIds);
}

export async function findOrphanSegmentIds(
  db: JieyuDatabase,
  candidateSegmentIds?: Iterable<string>,
): Promise<string[]> {
  return runGraphReadWithCompatibleTransaction(['layer_units', 'layer_unit_contents'], async () => {
    const ids = candidateSegmentIds
      ? uniqueIds(Array.from(candidateSegmentIds))
      : undefined;
    const rows = ids
      ? await LayerSegmentQueryService.listSegmentsByIds(ids)
      : await LayerSegmentQueryService.listAllSegments();
    const targetSegmentIds = rows.map((row) => row.id);
    if (targetSegmentIds.length === 0) return [];

    const contents = await db.dexie.layer_unit_contents.where('unitId').anyOf(targetSegmentIds).toArray();
    const segmentIdsWithContent = new Set(contents.map((item) => item.unitId));
    return targetSegmentIds.filter((segmentId) => !segmentIdsWithContent.has(segmentId));
  });
}

export async function deleteSegmentLinksBySegmentIds(
  db: JieyuDatabase,
  segmentIds: readonly string[],
): Promise<string[]> {
  const ids = uniqueIds(segmentIds);
  if (ids.length === 0) return [];

  const [sourceRelationIds, targetRelationIds] = await Promise.all([
    db.dexie.unit_relations.where('sourceUnitId').anyOf(ids).primaryKeys() as Promise<string[]>,
    db.dexie.unit_relations.where('targetUnitId').anyOf(ids).primaryKeys() as Promise<string[]>,
  ]);
  const relationIds = uniqueIds([...sourceRelationIds, ...targetRelationIds]);
  if (relationIds.length > 0) {
    await LayerUnitSegmentWriteService.deleteSegmentLinksByIds(db, relationIds);
  }
  return relationIds;
}

export async function deleteLayerSegmentGraphBySegmentIds(
  db: JieyuDatabase,
  segmentIds: readonly string[],
): Promise<{ affectedUnitIds: string[]; deletedSegmentIds: string[]; deletedContentIds: string[] }> {
  const ids = uniqueIds(segmentIds);
  if (ids.length === 0) {
    return { affectedUnitIds: [], deletedSegmentIds: [], deletedContentIds: [] };
  }

  const segments = await LayerSegmentQueryService.listSegmentsByIds(ids);
  const deletedSegmentIds = uniqueIds([
    ...ids,
    ...segments.map((segment) => segment.id),
  ]);
  const affectedUnitIds = uniqueIds(
    segments
      .map((segment) => segment.parentUnitId)
      .filter((id): id is string => Boolean(id)),
  );
  const contents = await LayerSegmentQueryService.listSegmentContentsBySegmentIds(deletedSegmentIds);
  const deletedContentIds = uniqueIds(contents.map((content) => content.id));

  if (deletedContentIds.length > 0) {
    await LayerUnitSegmentWriteService.deleteSegmentContentsByIds(db, deletedContentIds);
  }
  await deleteSegmentLinksBySegmentIds(db, deletedSegmentIds);
  await LayerUnitSegmentWriteService.deleteSegmentsByIds(db, deletedSegmentIds);

  return {
    affectedUnitIds,
    deletedSegmentIds,
    deletedContentIds,
  };
}

export async function deleteLayerSegmentGraphByUnitIds(
  db: JieyuDatabase,
  unitIds: readonly string[],
): Promise<{ affectedUnitIds: string[]; deletedSegmentIds: string[]; deletedContentIds: string[] }> {
  const ids = uniqueIds(unitIds);
  if (ids.length === 0) {
    return { affectedUnitIds: [], deletedSegmentIds: [], deletedContentIds: [] };
  }

  const [indexedSegments, subdivisionChildIds] = await Promise.all([
    LayerSegmentQueryService.listSegmentsByParentUnitIds(ids),
    LayerUnitRelationQueryService.listTimeSubdivisionChildUnitIds(ids, db),
  ]);
  const segmentIds = uniqueIds([
    ...indexedSegments.map((segment) => segment.id),
    ...subdivisionChildIds,
  ]);
  return deleteLayerSegmentGraphBySegmentIds(db, segmentIds);
}

export async function buildClonedSegmentGraphForSplit(
  db: JieyuDatabase,
  segmentId: string,
  nextSegmentId: string,
  now: string,
): Promise<{
  clonedContents: LayerUnitContentDocType[];
  clonedLinks: UnitRelationDocType[];
}> {
  const [existingContents, sourceRelations] = await Promise.all([
    LayerSegmentQueryService.listSegmentContentsBySegmentIds([segmentId]),
    db.dexie.unit_relations.where('sourceUnitId').equals(segmentId).toArray(),
  ]);

  const clonedContents: LayerUnitContentDocType[] = existingContents.map((content) => ({
    ...content,
    id: newId('stx'),
    unitId: nextSegmentId,
    segmentId: nextSegmentId,
    createdAt: now,
    updatedAt: now,
  }));
  const clonedLinks: UnitRelationDocType[] = sourceRelations.map((relation) => ({
    ...projectRelationReadModel(relation),
    id: newId('sl'),
    sourceUnitId: nextSegmentId,
    sourceSegmentId: nextSegmentId,
    createdAt: now,
    updatedAt: now,
  }));

  return { clonedContents, clonedLinks };
}

export async function snapshotLayerSegmentGraphByLayerIds(
  db: JieyuDatabase,
  layerIds: readonly string[],
): Promise<LayerSegmentGraphSnapshot> {
  const ids = uniqueIds(layerIds);
  if (ids.length === 0) {
    return { units: [], contents: [], links: [] };
  }

  const unitGroups = await Promise.all(ids.map(async (layerId) => {
    const rows = await db.dexie.layer_units.where('layerId').equals(layerId).toArray();
    return rows.filter((row): row is LayerUnitDocType => row.unitType === 'segment');
  }));
  const units = unitGroups.flat();
  const segmentIds = units.map((unit) => unit.id);
  const [contents, links] = await Promise.all([
    segmentIds.length === 0
      ? Promise.resolve([] as LayerUnitContentDocType[])
      : db.dexie.layer_unit_contents.where('unitId').anyOf(segmentIds).toArray(),
    listSegmentLinksBySegmentIds(db, segmentIds),
  ]);

  return { units, contents, links };
}

export async function restoreLayerSegmentGraphSnapshot(
  db: JieyuDatabase,
  snapshot: LayerSegmentGraphSnapshot,
  scopeLayerIds: readonly string[],
): Promise<void> {
  const targetLayerIds = uniqueIds([
    ...scopeLayerIds,
    ...snapshot.units.map((unit) => unit.layerId).filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
    ...snapshot.contents.map((content) => content.layerId).filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
  ]);
  if (targetLayerIds.length === 0) return;

  await db.dexie.transaction('rw', [...dexieStoresForLayerSegmentGraphRw(db)], async () => {
    const existingSegments = (await Promise.all(
      targetLayerIds.map((layerId) => LayerSegmentQueryService.listSegmentsByLayerId(layerId)),
    )).flat();
    const existingSegmentIds = uniqueIds(existingSegments.map((segment) => segment.id));
    const staleContentIds = uniqueIds((
      await Promise.all(targetLayerIds.map(async (layerId) => (
        db.dexie.layer_unit_contents.where('layerId').equals(layerId).primaryKeys() as Promise<string[]>
      )))
    ).flat());

    if (staleContentIds.length > 0) {
      await LayerUnitSegmentWriteService.deleteSegmentContentsByIds(db, staleContentIds);
    }
    if (existingSegmentIds.length > 0) {
      await deleteSegmentLinksBySegmentIds(db, existingSegmentIds);
      await LayerUnitSegmentWriteService.deleteSegmentsByIds(db, existingSegmentIds);
    }

    if (snapshot.units.length > 0) {
      await bulkUpsertLayerUnits(db, snapshot.units);
    }
    if (snapshot.contents.length > 0) {
      await bulkUpsertLayerUnitContents(db, snapshot.contents);
    }
    if (snapshot.links.length > 0) {
      await LayerUnitSegmentWriteService.upsertSegmentLinks(db, snapshot.links);
    }
  });
}

export async function deleteLayerSegmentGraphByLayerId(
  db: JieyuDatabase,
  layerId: string,
): Promise<{ affectedUnitIds: string[]; deletedSegmentIds: string[] }> {
  const segments = await LayerSegmentQueryService.listSegmentsByLayerId(layerId);
  const { affectedUnitIds, deletedSegmentIds } = await deleteLayerSegmentGraphBySegmentIds(
    db,
    segments.map((segment) => segment.id),
  );
  return { affectedUnitIds, deletedSegmentIds };
}

export async function deleteUnitLayerUnitCascade(db: JieyuDatabase, unitIds: readonly string[]): Promise<void> {
  const ids = uniqueIds(unitIds);
  if (ids.length === 0) return;

  const childUnitIds = (await db.dexie.layer_units.where('parentUnitId').anyOf(ids).primaryKeys()) as string[];
  if (childUnitIds.length > 0) {
    await deleteLayerUnitCascade(db, childUnitIds);
  }

  await deleteLayerUnitCascade(db, ids);
}

export async function deleteResidualLayerUnitGraphByTextId(
  db: JieyuDatabase,
  textId: string,
): Promise<{ deletedUnitIds: string[]; deletedContentIds: string[]; deletedRelationIds: string[] }> {
  return deleteLayerUnitGraphByRecordIds(db, await collectLayerUnitGraphIdsByTextId(db, textId));
}

export async function deleteResidualLayerUnitGraphByMediaId(
  db: JieyuDatabase,
  mediaId: string,
): Promise<{ deletedUnitIds: string[]; deletedContentIds: string[]; deletedRelationIds: string[] }> {
  const deletedUnitIds = await listLayerUnitIdsByMediaId(db, mediaId);
  if (deletedUnitIds.length === 0) {
    return { deletedUnitIds: [], deletedContentIds: [], deletedRelationIds: [] };
  }
  return deleteLayerUnitGraphByIds(db, deletedUnitIds);
}