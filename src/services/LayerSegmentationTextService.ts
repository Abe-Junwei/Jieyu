import {
  dexieStoresForLayerSegmentGraphRw,
  dexieStoresForLayerUnitsAndContentsRw,
  withTransaction,
  type JieyuDatabase,
  type LayerUnitDocType,
  type LayerUnitContentDocType,
  type LayerUnitContentViewDocType,
  type LayerSegmentViewDocType,
} from '../db';
import { deleteLayerSegmentGraphBySegmentIds, deleteLayerSegmentGraphByUnitIds, findOrphanSegmentIds, listSegmentContentsByIds } from './LayerSegmentGraphService';
import { LayerUnitSegmentWriteService } from './LayerUnitSegmentWriteService';
import { LayerUnitRelationQueryService } from './LayerUnitRelationQueryService';
import { LayerSegmentQueryService } from './LayerSegmentQueryService';
import { SegmentMetaService } from './SegmentMetaService';

const UNKNOWN_MEDIA_ID = '__unknown_media__';

function uniqueIds(ids: Iterable<string>): string[] {
  return [...new Set(Array.from(ids).filter((id) => id.trim().length > 0))];
}

function buildSegmentId(layerId: string | undefined, unitId: string): string {
  const normalizedLayerId = layerId?.trim() || '__unknown_layer__';
  return `segv2_${normalizedLayerId}_${unitId}`;
}

function buildSegmentContentId(translationId: string): string {
  return translationId;
}

function getSegmentContentCandidateIds(translationId: string): string[] {
  return [translationId, `segcv2_${translationId}`, `segcv22_${translationId}`];
}

function parseTranslationIdFromContentId(contentId: string): string {
  const prefixes = ['segcv2_', 'segcv22_'];
  for (const prefix of prefixes) {
    if (!contentId.startsWith(prefix)) continue;
    const value = contentId.slice(prefix.length).trim();
    return value.length > 0 ? value : contentId;
  }
  return contentId;
}

function toLegacyLikeUnitText(
  segment: LayerSegmentViewDocType,
  content: LayerUnitContentDocType,
  unitId: string,
): LayerUnitContentViewDocType {
  const mediaRefId = content.mediaRefId?.trim() || content.translationAudioMediaId?.trim() || '';

  return {
    id: parseTranslationIdFromContentId(content.id),
    unitId,
    layerId: content.layerId ?? segment.layerId,
    contentRole: content.contentRole ?? 'primary_text',
    modality: content.modality ?? 'text',
    ...(content.text !== undefined ? { text: content.text } : {}),
    ...(mediaRefId ? { mediaRefId, translationAudioMediaId: mediaRefId } : {}),
    sourceType: content.sourceType,
    ...(content.ai_metadata ? { ai_metadata: content.ai_metadata } : {}),
    ...(content.provenance ? { provenance: content.provenance } : {}),
    ...(content.accessRights ? { accessRights: content.accessRights } : {}),
    ...(segment.externalRef ? { externalRef: segment.externalRef } : {}),
    createdAt: content.createdAt,
    updatedAt: content.updatedAt,
  };
}

