import {
  type JieyuDatabase,
  type LayerSegmentContentDocType,
  type LayerSegmentDocType,
  type LayerUnitContentDocType,
  type LayerUnitDocType,
  type SegmentLinkDocType,
  type UtteranceDocType,
} from '../db';
import {
  mapUtteranceToLayerUnit,
  projectUtteranceDocFromLayerUnit,
} from '../db/migrations/timelineUnitMapping';
import {
  collectLayerUnitGraphIdsByTextId,
  deleteLayerUnitCascade,
  deleteLayerUnitGraphByIds,
  deleteLayerUnitGraphByRecordIds,
  listLayerUnitIdsByMediaId,
  normalizeMediaId,
} from './LayerUnitSegmentWritePrimitives';
import { LayerSegmentQueryService } from './LayerSegmentQueryService';
import { LayerUnitRelationQueryService } from './LayerUnitRelationQueryService';
import {
  toLegacySegmentLinkFromUnitRelation,
} from './LayerUnitLegacyProjection';
import { LayerUnitSegmentWriteService } from './LayerUnitSegmentWriteService';
import { newId } from '../utils/transcriptionFormatters';

export type LayerSegmentGraphSnapshot = {
  segments: LayerSegmentDocType[];
  contents: LayerSegmentContentDocType[];
  links: SegmentLinkDocType[];
};

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => id.trim().length > 0))];
}

