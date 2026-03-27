import {
  type JieyuDatabase,
  type LayerSegmentContentDocType,
  type LayerSegmentDocType,
  type LayerUnitDocType,
  type SegmentLinkDocType,
  type LayerUnitContentDocType,
  type UtteranceDocType,
} from '../db';
import { featureFlags } from '../ai/config/featureFlags';
import {
  bulkUpsertSegmentLayerUnitContents,
  bulkUpsertSegmentLayerUnits,
  collectLayerUnitGraphIdsByTextId,
  deleteLayerUnitCascade,
  deleteLayerUnitGraphByIds,
  deleteLayerUnitGraphByRecordIds,
  deleteSegmentLayerUnitCascade,
  listLayerUnitIdsByMediaId,
  normalizeMediaId,
} from './LayerUnitSegmentMirrorPrimitives';
import {
  collectStaleRowsByIdAndUpdatedAt,
  mergeLegacySegmentLinks,
  mergeLegacySegments as mergeLegacySegmentsRows,
  mergeRowsByIdPreferNewest,
  overlayRowsById,
  toLegacySegmentContentFromLayerUnitContent,
} from './LayerUnitLegacyProjection';
import { LegacyMirrorService } from './LegacyMirrorService';
import { newId } from '../utils/transcriptionFormatters';

export type LayerSegmentGraphSnapshot = {
  segments: LayerSegmentDocType[];
  contents: LayerSegmentContentDocType[];
  links: SegmentLinkDocType[];
};

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

export async function upsertUtteranceLayerUnit(db: JieyuDatabase, utterance: UtteranceDocType): Promise<void> {
  const layerId = await resolveDefaultTranscriptionLayerId(db, utterance.textId);
  if (!layerId) return;
  await db.dexie.layer_units.put({
    id: utterance.id,
    textId: utterance.textId,
    mediaId: normalizeMediaId(utterance.mediaId),
    layerId,
    unitType: 'utterance',
    startTime: utterance.startTime,
    endTime: utterance.endTime,
    ...(utterance.startAnchorId ? { startAnchorId: utterance.startAnchorId } : {}),
    ...(utterance.endAnchorId ? { endAnchorId: utterance.endAnchorId } : {}),
    ...(utterance.speakerId ? { speakerId: utterance.speakerId } : {}),
    ...(utterance.annotationStatus ? { status: utterance.annotationStatus } : {}),
    ...(utterance.provenance ? { provenance: utterance.provenance } : {}),
    createdAt: utterance.createdAt,
    updatedAt: utterance.updatedAt,
  });
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
  const rows = utterances.flatMap((utterance) => {
    const layerId = layerIdByTextId.get(utterance.textId);
    if (!layerId) return [];
    return [{
      id: utterance.id,
      textId: utterance.textId,
      mediaId: normalizeMediaId(utterance.mediaId),
      layerId,
      unitType: 'utterance' as const,
      startTime: utterance.startTime,
      endTime: utterance.endTime,
      ...(utterance.startAnchorId ? { startAnchorId: utterance.startAnchorId } : {}),
      ...(utterance.endAnchorId ? { endAnchorId: utterance.endAnchorId } : {}),
      ...(utterance.speakerId ? { speakerId: utterance.speakerId } : {}),
      ...(utterance.annotationStatus ? { status: utterance.annotationStatus } : {}),
      ...(utterance.provenance ? { provenance: utterance.provenance } : {}),
      createdAt: utterance.createdAt,
      updatedAt: utterance.updatedAt,
    }];
  });
  if (rows.length > 0) {
    await db.dexie.layer_units.bulkPut(rows);
  }
}

export async function listMergedLegacySegmentsByLayerMedia(
  db: JieyuDatabase,
  layerId: string,
  mediaId: string,
): Promise<LayerSegmentDocType[]> {
  const unitRows = await db.dexie.layer_units.where('[layerId+mediaId]').equals([layerId, mediaId]).toArray();
  const legacyRows = featureFlags.legacySegmentationReadFallbackEnabled
    ? await db.dexie.layer_segments.where('[layerId+mediaId]').equals([layerId, mediaId]).toArray()
    : [];
  return mergeLegacySegmentsWithBackfill(db, unitRows, legacyRows);
}

