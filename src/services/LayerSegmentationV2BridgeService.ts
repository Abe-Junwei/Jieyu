import { featureFlags } from '../ai/config/featureFlags';
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

function parseUtteranceIdFromSegmentId(segmentId: string, layerId: string): string | null {
  const prefixes = ['segv2_', 'segv22_'];
  for (const prefix of prefixes) {
    const expected = `${prefix}${layerId}_`;
    if (!segmentId.startsWith(expected)) continue;
    const value = segmentId.slice(expected.length).trim();
    if (value.length > 0) return value;
  }
  return null;
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

function mergePreferV2(
  legacyRows: UtteranceTextDocType[],
  v2Rows: UtteranceTextDocType[],
): UtteranceTextDocType[] {
  const idMap = new Map<string, UtteranceTextDocType>();
  const upsertById = (row: UtteranceTextDocType) => {
    const existing = idMap.get(row.id);
    if (!existing || row.updatedAt >= existing.updatedAt) {
      idMap.set(row.id, row);
    }
  };
  for (const row of legacyRows) {
    upsertById(row);
  }
  for (const row of v2Rows) {
    upsertById(row);
  }

  const byBusinessKey = new Map<string, UtteranceTextDocType>();
  for (const row of idMap.values()) {
    const key = `${row.utteranceId}::${row.layerId}::${row.modality}`;
    const existing = byBusinessKey.get(key);
    if (!existing || row.updatedAt >= existing.updatedAt) {
      byBusinessKey.set(key, row);
    }
  }
  return sortByUpdatedAtDesc([...byBusinessKey.values()]);
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
  if (!featureFlags.segmentBoundaryV2Enabled) return;

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

  const staleContentIds = getSegmentContentCandidateIds(translation.id)
    .filter((id) => id !== ids.segmentContentId);
  if (staleContentIds.length > 0) {
    await db.dexie.layer_segment_contents.bulkDelete(staleContentIds);
  }

  await db.collections.layer_segments.insert(segmentDoc);
  await db.collections.layer_segment_contents.insert(contentDoc);
}

export async function removeUtteranceTextFromSegmentationV2(
  db: JieyuDatabase,
  translation: Pick<UtteranceTextDocType, 'id'>,
): Promise<void> {
  if (!featureFlags.segmentBoundaryV2Enabled) return;

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
  if (!featureFlags.segmentBoundaryV2Enabled) return [];

  const targetSegmentIds = candidateSegmentIds
    ? [...new Set(Array.from(candidateSegmentIds).filter((id) => id.trim().length > 0))]
    : (await db.dexie.layer_segments.toCollection().primaryKeys()) as string[];

  if (targetSegmentIds.length === 0) return [];

  const orphanSegmentIds: string[] = [];
  for (const segmentId of targetSegmentIds) {
    const contentCount = await db.dexie.layer_segment_contents.where('segmentId').equals(segmentId).count();
    if (contentCount === 0) {
      orphanSegmentIds.push(segmentId);
    }
  }

  if (orphanSegmentIds.length === 0) return [];

  await db.dexie.layer_segments.bulkDelete(orphanSegmentIds);

  const allLinks = await db.dexie.segment_links.toArray();
  const orphanSet = new Set(orphanSegmentIds);
  const orphanLinkIds = allLinks
    .filter((item) => orphanSet.has(item.sourceSegmentId) || orphanSet.has(item.targetSegmentId))
    .map((item) => item.id);

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
    // Fallback: ID 后缀匹配（旧数据未回填 utteranceId 字段） | ID suffix match for legacy data
    if (segmentIds.size === 0) {
      const allSegments = await db.dexie.layer_segments.toArray();
      for (const segment of allSegments) {
        if (segment.id.endsWith(`_${utteranceId}`)) {
          segmentIds.add(segment.id);
        }
      }
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
    const ownerUtteranceId = parseUtteranceIdFromSegmentId(segment.id, segment.layerId) ?? utteranceId;
    if (ownerUtteranceId !== utteranceId) continue;
    rows.push(toLegacyLikeUtteranceText(segment, content, utteranceId));
  }

  return rows;
}

export async function removeUtteranceCascadeFromSegmentationV2(
  db: JieyuDatabase,
  utteranceId: string,
): Promise<void> {
  if (!featureFlags.segmentBoundaryV2Enabled) return;

  const links = await db.dexie.segment_links.where('utteranceId').equals(utteranceId).toArray();
  const linkIds = links.map((item) => item.id);
  const segmentIdsFromLinks = new Set<string>([
    ...links.map((item) => item.sourceSegmentId),
    ...links.map((item) => item.targetSegmentId),
  ]);

  // 使用 v25 utteranceId 索引查找关联 segment | Use v25 utteranceId index to find associated segments
  const indexedSegments = await db.dexie.layer_segments.where('utteranceId').equals(utteranceId).toArray();
  for (const segment of indexedSegments) {
    segmentIdsFromLinks.add(segment.id);
  }

  // Fallback: ID 后缀匹配（覆盖旧数据未回填 utteranceId 字段的情况）
  // Fallback: suffix-match for legacy segments missing backfilled utteranceId field
  if (indexedSegments.length === 0) {
    const suffixPattern = `_${utteranceId}`;
    const allSegments = await db.dexie.layer_segments.toArray();
    for (const segment of allSegments) {
      if (segment.id.endsWith(suffixPattern)) {
        segmentIdsFromLinks.add(segment.id);
      }
    }
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
}

export async function getAllUtteranceTextsPreferV2(db: JieyuDatabase): Promise<UtteranceTextDocType[]> {
  const legacyRows = (await db.collections.utterance_texts.find().exec())
    .map((row) => row.toJSON() as UtteranceTextDocType);

  if (!featureFlags.segmentBoundaryV2Enabled) {
    return sortByUpdatedAtDesc(legacyRows);
  }

  const [segments, contents, links] = await Promise.all([
    db.dexie.layer_segments.toArray(),
    db.dexie.layer_segment_contents.toArray(),
    db.dexie.segment_links.toArray(),
  ]);

  if (segments.length === 0 || contents.length === 0) {
    return sortByUpdatedAtDesc(legacyRows);
  }

  const segmentById = new Map(segments.map((row) => [row.id, row]));
  const utteranceIdBySegmentId = new Map<string, string>();
  for (const link of links as SegmentLinkDocType[]) {
    if (!link.utteranceId) continue;
    if (link.sourceSegmentId) utteranceIdBySegmentId.set(link.sourceSegmentId, link.utteranceId);
    if (link.targetSegmentId) utteranceIdBySegmentId.set(link.targetSegmentId, link.utteranceId);
  }

  const v2Rows: UtteranceTextDocType[] = [];
  for (const content of contents as LayerSegmentContentDocType[]) {
    const segment = segmentById.get(content.segmentId);
    if (!segment) continue;
    const utteranceId = utteranceIdBySegmentId.get(segment.id)
      ?? parseUtteranceIdFromSegmentId(segment.id, segment.layerId);
    if (!utteranceId) continue;
    v2Rows.push(toLegacyLikeUtteranceText(segment, content, utteranceId));
  }

  if (v2Rows.length === 0) {
    return sortByUpdatedAtDesc(legacyRows);
  }

  return mergePreferV2(legacyRows, v2Rows);
}

export async function getUtteranceTextsByUtterancePreferV2(
  db: JieyuDatabase,
  utteranceId: string,
): Promise<UtteranceTextDocType[]> {
  const legacyRows = (await db.collections.utterance_texts.findByIndex('utteranceId', utteranceId))
    .map((row) => row.toJSON() as UtteranceTextDocType);

  if (!featureFlags.segmentBoundaryV2Enabled) {
    return sortByUpdatedAtDesc(legacyRows);
  }

  const v2Rows = await listV2UtteranceTextsByUtterance(db, utteranceId);
  if (v2Rows.length === 0) {
    return sortByUpdatedAtDesc(legacyRows);
  }

  return mergePreferV2(legacyRows, v2Rows);
}

export async function getUtteranceTextsByUtterancesPreferV2(
  db: JieyuDatabase,
  utteranceIds: Iterable<string>,
): Promise<UtteranceTextDocType[]> {
  const ids = [...new Set(Array.from(utteranceIds).filter((id) => id.trim().length > 0))];
  if (ids.length === 0) return [];

  // 按 utteranceId 索引批量查询，避免全表扫描 | Batch indexed queries per utteranceId, avoiding full table scan
  const legacyRows = (await db.collections.utterance_texts.findByIndexAnyOf('utteranceId', ids))
    .map((row) => row.toJSON() as UtteranceTextDocType);

  if (!featureFlags.segmentBoundaryV2Enabled) {
    return sortByUpdatedAtDesc(legacyRows);
  }

  const v2Rows: UtteranceTextDocType[] = [];
  for (const utteranceId of ids) {
    const batch = await listV2UtteranceTextsByUtterance(db, utteranceId);
    v2Rows.push(...batch);
  }

  if (v2Rows.length === 0) {
    return sortByUpdatedAtDesc(legacyRows);
  }

  return mergePreferV2(legacyRows, v2Rows);
}