function sortByUpdatedAtDesc(rows: LayerUnitContentDocType[]): LayerUnitContentDocType[] {
  return [...rows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function chunkArray<T>(items: readonly T[], chunkSize: number): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * 若从库中移除 `contentIdsToRemove` 后，这些 segment 的 `unitId` 下将无剩余 content，则视为删后孤儿（与删毕再 `findOrphanSegmentIds` 在 candidate 集上等价）。
 */
async function listSegmentIdsOrphanedAfterRemovingContents(
  db: JieyuDatabase,
  candidateSegmentIds: readonly string[],
  contentIdsToRemove: readonly string[],
): Promise<string[]> {
  const remove = new Set(contentIdsToRemove.filter((id) => id.trim().length > 0));
  const uniqueSeg = uniqueIds(candidateSegmentIds);
  if (uniqueSeg.length === 0) return [];

  const orphan: string[] = [];
  for (const segId of uniqueSeg) {
    const allIds = await withTransaction(
      db,
      'r',
      [...dexieStoresForLayerUnitsAndContentsRw(db)],
      async () => (db.dexie.layer_unit_contents.where('unitId').equals(segId).primaryKeys()) as Promise<string[]>,
      { label: 'LayerSegmentationTextService.listSegmentIdsOrphanedAfterRemovingContents.read' },
    );
    if (allIds.length === 0) {
      orphan.push(segId);
      continue;
    }
    if (allIds.every((id) => remove.has(id))) {
      orphan.push(segId);
    }
  }
  return orphan;
}

export function getSegmentationV2Ids(layerId: string | undefined, unitId: string, translationId: string): {
  segmentId: string;
  segmentContentId: string;
} {
  return {
    segmentId: buildSegmentId(layerId, unitId),
    segmentContentId: buildSegmentContentId(translationId),
  };
}

export async function syncUnitTextToSegmentationV2(
  db: JieyuDatabase,
  unit: LayerUnitDocType,
  translation: LayerUnitContentDocType,
): Promise<void> {
  const now = new Date().toISOString();
  const layerId = translation.layerId?.trim() || '';
  const translationMediaRefId = translation.mediaRefId?.trim() || translation.translationAudioMediaId?.trim() || '';
  const ids = getSegmentationV2Ids(layerId, unit.id, translation.id);

  const segmentDoc: LayerUnitDocType = {
    id: ids.segmentId,
    textId: unit.textId,
    mediaId: unit.mediaId && unit.mediaId.trim().length > 0 ? unit.mediaId : UNKNOWN_MEDIA_ID,
    layerId,
    unitType: 'segment',
    parentUnitId: unit.id,
    ...(unit.speakerId ? { speakerId: unit.speakerId } : {}),
    startTime: unit.startTime,
    endTime: unit.endTime,
    ...(unit.startAnchorId ? { startAnchorId: unit.startAnchorId } : {}),
    ...(unit.endAnchorId ? { endAnchorId: unit.endAnchorId } : {}),
    provenance: {
      actorType: 'system',
      method: 'projection',
      createdAt: now,
      updatedAt: now,
    },
    createdAt: now,
    updatedAt: now,
  };

  const contentDoc: LayerUnitContentDocType = {
    id: ids.segmentContentId,
    textId: unit.textId,
    unitId: ids.segmentId,
    layerId,
    contentRole: 'primary_text',
    modality: translation.modality ?? 'text',
    ...(translation.text !== undefined ? { text: translation.text } : {}),
    ...(translationMediaRefId ? { mediaRefId: translationMediaRefId } : {}),
    sourceType: translation.sourceType ?? 'human',
    ...(translation.ai_metadata ? { ai_metadata: translation.ai_metadata } : {}),
    ...(translation.provenance ? { provenance: translation.provenance } : {}),
    ...(translation.accessRights ? { accessRights: translation.accessRights } : {}),
    createdAt: translation.createdAt,
    updatedAt: translation.updatedAt,
  };

  // 事务保护：删旧 content + 写 segment + 写 content 必须原子执行 | Transaction: stale delete + segment upsert + content upsert must be atomic
  await withTransaction(db, 'rw', [...dexieStoresForLayerUnitsAndContentsRw(db)], async () => {
    const staleContentIds = getSegmentContentCandidateIds(translation.id)
      .filter((id) => id !== ids.segmentContentId);
    if (staleContentIds.length > 0) {
      await LayerUnitSegmentWriteService.deleteSegmentContentsByIds(db, staleContentIds);
    }

    await LayerUnitSegmentWriteService.upsertSegments(db, [segmentDoc]);
    await LayerUnitSegmentWriteService.upsertSegmentContents(db, [contentDoc]);
  }, { label: 'LayerSegmentationTextService.syncUnitTextToSegmentationV2' });

  try {
    await SegmentMetaService.syncForUnitIds([unit.id, ids.segmentId]);
  } catch {
    // 语段读模型刷新失败不应阻塞文本保存 | Segment read-model refresh must not block text saves.
  }
}

export async function removeUnitTextFromSegmentationV2(
  db: JieyuDatabase,
  translation: Pick<LayerUnitContentDocType, 'id'>,
): Promise<void> {
  const candidateContentIds = getSegmentContentCandidateIds(translation.id);
  const affectedContents = await listSegmentContentsByIds(db, candidateContentIds);
  const affectedSegmentIds = uniqueIds(
    affectedContents
      .map((item) => item.segmentId)
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
  );

  const orphanSegmentIds = await listSegmentIdsOrphanedAfterRemovingContents(
    db,
    affectedSegmentIds,
    candidateContentIds,
  );

  if (candidateContentIds.length > 0 || orphanSegmentIds.length > 0) {
    await withTransaction(
      db,
      'rw',
      [...dexieStoresForLayerSegmentGraphRw(db)],
      async () => {
        if (candidateContentIds.length > 0) {
          await LayerUnitSegmentWriteService.deleteSegmentContentsByIds(db, candidateContentIds);
        }
        if (orphanSegmentIds.length > 0) {
          await deleteLayerSegmentGraphBySegmentIds(db, orphanSegmentIds);
        }
      },
      { label: 'removeUnitTextFromSegmentationV2' },
    );
  }

  if (affectedSegmentIds.length > 0) {
    try {
      await SegmentMetaService.syncForUnitIds(affectedSegmentIds);
    } catch {
      // 语段读模型刷新失败不应阻塞文本删除 | Segment read-model refresh must not block text removal.
    }
  }
}

export async function cleanupOrphanSegments(
  db: JieyuDatabase,
  candidateSegmentIds?: Iterable<string>,
): Promise<string[]> {
  const orphanSegmentIds = await findOrphanSegmentIds(
    db,
    candidateSegmentIds ? uniqueIds(candidateSegmentIds) : undefined,
  );

  if (orphanSegmentIds.length === 0) return [];

  await LayerUnitSegmentWriteService.deleteSegmentsByIds(db, orphanSegmentIds);

  return orphanSegmentIds;
}

async function listV2UnitTextsByUnit(
  db: JieyuDatabase,
  unitId: string,
): Promise<LayerUnitContentViewDocType[]> {
  void db;
  const segments = await LayerSegmentQueryService.listSegmentsByParentUnitIds([unitId]);
  if (segments.length === 0) return [];

  const targetSegmentIds = segments.map((segment) => segment.id);
  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));
  const contents = await LayerSegmentQueryService.listSegmentContentsBySegmentIds(targetSegmentIds);

  const rows: LayerUnitContentViewDocType[] = [];
  for (const content of contents) {
    const segmentId = content.segmentId ?? content.unitId ?? '';
    const segment = segmentById.get(segmentId);
    if (!segment) continue;
    const ownerUnitId = segment.unitId;
    if (ownerUnitId !== unitId) continue;
    rows.push(toLegacyLikeUnitText(segment, content, unitId));
  }

  return rows;
}

