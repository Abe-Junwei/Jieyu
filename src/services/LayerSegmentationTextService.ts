import {
  type JieyuDatabase,
  type LayerSegmentDocType,
  type LayerSegmentContentDocType,
  type SegmentLinkDocType,
  type UtteranceDocType,
  type UtteranceTextDocType,
} from '../db';

const UNKNOWN_MEDIA_ID = '__unknown_media__';

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

async function loadLinksBySegmentIds(
  db: JieyuDatabase,
  segmentIds: readonly string[],
): Promise<SegmentLinkDocType[]> {
  if (segmentIds.length === 0) return [];
  const [sourceLinks, targetLinks] = await Promise.all([
    db.dexie.segment_links.where('sourceSegmentId').anyOf(segmentIds).toArray(),
    db.dexie.segment_links.where('targetSegmentId').anyOf(segmentIds).toArray(),
  ]);
  const linkById = new Map<string, SegmentLinkDocType>();
  for (const link of sourceLinks) linkById.set(link.id, link);
  for (const link of targetLinks) linkById.set(link.id, link);
  return [...linkById.values()];
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
  await db.dexie.transaction('rw', db.dexie.layer_segments, db.dexie.layer_segment_contents, async () => {
    const staleContentIds = getSegmentContentCandidateIds(translation.id)
      .filter((id) => id !== ids.segmentContentId);
    if (staleContentIds.length > 0) {
      await db.dexie.layer_segment_contents.bulkDelete(staleContentIds);
    }

    await db.dexie.layer_segments.put(segmentDoc);
    await db.dexie.layer_segment_contents.put(contentDoc);
  });
}

export async function removeUtteranceTextFromSegmentationV2(
  db: JieyuDatabase,
  translation: Pick<UtteranceTextDocType, 'id'>,
): Promise<void> {
  const candidateContentIds = getSegmentContentCandidateIds(translation.id);
  const affectedContents = await db.dexie.layer_segment_contents.bulkGet(candidateContentIds);
  const affectedSegmentIds = Array.from(new Set(
    affectedContents
      .filter((item): item is LayerSegmentContentDocType => Boolean(item))
      .map((item) => item.segmentId),
  ));

  await db.dexie.layer_segment_contents.bulkDelete(candidateContentIds);
  await cleanupOrphanSegments(db, affectedSegmentIds);
}

export async function cleanupOrphanSegments(
  db: JieyuDatabase,
  candidateSegmentIds?: Iterable<string>,
): Promise<string[]> {
  const targetSegmentIds = candidateSegmentIds
    ? [...new Set(Array.from(candidateSegmentIds).filter((id) => id.trim().length > 0))]
    : (await db.dexie.layer_segments.toCollection().primaryKeys()) as string[];

  if (targetSegmentIds.length === 0) return [];

  const relatedContents = await db.dexie.layer_segment_contents.where('segmentId').anyOf(targetSegmentIds).toArray();
  const segmentIdsWithContent = new Set(relatedContents.map((item) => item.segmentId));
  const orphanSegmentIds = targetSegmentIds.filter((segmentId) => !segmentIdsWithContent.has(segmentId));

  if (orphanSegmentIds.length === 0) return [];

  await db.dexie.layer_segments.bulkDelete(orphanSegmentIds);

  const orphanLinks = await loadLinksBySegmentIds(db, orphanSegmentIds);
  const orphanLinkIds = orphanLinks.map((item) => item.id);

  if (orphanLinkIds.length > 0) {
    await db.dexie.segment_links.bulkDelete(orphanLinkIds);
  }

  return orphanSegmentIds;
}

