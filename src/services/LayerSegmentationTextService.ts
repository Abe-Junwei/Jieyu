import {
  type JieyuDatabase,
  type LayerSegmentDocType,
  type LayerSegmentContentDocType,
  type UtteranceDocType,
  type UtteranceTextDocType,
} from '../db';
import {
  deleteLayerSegmentGraphBySegmentIds,
  deleteLayerSegmentGraphByUtteranceIds,
  findOrphanSegmentIds,
  listSegmentContentsByIds,
} from './LayerSegmentGraphService';
import { LegacyMirrorService } from './LegacyMirrorService';
import { LayerUnitRelationQueryService } from './LayerUnitRelationQueryService';
import { LayerSegmentQueryService } from './LayerSegmentQueryService';

const UNKNOWN_MEDIA_ID = '__unknown_media__';

function uniqueIds(ids: Iterable<string>): string[] {
  return [...new Set(Array.from(ids).filter((id) => id.trim().length > 0))];
}

function buildSegmentId(layerId: string, utteranceId: string): string {
  return `segv2_${layerId}_${utteranceId}`;
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

function toLegacyLikeUtteranceText(
  segment: LayerSegmentDocType,
  content: LayerSegmentContentDocType,
  utteranceId: string,
): UtteranceTextDocType {
  return {
    id: parseTranslationIdFromContentId(content.id),
    utteranceId,
    layerId: content.layerId,
    modality: content.modality,
    ...(content.text !== undefined ? { text: content.text } : {}),
    ...(content.translationAudioMediaId ? { translationAudioMediaId: content.translationAudioMediaId } : {}),
    sourceType: content.sourceType,
    ...(content.ai_metadata ? { ai_metadata: content.ai_metadata } : {}),
    ...(content.provenance ? { provenance: content.provenance } : {}),
    ...(content.accessRights ? { accessRights: content.accessRights } : {}),
    ...(segment.externalRef ? { externalRef: segment.externalRef } : {}),
    createdAt: content.createdAt,
    updatedAt: content.updatedAt,
  };
}

function sortByUpdatedAtDesc(rows: UtteranceTextDocType[]): UtteranceTextDocType[] {
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

export function getSegmentationV2Ids(layerId: string, utteranceId: string, translationId: string): {
  segmentId: string;
  segmentContentId: string;
} {
  return {
    segmentId: buildSegmentId(layerId, utteranceId),
    segmentContentId: buildSegmentContentId(translationId),
  };
}

export async function syncUtteranceTextToSegmentationV2(
  db: JieyuDatabase,
  utterance: UtteranceDocType,
  translation: UtteranceTextDocType,
): Promise<void> {
  const now = new Date().toISOString();
  const ids = getSegmentationV2Ids(translation.layerId, utterance.id, translation.id);

  const segmentDoc: LayerSegmentDocType = {
    id: ids.segmentId,
    textId: utterance.textId,
    mediaId: utterance.mediaId && utterance.mediaId.trim().length > 0 ? utterance.mediaId : UNKNOWN_MEDIA_ID,
    layerId: translation.layerId,
    utteranceId: utterance.id,
    startTime: utterance.startTime,
    endTime: utterance.endTime,
    ...(utterance.startAnchorId ? { startAnchorId: utterance.startAnchorId } : {}),
    ...(utterance.endAnchorId ? { endAnchorId: utterance.endAnchorId } : {}),
    provenance: {
      actorType: 'system',
      method: 'projection',
      createdAt: now,
      updatedAt: now,
    },
    createdAt: now,
    updatedAt: now,
  };

  const contentDoc: LayerSegmentContentDocType = {
    id: ids.segmentContentId,
    textId: utterance.textId,
    segmentId: ids.segmentId,
    layerId: translation.layerId,
    modality: translation.modality,
    ...(translation.text !== undefined ? { text: translation.text } : {}),
    ...(translation.translationAudioMediaId ? { translationAudioMediaId: translation.translationAudioMediaId } : {}),
    sourceType: translation.sourceType,
    ...(translation.ai_metadata ? { ai_metadata: translation.ai_metadata } : {}),
    ...(translation.provenance ? { provenance: translation.provenance } : {}),
    ...(translation.accessRights ? { accessRights: translation.accessRights } : {}),
    createdAt: translation.createdAt,
    updatedAt: translation.updatedAt,
  };

  // 事务保护：删旧 content + 写 segment + 写 content 必须原子执行 | Transaction: stale delete + segment upsert + content upsert must be atomic
  await db.dexie.transaction('rw', db.dexie.layer_units, db.dexie.layer_unit_contents, async () => {
    const staleContentIds = getSegmentContentCandidateIds(translation.id)
      .filter((id) => id !== ids.segmentContentId);
    if (staleContentIds.length > 0) {
      await LegacyMirrorService.deleteSegmentContentsByIds(db, staleContentIds);
    }

    await LegacyMirrorService.upsertSegments(db, [segmentDoc]);
    await LegacyMirrorService.upsertSegmentContents(db, [contentDoc]);
  });
}

export async function removeUtteranceTextFromSegmentationV2(
  db: JieyuDatabase,
  translation: Pick<UtteranceTextDocType, 'id'>,
): Promise<void> {
  const candidateContentIds = getSegmentContentCandidateIds(translation.id);
  const affectedContents = await listSegmentContentsByIds(db, candidateContentIds);
  const affectedSegmentIds = Array.from(new Set(
    affectedContents.map((item) => item.segmentId),
  ));

  await LegacyMirrorService.deleteSegmentContentsByIds(db, candidateContentIds);
  await cleanupOrphanSegments(db, affectedSegmentIds);
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

  await LegacyMirrorService.deleteSegmentsByIds(db, orphanSegmentIds);

  return orphanSegmentIds;
}

async function listV2UtteranceTextsByUtterance(
  db: JieyuDatabase,
  utteranceId: string,
): Promise<UtteranceTextDocType[]> {
  void db;
  const segments = await LayerSegmentQueryService.listSegmentsByParentUnitIds([utteranceId]);
  if (segments.length === 0) return [];

  const targetSegmentIds = segments.map((segment) => segment.id);
  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));
  const contents = await LayerSegmentQueryService.listSegmentContentsBySegmentIds(targetSegmentIds);

  const rows: UtteranceTextDocType[] = [];
  for (const content of contents) {
    const segment = segmentById.get(content.segmentId);
    if (!segment) continue;
    const ownerUtteranceId = segment.utteranceId;
    if (ownerUtteranceId !== utteranceId) continue;
    rows.push(toLegacyLikeUtteranceText(segment, content, utteranceId));
  }

  return rows;
}