export async function listMergedLegacySegmentsByLayerId(
  db: JieyuDatabase,
  layerId: string,
): Promise<LayerSegmentDocType[]> {
  const unitRows = await db.dexie.layer_units.where('layerId').equals(layerId).toArray();
  const legacyRows = featureFlags.legacySegmentationReadFallbackEnabled
    ? await db.dexie.layer_segments.where('layerId').equals(layerId).toArray()
    : [];
  return mergeLegacySegmentsWithBackfill(db, unitRows, legacyRows);
}

export async function listMergedLegacySegmentsByIds(
  db: JieyuDatabase,
  segmentIds: readonly string[],
): Promise<LayerSegmentDocType[]> {
  const ids = [...new Set(segmentIds.filter((id) => id.trim().length > 0))];
  if (ids.length === 0) return [];

  const unitRows = await db.dexie.layer_units.bulkGet(ids);
  const legacyRows = featureFlags.legacySegmentationReadFallbackEnabled
    ? await db.dexie.layer_segments.bulkGet(ids)
    : [];
  return mergeLegacySegmentsWithBackfill(
    db,
    unitRows.filter((row): row is LayerUnitDocType => Boolean(row)),
    legacyRows.filter((row): row is LayerSegmentDocType => Boolean(row)),
  );
}

export async function listMergedLegacySegmentsByParentUnitIds(
  db: JieyuDatabase,
  parentUnitIds: readonly string[],
): Promise<LayerSegmentDocType[]> {
  const ids = [...new Set(parentUnitIds.filter((id) => id.trim().length > 0))];
  if (ids.length === 0) return [];

  const unitRows = await db.dexie.layer_units.where('parentUnitId').anyOf(ids).toArray();
  const legacyRows = featureFlags.legacySegmentationReadFallbackEnabled
    ? await db.dexie.layer_segments.where('utteranceId').anyOf(ids).toArray()
    : [];
  return mergeLegacySegmentsWithBackfill(db, unitRows, legacyRows);
}

export async function listAllMergedLegacySegments(db: JieyuDatabase): Promise<LayerSegmentDocType[]> {
  const unitRows = await db.dexie.layer_units.where('unitType').equals('segment').toArray();
  const legacyRows = featureFlags.legacySegmentationReadFallbackEnabled
    ? await db.dexie.layer_segments.toArray()
    : [];
  return mergeLegacySegmentsWithBackfill(db, unitRows, legacyRows);
}

export async function listResidualAwareSegmentsByIds(
  db: JieyuDatabase,
  segmentIds: readonly string[],
): Promise<LayerSegmentDocType[]> {
  const ids = [...new Set(segmentIds.filter((id) => id.trim().length > 0))];
  if (ids.length === 0) return [];

  const [mergedRows, legacyRows] = await Promise.all([
    listMergedLegacySegmentsByIds(db, ids),
    db.dexie.layer_segments.bulkGet(ids),
  ]);

  return overlayRowsById(
    legacyRows.filter((row): row is LayerSegmentDocType => Boolean(row)),
    mergedRows,
  );
}

export async function listAllResidualAwareSegments(db: JieyuDatabase): Promise<LayerSegmentDocType[]> {
  const [mergedRows, legacyRows] = await Promise.all([
    listAllMergedLegacySegments(db),
    db.dexie.layer_segments.toArray(),
  ]);

  return overlayRowsById(legacyRows, mergedRows);
}

export async function findResidualOrphanSegmentIds(
  db: JieyuDatabase,
  candidateSegmentIds?: Iterable<string>,
): Promise<string[]> {
  const ids = candidateSegmentIds
    ? [...new Set(Array.from(candidateSegmentIds).filter((id) => id.trim().length > 0))]
    : undefined;
  const rows = ids
    ? await listResidualAwareSegmentsByIds(db, ids)
    : await listAllResidualAwareSegments(db);
  const targetSegmentIds = rows.map((row) => row.id);

  if (targetSegmentIds.length === 0) return [];

  const [legacyContents, unitContents] = await Promise.all([
    db.dexie.layer_segment_contents.where('segmentId').anyOf(targetSegmentIds).toArray(),
    db.dexie.layer_unit_contents.where('unitId').anyOf(targetSegmentIds).toArray(),
  ]);
  const segmentIdsWithContent = new Set<string>([
    ...legacyContents.map((item) => item.segmentId),
    ...unitContents.map((item) => item.unitId),
  ]);

  return targetSegmentIds.filter((segmentId) => !segmentIdsWithContent.has(segmentId));
}