/**
 * Standalone entry: opens its own `layer_units` + `layer_unit_contents` + `unit_relations` rw txn.
 * When already inside a parent Dexie rw txn that includes those stores (e.g. `LinguisticService.cleanup`),
 * call `deleteLayerSegmentGraphByUnitIds(db, [unitId])` directly to avoid nested transactions on Safari.
 */
export async function removeUnitCascadeFromSegmentationV2(
  db: JieyuDatabase,
  unitId: string,
): Promise<void> {
  // 事务保护：级联删除 content → segment → links 必须原子执行 | Transaction: cascade delete must be atomic
  await withTransaction(db, 'rw', [...dexieStoresForLayerSegmentGraphRw(db)], async () => {
    await deleteLayerSegmentGraphByUnitIds(db, [unitId]);
  }, { label: 'LayerSegmentationTextService.removeUnitCascadeFromSegmentationV2' });
}

/**
 * 按父 unit 时间范围约束 time_subdivision 子 segment。
 * 对越界子段执行裁剪；裁剪后过短（< minSpan）则删除。
 *
 * Clamp time_subdivision child segments to parent unit range.
 * Out-of-range segments are clipped; if too short after clip (< minSpan), they are deleted.
 */
export async function enforceTimeSubdivisionParentBounds(
  db: JieyuDatabase,
  parentUnitId: string,
  parentStartTime: number,
  parentEndTime: number,
  minSpan = 0.05,
): Promise<{ clippedCount: number; deletedCount: number }> {
  const childSegmentIds = uniqueIds(await LayerUnitRelationQueryService.listResidualAwareTimeSubdivisionChildUnitIds(
    [parentUnitId],
    db,
  ));
  if (childSegmentIds.length === 0) {
    return { clippedCount: 0, deletedCount: 0 };
  }

  const segmentById = new Map(
    (await LayerSegmentQueryService.listSegmentsByIds(childSegmentIds)).map((segment) => [segment.id, segment] as const),
  );

  let clippedCount = 0;
  let deletedCount = 0;

  for (const segmentId of childSegmentIds) {
    const segment = segmentById.get(segmentId);
    if (!segment) continue;

    const nextStart = Number(Math.max(segment.startTime, parentStartTime).toFixed(3));
    const nextEnd = Number(Math.min(segment.endTime, parentEndTime).toFixed(3));
    if (nextEnd - nextStart < minSpan) {
      deletedCount += 1;
      await withTransaction(
        db,
        'rw',
        [...dexieStoresForLayerSegmentGraphRw(db)],
        async () => {
          await deleteLayerSegmentGraphBySegmentIds(db, [segment.id]);
        },
        { label: 'LayerSegmentationTextService.enforceTimeSubdivisionParentBounds' },
      );
      continue;
    }

    if (nextStart !== segment.startTime || nextEnd !== segment.endTime) {
      clippedCount += 1;
      await LayerUnitSegmentWriteService.upsertSegments(db, [{
        ...segment,
        startTime: nextStart,
        endTime: nextEnd,
        updatedAt: new Date().toISOString(),
      }]);
    }
  }

  return { clippedCount, deletedCount };
}