export async function removeUtteranceCascadeFromSegmentationV2(
  db: JieyuDatabase,
  utteranceId: string,
): Promise<void> {
  // 事务保护：级联删除 content → segment → links 必须原子执行 | Transaction: cascade delete must be atomic
  await db.dexie.transaction('rw', [
    db.dexie.layer_unit_contents,
    db.dexie.layer_units,
    db.dexie.unit_relations,
  ], async () => {
    await deleteLayerSegmentGraphByUtteranceIds(db, [utteranceId]);
  });
}

/**
 * 按父 utterance 时间范围约束 time_subdivision 子 segment。
 * 对越界子段执行裁剪；裁剪后过短（< minSpan）则删除。
 *
 * Clamp time_subdivision child segments to parent utterance range.
 * Out-of-range segments are clipped; if too short after clip (< minSpan), they are deleted.
 */
export async function enforceTimeSubdivisionParentBounds(
  db: JieyuDatabase,
  parentUtteranceId: string,
  parentStartTime: number,
  parentEndTime: number,
  minSpan = 0.05,
): Promise<{ clippedCount: number; deletedCount: number }> {
  const childSegmentIds = uniqueIds(await LayerUnitRelationQueryService.listResidualAwareTimeSubdivisionChildUnitIds(
    [parentUtteranceId],
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
      await db.dexie.transaction(
        'rw',
        [
          db.dexie.layer_unit_contents,
          db.dexie.layer_units,
          db.dexie.unit_relations,
        ],
        async () => {
          await deleteLayerSegmentGraphBySegmentIds(db, [segment.id]);
        },
      );
      continue;
    }

    if (nextStart !== segment.startTime || nextEnd !== segment.endTime) {
      clippedCount += 1;
      await LegacyMirrorService.upsertSegments(db, [{
        ...segment,
        startTime: nextStart,
        endTime: nextEnd,
        updatedAt: new Date().toISOString(),
      }]);
    }
  }

  return { clippedCount, deletedCount };
}

export async function listUtteranceTextsFromSegmentation(db: JieyuDatabase): Promise<UtteranceTextDocType[]> {
  void db;
  const segments = (await LayerSegmentQueryService.listAllSegments()).filter((segment) => Boolean(segment.utteranceId));
  if (segments.length === 0) {
    return [];
  }

  const segmentById = new Map(segments.map((row) => [row.id, row]));
  const segmentIds = [...segmentById.keys()];

  const contentRows: LayerSegmentContentDocType[] = [];
  for (const idChunk of chunkArray(segmentIds, 500)) {
    if (idChunk.length === 0) continue;
    const rows = await LayerSegmentQueryService.listSegmentContentsBySegmentIds(idChunk);
    contentRows.push(...rows);
  }

  if (contentRows.length === 0) return [];

  const v2Rows: UtteranceTextDocType[] = [];
  for (const content of contentRows) {
    const segment = segmentById.get(content.segmentId);
    if (!segment) continue;
    const utteranceId = segment.utteranceId;
    if (!utteranceId) continue;
    v2Rows.push(toLegacyLikeUtteranceText(segment, content, utteranceId));
  }

  return sortByUpdatedAtDesc(v2Rows);
}

export async function listUtteranceTextsByUtterance(
  db: JieyuDatabase,
  utteranceId: string,
): Promise<UtteranceTextDocType[]> {
  const v2Rows = await listV2UtteranceTextsByUtterance(db, utteranceId);
  return sortByUpdatedAtDesc(v2Rows);
}

export async function listUtteranceTextsByUtterances(
  db: JieyuDatabase,
  utteranceIds: Iterable<string>,
): Promise<UtteranceTextDocType[]> {
  const ids = [...new Set(Array.from(utteranceIds).filter((id) => id.trim().length > 0))];
  if (ids.length === 0) return [];

  void db;
  const segments = await LayerSegmentQueryService.listSegmentsByParentUnitIds(ids);
  if (segments.length === 0) return [];

  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));
  const segmentIds = [...segmentById.keys()];
  const contents = await LayerSegmentQueryService.listSegmentContentsBySegmentIds(segmentIds);

  const idSet = new Set(ids);
  const v2Rows: UtteranceTextDocType[] = [];
  for (const content of contents) {
    const segment = segmentById.get(content.segmentId);
    if (!segment) continue;
    if (!segment.utteranceId || !idSet.has(segment.utteranceId)) continue;
    v2Rows.push(toLegacyLikeUtteranceText(segment, content, segment.utteranceId));
  }

  return sortByUpdatedAtDesc(v2Rows);
}