export async function listMergedLegacySegmentLinksBySegmentIds(
  db: JieyuDatabase,
  segmentIds: readonly string[],
): Promise<SegmentLinkDocType[]> {
  const ids = [...new Set(segmentIds.filter((id) => id.trim().length > 0))];
  if (ids.length === 0) return [];

  const [unitSourceRelations, unitTargetRelations] = await Promise.all([
    db.dexie.unit_relations.where('sourceUnitId').anyOf(ids).toArray(),
    db.dexie.unit_relations.where('targetUnitId').anyOf(ids).toArray(),
  ]);
  const [legacySourceLinks, legacyTargetLinks] = featureFlags.legacySegmentationReadFallbackEnabled
    ? await Promise.all([
      db.dexie.segment_links.where('sourceSegmentId').anyOf(ids).toArray(),
      db.dexie.segment_links.where('targetSegmentId').anyOf(ids).toArray(),
    ])
    : [[], []] as const;

  return mergeLegacySegmentLinks(
    [...unitSourceRelations, ...unitTargetRelations],
    [...legacySourceLinks, ...legacyTargetLinks],
  );
}

export async function listMergedLegacyOutgoingSegmentLinksBySegmentIds(
  db: JieyuDatabase,
  segmentIds: readonly string[],
): Promise<SegmentLinkDocType[]> {
  const ids = [...new Set(segmentIds.filter((id) => id.trim().length > 0))];
  if (ids.length === 0) return [];

  return (await listMergedLegacySegmentLinksBySegmentIds(db, ids))
    .filter((link) => ids.includes(link.sourceSegmentId));
}

export async function deleteLegacySegmentLinksBySegmentIds(
  db: JieyuDatabase,
  segmentIds: readonly string[],
): Promise<string[]> {
  const ids = [...new Set(segmentIds.filter((id) => id.trim().length > 0))];
  if (ids.length === 0) return [];

  const [mergedLinks, sourceLegacyIds, targetLegacyIds, sourceRelationIds, targetRelationIds] = await Promise.all([
    listMergedLegacySegmentLinksBySegmentIds(db, ids),
    db.dexie.segment_links.where('sourceSegmentId').anyOf(ids).primaryKeys() as Promise<string[]>,
    db.dexie.segment_links.where('targetSegmentId').anyOf(ids).primaryKeys() as Promise<string[]>,
    db.dexie.unit_relations.where('sourceUnitId').anyOf(ids).primaryKeys() as Promise<string[]>,
    db.dexie.unit_relations.where('targetUnitId').anyOf(ids).primaryKeys() as Promise<string[]>,
  ]);
  const linkIds = [...new Set([
    ...mergedLinks.map((link) => link.id),
    ...sourceLegacyIds,
    ...targetLegacyIds,
    ...sourceRelationIds,
    ...targetRelationIds,
  ])];
  if (linkIds.length > 0) {
    await LegacyMirrorService.deleteSegmentLinksByIds(db, linkIds);
  }
  return linkIds;
}