async function listV2UtteranceTextsByUtterance(
  db: JieyuDatabase,
  utteranceId: string,
): Promise<UtteranceTextDocType[]> {
  const links = await db.dexie.segment_links.where('utteranceId').equals(utteranceId).toArray();
  const segmentIds = new Set<string>([
    ...links.map((item) => item.sourceSegmentId),
    ...links.map((item) => item.targetSegmentId),
  ]);

  if (segmentIds.size === 0) {
    // v25: 使用 utteranceId 索引查找 segment | Use utteranceId index on layer_segments
    const indexedSegments = await db.dexie.layer_segments.where('utteranceId').equals(utteranceId).toArray();
    for (const segment of indexedSegments) {
      segmentIds.add(segment.id);
    }
  }

  const targetSegmentIds = [...segmentIds];
  if (targetSegmentIds.length === 0) return [];

  const segments = await db.dexie.layer_segments.bulkGet(targetSegmentIds);
  const segmentById = new Map(
    segments
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map((item) => [item.id, item]),
  );
  const contents = await db.dexie.layer_segment_contents.where('segmentId').anyOf(targetSegmentIds).toArray();

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
  await db.dexie.transaction('rw', db.dexie.layer_segment_contents, db.dexie.layer_segments, db.dexie.segment_links, async () => {
    const links = await db.dexie.segment_links.where('utteranceId').equals(utteranceId).toArray();
    const timeSubdivisionInboundLinks = (await db.dexie.segment_links.where('targetSegmentId').equals(utteranceId).toArray())
      .filter((item) => item.linkType === 'time_subdivision');
    const allRelatedLinks = [...links, ...timeSubdivisionInboundLinks];
    const linkIds = allRelatedLinks.map((item) => item.id);
    const segmentIdsFromLinks = new Set<string>([
      ...allRelatedLinks.map((item) => item.sourceSegmentId),
      ...allRelatedLinks.map((item) => item.targetSegmentId),
    ]);

    // 使用 v25 utteranceId 索引查找关联 segment | Use v25 utteranceId index to find associated segments
    const indexedSegments = await db.dexie.layer_segments.where('utteranceId').equals(utteranceId).toArray();
    for (const segment of indexedSegments) {
      segmentIdsFromLinks.add(segment.id);
    }

    const segmentIds = [...segmentIdsFromLinks];
    if (segmentIds.length > 0) {
      const contentIds = (await db.dexie.layer_segment_contents
        .where('segmentId')
        .anyOf(segmentIds)
        .primaryKeys()) as string[];

      if (contentIds.length > 0) {
        await db.dexie.layer_segment_contents.bulkDelete(contentIds);
      }

      await db.dexie.layer_segments.bulkDelete(segmentIds);
    }

    if (linkIds.length > 0) {
      await db.dexie.segment_links.bulkDelete(linkIds);
    }
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
  const links = (await db.dexie.segment_links.where('targetSegmentId').equals(parentUtteranceId).toArray())
    .filter((item) => item.linkType === 'time_subdivision');
  if (links.length === 0) {
    return { clippedCount: 0, deletedCount: 0 };
  }

  let clippedCount = 0;
  let deletedCount = 0;

  for (const link of links) {
    const segment = await db.dexie.layer_segments.get(link.sourceSegmentId);
    if (!segment) continue;

    const nextStart = Number(Math.max(segment.startTime, parentStartTime).toFixed(3));
    const nextEnd = Number(Math.min(segment.endTime, parentEndTime).toFixed(3));
    if (nextEnd - nextStart < minSpan) {
      deletedCount += 1;
      await db.dexie.transaction(
        'rw',
        db.dexie.layer_segments,
        db.dexie.layer_segment_contents,
        db.dexie.segment_links,
        async () => {
          const contentIds = (await db.dexie.layer_segment_contents
            .where('segmentId')
            .equals(segment.id)
            .primaryKeys()) as string[];
          if (contentIds.length > 0) {
            await db.dexie.layer_segment_contents.bulkDelete(contentIds);
          }
          const sourceLinkIds = (await db.dexie.segment_links
            .where('sourceSegmentId')
            .equals(segment.id)
            .primaryKeys()) as string[];
          const targetLinkIds = (await db.dexie.segment_links
            .where('targetSegmentId')
            .equals(segment.id)
            .primaryKeys()) as string[];
          const segmentLinkIds = [...new Set([...sourceLinkIds, ...targetLinkIds])];
          if (segmentLinkIds.length > 0) {
            await db.dexie.segment_links.bulkDelete(segmentLinkIds);
          }
          await db.dexie.layer_segments.delete(segment.id);
        },
      );
      continue;
    }

    if (nextStart !== segment.startTime || nextEnd !== segment.endTime) {
      clippedCount += 1;
      await db.dexie.layer_segments.update(segment.id, {
        startTime: nextStart,
        endTime: nextEnd,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  return { clippedCount, deletedCount };
}

export async function listUtteranceTextsFromSegmentation(db: JieyuDatabase): Promise<UtteranceTextDocType[]> {
  // 通过 utteranceId 索引收窄 segment 集合，避免 layer_segment_contents 全表扫描 | Narrow via utteranceId index to avoid full contents scan.
  const segments = await db.dexie.layer_segments.where('utteranceId').notEqual('').toArray();
  if (segments.length === 0) {
    return [];
  }

  const segmentById = new Map(segments.map((row) => [row.id, row]));
  const segmentIds = [...segmentById.keys()];

  const contentRows: LayerSegmentContentDocType[] = [];
  for (const idChunk of chunkArray(segmentIds, 500)) {
    if (idChunk.length === 0) continue;
    const rows = await db.dexie.layer_segment_contents.where('segmentId').anyOf(idChunk).toArray();
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

  const segments = await db.dexie.layer_segments.where('utteranceId').anyOf(ids).toArray();
  if (segments.length === 0) return [];

  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));
  const segmentIds = [...segmentById.keys()];
  const contents = await db.dexie.layer_segment_contents.where('segmentId').anyOf(segmentIds).toArray();

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