async function listSegmentLinksBySegmentIds(
  db: JieyuDatabase,
  segmentIds: readonly string[],
): Promise<SegmentLinkDocType[]> {
  const ids = uniqueIds(segmentIds);
  if (ids.length === 0) return [];

  const [sourceRelations, targetRelations] = await Promise.all([
    db.dexie.unit_relations.where('sourceUnitId').anyOf(ids).toArray(),
    db.dexie.unit_relations.where('targetUnitId').anyOf(ids).toArray(),
  ]);

  const byId = new Map<string, SegmentLinkDocType>();
  for (const relation of [...sourceRelations, ...targetRelations]) {
    byId.set(relation.id, toLegacySegmentLinkFromUnitRelation(relation));
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

/** Primary keys of utterance-type `layer_units` scoped to a text (e.g. last-transcription-layer delete). */
export async function listUtteranceUnitPrimaryKeysByTextId(db: JieyuDatabase, textId: string): Promise<string[]> {
  return (await db.dexie.layer_units
    .where('textId')
    .equals(textId)
    .filter((u) => u.unitType === 'utterance')
    .primaryKeys()) as string[];
}

export async function bulkGetLayerUnits(
  db: JieyuDatabase,
  ids: readonly string[],
): Promise<Array<LayerUnitDocType | undefined>> {
  if (ids.length === 0) return [];
  return db.dexie.layer_units.bulkGet([...ids]);
}

export async function upsertUtteranceLayerUnit(db: JieyuDatabase, utterance: UtteranceDocType): Promise<void> {
  const layerId = await resolveDefaultTranscriptionLayerId(db, utterance.textId);
  if (!layerId) return;
  const { unit, content } = mapUtteranceToLayerUnit(utterance, layerId);
  await db.dexie.layer_units.put({
    ...unit,
    mediaId: normalizeMediaId(utterance.mediaId),
  });
  await db.dexie.layer_unit_contents.put(content);
}

export async function bulkUpsertUtteranceLayerUnits(db: JieyuDatabase, utterances: readonly UtteranceDocType[]): Promise<void> {
  if (utterances.length === 0) return;
  const layerIdByTextId = new Map<string, string>();
  for (const utterance of utterances) {
    if (layerIdByTextId.has(utterance.textId)) continue;
    const layerId = await resolveDefaultTranscriptionLayerId(db, utterance.textId);
    if (layerId) {
      layerIdByTextId.set(utterance.textId, layerId);
    }
  }

  const units: LayerUnitDocType[] = [];
  const contents: LayerUnitContentDocType[] = [];
  for (const utterance of utterances) {
    const layerId = layerIdByTextId.get(utterance.textId);
    if (!layerId) continue;
    const { unit, content } = mapUtteranceToLayerUnit(utterance, layerId);
    units.push({
      ...unit,
      mediaId: normalizeMediaId(utterance.mediaId),
    });
    contents.push(content);
  }

  if (units.length > 0) {
    await db.dexie.layer_units.bulkPut(units);
  }
  if (contents.length > 0) {
    await db.dexie.layer_unit_contents.bulkPut(contents);
  }
}

export async function listUtteranceDocsFromCanonicalLayerUnits(db: JieyuDatabase): Promise<UtteranceDocType[]> {
  const units = await db.dexie.layer_units.filter((u) => u.unitType === 'utterance').toArray();
  if (units.length === 0) return [];
  const unitIds = units.map((u) => u.id);
  const allContents = await db.dexie.layer_unit_contents.where('unitId').anyOf(unitIds).toArray();
  const primaryByUnit = new Map<string, LayerUnitContentDocType>();
  for (const c of allContents) {
    if (c.contentRole !== 'primary_text') continue;
    const prev = primaryByUnit.get(c.unitId);
    if (!prev || c.updatedAt >= prev.updatedAt) primaryByUnit.set(c.unitId, c);
  }
  const speakers = await db.dexie.speakers.toArray();
  const speakerNameById = new Map(speakers.map((s) => [s.id, s.name] as const));
  return units
    .sort((a, b) => (a.startTime !== b.startTime ? a.startTime - b.startTime : a.id.localeCompare(b.id)))
    .map((unit) => projectUtteranceDocFromLayerUnit(
      unit,
      primaryByUnit.get(unit.id),
      unit.speakerId ? speakerNameById.get(unit.speakerId) : undefined,
    ));
}

export async function getUtteranceDocProjectionById(
  db: JieyuDatabase,
  id: string,
): Promise<UtteranceDocType | undefined> {
  const unit = await db.dexie.layer_units.get(id);
  if (!unit || unit.unitType !== 'utterance') return undefined;
  const primary = await db.dexie.layer_unit_contents
    .where('[unitId+contentRole]')
    .equals([id, 'primary_text'])
    .first();
  const speakerName = unit.speakerId
    ? (await db.dexie.speakers.get(unit.speakerId))?.name
    : undefined;
  return projectUtteranceDocFromLayerUnit(unit, primary ?? undefined, speakerName);
}

export async function listSegmentContentsByIds(
  db: JieyuDatabase,
  contentIds: readonly string[],
): Promise<LayerSegmentContentDocType[]> {
  void db;
  return LayerSegmentQueryService.listSegmentContentsByIds(contentIds);
}

export async function findOrphanSegmentIds(
  db: JieyuDatabase,
  candidateSegmentIds?: Iterable<string>,
): Promise<string[]> {
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
): Promise<{ affectedUtteranceIds: string[]; deletedSegmentIds: string[]; deletedContentIds: string[] }> {
  const ids = uniqueIds(segmentIds);
  if (ids.length === 0) {
    return { affectedUtteranceIds: [], deletedSegmentIds: [], deletedContentIds: [] };
  }

  const segments = await LayerSegmentQueryService.listSegmentsByIds(ids);
  const deletedSegmentIds = uniqueIds([
    ...ids,
    ...segments.map((segment) => segment.id),
  ]);
  const affectedUtteranceIds = uniqueIds(
    segments
      .map((segment) => segment.utteranceId)
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
    affectedUtteranceIds,
    deletedSegmentIds,
    deletedContentIds,
  };
}

export async function deleteLayerSegmentGraphByUtteranceIds(
  db: JieyuDatabase,
  utteranceIds: readonly string[],
): Promise<{ affectedUtteranceIds: string[]; deletedSegmentIds: string[]; deletedContentIds: string[] }> {
  const ids = uniqueIds(utteranceIds);
  if (ids.length === 0) {
    return { affectedUtteranceIds: [], deletedSegmentIds: [], deletedContentIds: [] };
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
  clonedContents: LayerSegmentContentDocType[];
  clonedLinks: SegmentLinkDocType[];
}> {
  const [existingContents, sourceRelations] = await Promise.all([
    LayerSegmentQueryService.listSegmentContentsBySegmentIds([segmentId]),
    db.dexie.unit_relations.where('sourceUnitId').equals(segmentId).toArray(),
  ]);

  const clonedContents: LayerSegmentContentDocType[] = existingContents.map((content) => ({
    ...content,
    id: newId('stx'),
    segmentId: nextSegmentId,
    createdAt: now,
    updatedAt: now,
  }));
  const clonedLinks: SegmentLinkDocType[] = sourceRelations.map((relation) => ({
    ...toLegacySegmentLinkFromUnitRelation(relation),
    id: newId('sl'),
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
    return { segments: [], contents: [], links: [] };
  }

  const segmentGroups = await Promise.all(ids.map((layerId) => LayerSegmentQueryService.listSegmentsByLayerId(layerId)));
  const segments = segmentGroups.flat();
  const segmentIds = segments.map((segment) => segment.id);
  const [contents, links] = await Promise.all([
    LayerSegmentQueryService.listSegmentContentsBySegmentIds(segmentIds),
    listSegmentLinksBySegmentIds(db, segmentIds),
  ]);

  return { segments, contents, links };
}

export async function restoreLayerSegmentGraphSnapshot(
  db: JieyuDatabase,
  snapshot: LayerSegmentGraphSnapshot,
  scopeLayerIds: readonly string[],
): Promise<void> {
  const targetLayerIds = uniqueIds([
    ...scopeLayerIds,
    ...snapshot.segments.map((segment) => segment.layerId),
    ...snapshot.contents.map((content) => content.layerId),
  ]);
  if (targetLayerIds.length === 0) return;

  await db.dexie.transaction('rw', [
    db.dexie.layer_units,
    db.dexie.layer_unit_contents,
    db.dexie.unit_relations,
  ], async () => {
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

    if (snapshot.segments.length > 0) {
      await LayerUnitSegmentWriteService.upsertSegments(db, snapshot.segments);
    }
    if (snapshot.contents.length > 0) {
      await LayerUnitSegmentWriteService.upsertSegmentContents(db, snapshot.contents);
    }
    if (snapshot.links.length > 0) {
      await LayerUnitSegmentWriteService.upsertSegmentLinks(db, snapshot.links);
    }
  });
}

export async function deleteLayerSegmentGraphByLayerId(
  db: JieyuDatabase,
  layerId: string,
): Promise<{ affectedUtteranceIds: string[]; deletedSegmentIds: string[] }> {
  const segments = await LayerSegmentQueryService.listSegmentsByLayerId(layerId);
  const { affectedUtteranceIds, deletedSegmentIds } = await deleteLayerSegmentGraphBySegmentIds(
    db,
    segments.map((segment) => segment.id),
  );
  return { affectedUtteranceIds, deletedSegmentIds };
}

export async function deleteUtteranceLayerUnitCascade(db: JieyuDatabase, utteranceIds: readonly string[]): Promise<void> {
  const ids = uniqueIds(utteranceIds);
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