export async function deleteLayerSegmentGraphBySegmentIds(
  db: JieyuDatabase,
  segmentIds: readonly string[],
): Promise<{ affectedUtteranceIds: string[]; deletedSegmentIds: string[]; deletedContentIds: string[] }> {
  const ids = [...new Set(segmentIds.filter((id) => id.trim().length > 0))];
  if (ids.length === 0) {
    return { affectedUtteranceIds: [], deletedSegmentIds: [], deletedContentIds: [] };
  }

  const segments = await listMergedLegacySegmentsByIds(db, ids);
  const deletedSegmentIds = [...new Set([
    ...ids,
    ...segments.map((segment) => segment.id),
  ])];
  const affectedUtteranceIds = [...new Set(
    segments
      .map((segment) => segment.utteranceId)
      .filter((id): id is string => Boolean(id)),
  )];
  const [mergedContents, legacyContentIds, unitContentIds] = await Promise.all([
    listMergedLegacySegmentContentsBySegmentIds(db, deletedSegmentIds),
    db.dexie.layer_segment_contents.where('segmentId').anyOf(deletedSegmentIds).primaryKeys() as Promise<string[]>,
    db.dexie.layer_unit_contents.where('unitId').anyOf(deletedSegmentIds).primaryKeys() as Promise<string[]>,
  ]);
  const deletedContentIds = [...new Set([
    ...mergedContents.map((content) => content.id),
    ...legacyContentIds,
    ...unitContentIds,
  ])];

  if (deletedContentIds.length > 0) {
    await LegacyMirrorService.deleteSegmentContentsByIds(db, deletedContentIds);
  }
  await deleteLegacySegmentLinksBySegmentIds(db, deletedSegmentIds);
  await LegacyMirrorService.deleteSegmentsByIds(db, deletedSegmentIds);

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
  const ids = [...new Set(utteranceIds.filter((id) => id.trim().length > 0))];
  if (ids.length === 0) {
    return { affectedUtteranceIds: [], deletedSegmentIds: [], deletedContentIds: [] };
  }

  const [derivedRelations, legacyLinks, indexedSegments, legacyIndexedSegmentIds] = await Promise.all([
    db.dexie.unit_relations.where('targetUnitId').anyOf(ids).toArray(),
    db.dexie.segment_links.where('targetSegmentId').anyOf(ids).toArray(),
    listMergedLegacySegmentsByParentUnitIds(db, ids),
    db.dexie.layer_segments.where('utteranceId').anyOf(ids).primaryKeys() as Promise<string[]>,
  ]);
  const segmentIds = [...new Set([
    ...derivedRelations
      .filter((relation) => relation.relationType === 'derived_from')
      .map((relation) => relation.sourceUnitId),
    ...legacyLinks
      .filter((link) => link.linkType === 'time_subdivision')
      .map((link) => link.sourceSegmentId),
    ...indexedSegments.map((segment) => segment.id),
    ...legacyIndexedSegmentIds,
  ])];

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
  const [existingContents, existingLinks] = await Promise.all([
    listMergedLegacySegmentContentsBySegmentIds(db, [segmentId]),
    listMergedLegacyOutgoingSegmentLinksBySegmentIds(db, [segmentId]),
  ]);

  const clonedContents: LayerSegmentContentDocType[] = existingContents.map((content) => ({
    ...content,
    id: newId('stx'),
    segmentId: nextSegmentId,
    createdAt: now,
    updatedAt: now,
  }));
  const clonedLinks: SegmentLinkDocType[] = existingLinks.map((link) => ({
    ...link,
    id: newId('sl'),
    sourceSegmentId: nextSegmentId,
    createdAt: now,
    updatedAt: now,
  }));

  return {
    clonedContents,
    clonedLinks,
  };
}

export async function snapshotLayerSegmentGraphByLayerIds(
  db: JieyuDatabase,
  layerIds: readonly string[],
): Promise<LayerSegmentGraphSnapshot> {
  const ids = [...new Set(layerIds.filter((id) => id.trim().length > 0))];
  if (ids.length === 0) {
    return { segments: [], contents: [], links: [] };
  }

  const segmentGroups = await Promise.all(ids.map((layerId) => listMergedLegacySegmentsByLayerId(db, layerId)));
  const segments = segmentGroups.flat();
  const segmentIds = segments.map((segment) => segment.id);
  const [contents, links] = await Promise.all([
    listMergedLegacySegmentContentsBySegmentIds(db, segmentIds),
    listMergedLegacySegmentLinksBySegmentIds(db, segmentIds),
  ]);

  return { segments, contents, links };
}