export async function listUnitTextsFromSegmentation(db: JieyuDatabase): Promise<LayerUnitContentViewDocType[]> {
  void db;
  const segments = (await LayerSegmentQueryService.listAllSegments()).filter((segment) => Boolean(segment.unitId));
  if (segments.length === 0) {
    return [];
  }

  const segmentById = new Map(segments.map((row) => [row.id, row]));
  const segmentIds = [...segmentById.keys()];

  const contentRows: LayerUnitContentDocType[] = [];
  for (const idChunk of chunkArray(segmentIds, 500)) {
    if (idChunk.length === 0) continue;
    const rows = await LayerSegmentQueryService.listSegmentContentsBySegmentIds(idChunk);
    contentRows.push(...rows);
  }

  if (contentRows.length === 0) return [];

  const v2Rows: LayerUnitContentDocType[] = [];
  for (const content of contentRows) {
    const segment = segmentById.get(content.segmentId ?? content.unitId ?? '');
    if (!segment) continue;
    const unitId = segment.unitId;
    if (!unitId) continue;
    v2Rows.push(toLegacyLikeUnitText(segment, content, unitId));
  }

  return sortByUpdatedAtDesc(v2Rows);
}

export async function listUnitTextsByUnit(
  db: JieyuDatabase,
  unitId: string,
): Promise<LayerUnitContentViewDocType[]> {
  const v2Rows = await listV2UnitTextsByUnit(db, unitId);
  return sortByUpdatedAtDesc(v2Rows);
}

export async function listUnitTextsByUnits(
  db: JieyuDatabase,
  unitIds: Iterable<string>,
): Promise<LayerUnitContentViewDocType[]> {
  const ids = [...new Set(Array.from(unitIds).filter((id) => id.trim().length > 0))];
  if (ids.length === 0) return [];

  void db;
  const segments = await LayerSegmentQueryService.listSegmentsByParentUnitIds(ids);
  if (segments.length === 0) return [];

  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));
  const segmentIds = [...segmentById.keys()];
  const contents = await LayerSegmentQueryService.listSegmentContentsBySegmentIds(segmentIds);

  const idSet = new Set(ids);
  const v2Rows: LayerUnitContentDocType[] = [];
  for (const content of contents) {
    const segmentId = content.segmentId ?? content.unitId ?? '';
    const segment = segmentById.get(segmentId);
    if (!segment) continue;
    if (!segment.unitId || !idSet.has(segment.unitId)) continue;
    v2Rows.push(toLegacyLikeUnitText(segment, content, segment.unitId));
  }

  return sortByUpdatedAtDesc(v2Rows);
}