export async function restoreLayerSegmentGraphSnapshot(
  db: JieyuDatabase,
  snapshot: LayerSegmentGraphSnapshot,
  scopeLayerIds: readonly string[],
): Promise<void> {
  const targetLayerIds = [...new Set([
    ...scopeLayerIds,
    ...snapshot.segments.map((segment) => segment.layerId),
    ...snapshot.contents.map((content) => content.layerId),
  ].filter((id) => id.trim().length > 0))];
  if (targetLayerIds.length === 0) return;

  await db.dexie.transaction('rw', [
    db.dexie.layer_segments,
    db.dexie.layer_segment_contents,
    db.dexie.segment_links,
    db.dexie.layer_units,
    db.dexie.layer_unit_contents,
    db.dexie.unit_relations,
  ], async () => {
    const [existingLegacySegments, existingLayerUnits] = await Promise.all([
      db.dexie.layer_segments.where('layerId').anyOf(targetLayerIds).toArray(),
      db.dexie.layer_units.where('layerId').anyOf(targetLayerIds).toArray(),
    ]);
    const existingSegmentIds = [...new Set([
      ...existingLegacySegments.map((segment) => segment.id),
      ...existingLayerUnits.filter((unit) => unit.unitType === 'segment').map((unit) => unit.id),
    ])];

    const [legacyContentIds, unitContentIds] = await Promise.all([
      db.dexie.layer_segment_contents.where('layerId').anyOf(targetLayerIds).primaryKeys() as Promise<string[]>,
      db.dexie.layer_unit_contents.where('layerId').anyOf(targetLayerIds).primaryKeys() as Promise<string[]>,
    ]);
    const staleContentIds = [...new Set([...legacyContentIds, ...unitContentIds])];
    if (staleContentIds.length > 0) {
      await LegacyMirrorService.deleteSegmentContentsByIds(db, staleContentIds);
    }

    if (existingSegmentIds.length > 0) {
      await LegacyMirrorService.deleteSegmentsByIds(db, existingSegmentIds);
      const staleLinks = await listMergedLegacySegmentLinksBySegmentIds(db, existingSegmentIds);
      if (staleLinks.length > 0) {
        await LegacyMirrorService.deleteSegmentLinksByIds(db, staleLinks.map((link) => link.id));
      }
    }

    if (snapshot.segments.length > 0) {
      await LegacyMirrorService.upsertSegments(db, snapshot.segments);
    }
    if (snapshot.contents.length > 0) {
      await LegacyMirrorService.upsertSegmentContents(db, snapshot.contents);
    }
    if (snapshot.links.length > 0) {
      await LegacyMirrorService.upsertSegmentLinks(db, snapshot.links);
    }
  });
}

export async function listMergedLegacySegmentContentsByIds(
  db: JieyuDatabase,
  contentIds: readonly string[],
): Promise<LayerSegmentContentDocType[]> {
  const ids = [...new Set(contentIds.filter((id) => id.trim().length > 0))];
  if (ids.length === 0) return [];

  const unitRows = await db.dexie.layer_unit_contents.bulkGet(ids);
  const legacyRows = featureFlags.legacySegmentationReadFallbackEnabled
    ? await db.dexie.layer_segment_contents.bulkGet(ids)
    : [];

  return mergeLegacySegmentContentsWithBackfill(
    db,
    unitRows.filter((row): row is LayerUnitContentDocType => Boolean(row)),
    legacyRows.filter((row): row is LayerSegmentContentDocType => Boolean(row)),
  );
}

export async function listMergedLegacySegmentContentsBySegmentIds(
  db: JieyuDatabase,
  segmentIds: readonly string[],
  options?: {
    layerId?: string;
    modality?: LayerSegmentContentDocType['modality'];
  },
): Promise<LayerSegmentContentDocType[]> {
  const ids = [...new Set(segmentIds.filter((id) => id.trim().length > 0))];
  if (ids.length === 0) return [];

  const unitRows = await db.dexie.layer_unit_contents.where('unitId').anyOf(ids).toArray();
  const legacyRows = featureFlags.legacySegmentationReadFallbackEnabled
    ? await db.dexie.layer_segment_contents.where('segmentId').anyOf(ids).toArray()
    : [];

  return mergeLegacySegmentContentsWithBackfill(db, unitRows, legacyRows, options);
}

export async function countMergedLegacySegmentContentsByLayerId(
  db: JieyuDatabase,
  layerId: string,
): Promise<number> {
  const segments = await listMergedLegacySegmentsByLayerId(db, layerId);
  if (segments.length === 0) return 0;
  const contents = await listMergedLegacySegmentContentsBySegmentIds(
    db,
    segments.map((segment) => segment.id),
    { layerId },
  );
  return contents.length;
}

async function mergeLegacySegmentContentsWithBackfill(
  db: JieyuDatabase,
  unitRows: LayerUnitContentDocType[],
  legacyRows: LayerSegmentContentDocType[],
  options?: {
    layerId?: string;
    modality?: LayerSegmentContentDocType['modality'];
  },
): Promise<LayerSegmentContentDocType[]> {

  const matchesFilters = (row: { layerId: string; modality: LayerSegmentContentDocType['modality'] }) => {
    if (options?.layerId && row.layerId !== options.layerId) return false;
    if (options?.modality && row.modality !== options.modality) return false;
    return true;
  };

  const filteredUnitRows = unitRows.filter((row) => matchesFilters(toLegacySegmentContentFromLayerUnitContent(row)));
  const convertedUnitRows = filteredUnitRows.map(toLegacySegmentContentFromLayerUnitContent);
  const filteredLegacyRows = legacyRows.filter(matchesFilters);
  const staleLegacyRows = collectStaleRowsByIdAndUpdatedAt(filteredLegacyRows, filteredUnitRows);
  if (staleLegacyRows.length > 0) {
    await bulkUpsertSegmentLayerUnitContents(db, staleLegacyRows);
  }

  return mergeRowsByIdPreferNewest(filteredLegacyRows, convertedUnitRows);
}

async function mergeLegacySegmentsWithBackfill(
  db: JieyuDatabase,
  unitRows: LayerUnitDocType[],
  legacyRows: LayerSegmentDocType[],
): Promise<LayerSegmentDocType[]> {
  const segmentUnits = unitRows.filter((row) => row.unitType === 'segment');
  const staleLegacyRows = collectStaleRowsByIdAndUpdatedAt(legacyRows, segmentUnits);
  if (staleLegacyRows.length > 0) {
    await bulkUpsertSegmentLayerUnits(db, staleLegacyRows);
  }

  return mergeLegacySegmentsRows(unitRows, legacyRows);
}

export async function deleteLayerSegmentGraphByLayerId(
  db: JieyuDatabase,
  layerId: string,
): Promise<{ affectedUtteranceIds: string[]; deletedSegmentIds: string[] }> {
  const segments = await listMergedLegacySegmentsByLayerId(db, layerId);
  const deletedSegmentIds = [...new Set(segments.map((segment) => segment.id))];
  const affectedUtteranceIds = [...new Set(
    segments
      .map((segment) => segment.utteranceId)
      .filter((id): id is string => Boolean(id)),
  )];

  const [legacyContentIds, unitContentIds] = await Promise.all([
    db.dexie.layer_segment_contents.where('layerId').equals(layerId).primaryKeys() as Promise<string[]>,
    db.dexie.layer_unit_contents.where('layerId').equals(layerId).primaryKeys() as Promise<string[]>,
  ]);
  const contentIds = [...new Set([...legacyContentIds, ...unitContentIds])];
  if (contentIds.length > 0) {
    await LegacyMirrorService.deleteSegmentContentsByIds(db, contentIds);
  }

  if (deletedSegmentIds.length > 0) {
    await deleteLayerSegmentGraphBySegmentIds(db, deletedSegmentIds);
  }

  return {
    affectedUtteranceIds,
    deletedSegmentIds,
  };
}

export async function deleteUtteranceLayerUnitCascade(db: JieyuDatabase, utteranceIds: readonly string[]): Promise<void> {
  const ids = [...new Set(utteranceIds.filter((id) => id.trim().length > 0))];
  if (ids.length === 0) return;

  const childUnitIds = (await db.dexie.layer_units.where('parentUnitId').anyOf(ids).primaryKeys()) as string[];
  if (childUnitIds.length > 0) {
    await deleteSegmentLayerUnitCascade(db, childUnitIds);
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