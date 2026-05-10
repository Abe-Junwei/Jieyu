import { getDb, type LayerUnitDocType, type SpeakerDocType } from '../db';
import type { SpeakerReferenceStatsBundle } from '../hooks/speakerManagement/types';
import { normalizeUnitDocForStorage } from '../utils/camDataUtils';
import { newId } from '../utils/transcriptionFormatters';
import {
  bulkUpsertUnitLayerUnits,
  getUnitDocProjectionById,
  listUnitDocsFromCanonicalLayerUnits,
} from './LayerSegmentGraphService';
import { LayerSegmentQueryService } from './LayerSegmentQueryService';
import { LayerUnitSegmentWriteService } from './LayerUnitSegmentWriteService';
import { SegmentMetaService } from './SegmentMetaService';

export async function getSpeakers(): Promise<SpeakerDocType[]> {
  const db = await getDb();
  const docs = await db.collections.speakers.find().exec();
  return docs
    .map((doc) => doc.toJSON())
    .sort((a, b) => {
      const byName = a.name.localeCompare(b.name, 'zh-Hans-CN');
      if (byName !== 0) return byName;
      return a.id.localeCompare(b.id, 'en');
    });
}

export async function getSpeakerReferenceStats(options?: {
  mediaId?: string | null;
}): Promise<SpeakerReferenceStatsBundle> {
  const db = await getDb();
  const [unitRowsRaw, allSegments] = await Promise.all([
    listUnitDocsFromCanonicalLayerUnits(db),
    LayerSegmentQueryService.listAllSegments(),
  ]);

  const mediaKey = typeof options?.mediaId === 'string' ? options.mediaId.trim() : '';
  const unitRows =
    mediaKey.length > 0
      ? unitRowsRaw.filter((row) => (row.mediaId ?? '').trim() === mediaKey)
      : unitRowsRaw;
  const segments =
    mediaKey.length > 0
      ? allSegments.filter((row) => (row.mediaId?.trim() ?? '') === mediaKey)
      : allSegments;

  const stats = new Map<
    string,
    { transcriptionUnitCount: number; segmentCount: number; totalCount: number }
  >();
  const unassigned = { transcriptionUnitCount: 0, segmentCount: 0, totalCount: 0 };

  const ensure = (speakerId: string) => {
    const normalizedId = speakerId.trim();
    if (!normalizedId) return null;
    const existing = stats.get(normalizedId);
    if (existing) return existing;
    const next = { transcriptionUnitCount: 0, segmentCount: 0, totalCount: 0 };
    stats.set(normalizedId, next);
    return next;
  };

  for (const doc of unitRows) {
    const speakerId = doc.speakerId?.trim();
    if (!speakerId) {
      unassigned.transcriptionUnitCount += 1;
      unassigned.totalCount += 1;
      continue;
    }
    const target = ensure(speakerId);
    if (!target) continue;
    target.transcriptionUnitCount += 1;
    target.totalCount += 1;
  }

  for (const segment of segments) {
    const speakerId = segment.speakerId?.trim();
    if (!speakerId) {
      unassigned.segmentCount += 1;
      unassigned.totalCount += 1;
      continue;
    }
    const target = ensure(speakerId);
    if (!target) continue;
    target.segmentCount += 1;
    target.totalCount += 1;
  }

  return { perSpeaker: Object.fromEntries(stats.entries()), unassigned };
}

export async function createSpeaker(input: {
  name: string;
  pseudonym?: string;
  role?: SpeakerDocType['role'];
}): Promise<SpeakerDocType> {
  const db = await getDb();
  const name = input.name.trim();
  if (!name) throw new Error('\u8bf4\u8bdd\u4eba\u540d\u79f0\u4e0d\u80fd\u4e3a\u7a7a');

  const normalizedName = name.toLocaleLowerCase('zh-Hans-CN');
  const existingSpeakers = (await db.collections.speakers.find().exec()).map((doc) => doc.toJSON());
  const duplicate = existingSpeakers.find(
    (speaker) => speaker.name.trim().toLocaleLowerCase('zh-Hans-CN') === normalizedName,
  );
  if (duplicate) throw new Error(`\u8bf4\u8bdd\u4eba\u5df2\u5b58\u5728: ${duplicate.name}`);

  const now = new Date().toISOString();
  const speaker: SpeakerDocType = {
    id: newId('speaker'),
    name,
    ...(input.pseudonym?.trim() ? { pseudonym: input.pseudonym.trim() } : {}),
    ...(input.role ? { role: input.role } : {}),
    createdAt: now,
    updatedAt: now,
  };

  await db.collections.speakers.insert(speaker);
  return speaker;
}

export async function renameSpeaker(speakerId: string, nextName: string): Promise<SpeakerDocType> {
  const db = await getDb();
  const id = speakerId.trim();
  const name = nextName.trim();
  if (!id) throw new Error('\u8bf4\u8bdd\u4eba ID \u4e0d\u80fd\u4e3a\u7a7a');
  if (!name) throw new Error('\u8bf4\u8bdd\u4eba\u540d\u79f0\u4e0d\u80fd\u4e3a\u7a7a');

  const speakerDoc = await db.collections.speakers.findOne({ selector: { id } }).exec();
  if (!speakerDoc) throw new Error(`\u8bf4\u8bdd\u4eba\u4e0d\u5b58\u5728: ${id}`);

  const normalizedName = name.toLocaleLowerCase('zh-Hans-CN');
  const existingSpeakers = (await db.collections.speakers.find().exec()).map((doc) => doc.toJSON());
  const duplicate = existingSpeakers.find(
    (speaker) =>
      speaker.id !== id && speaker.name.trim().toLocaleLowerCase('zh-Hans-CN') === normalizedName,
  );
  if (duplicate) throw new Error(`\u8bf4\u8bdd\u4eba\u5df2\u5b58\u5728: ${duplicate.name}`);

  const current = speakerDoc.toJSON();
  const now = new Date().toISOString();
  const updated: SpeakerDocType = {
    ...current,
    name,
    updatedAt: now,
  };
  await db.collections.speakers.insert(updated);

  return updated;
}

export async function mergeSpeakers(
  sourceSpeakerId: string,
  targetSpeakerId: string,
): Promise<number> {
  const db = await getDb();
  const sourceId = sourceSpeakerId.trim();
  const targetId = targetSpeakerId.trim();
  if (!sourceId || !targetId) throw new Error('\u8bf4\u8bdd\u4eba ID \u4e0d\u80fd\u4e3a\u7a7a');
  if (sourceId === targetId) return 0;

  const [sourceDoc, targetDoc] = await Promise.all([
    db.collections.speakers.findOne({ selector: { id: sourceId } }).exec(),
    db.collections.speakers.findOne({ selector: { id: targetId } }).exec(),
  ]);

  if (!sourceDoc) throw new Error(`\u6765\u6e90\u8bf4\u8bdd\u4eba\u4e0d\u5b58\u5728: ${sourceId}`);
  if (!targetDoc) throw new Error(`\u76ee\u6807\u8bf4\u8bdd\u4eba\u4e0d\u5b58\u5728: ${targetId}`);

  const target = targetDoc.toJSON();
  const now = new Date().toISOString();
  const unitRows = (await listUnitDocsFromCanonicalLayerUnits(db)).filter(
    (row) => row.speakerId?.trim() === sourceId,
  );
  const segments = (await LayerSegmentQueryService.listAllSegments()).filter(
    (segment) => segment.speakerId?.trim() === sourceId,
  );

  if (unitRows.length > 0) {
    const normalized = unitRows.map((row) =>
      normalizeUnitDocForStorage({
        ...row,
        speakerId: target.id,
        speaker: target.name,
        updatedAt: now,
      }),
    );
    await bulkUpsertUnitLayerUnits(db, normalized);
  }

  if (segments.length > 0) {
    const normalizedSegments = segments.map((segment) => ({
      ...segment,
      speakerId: target.id,
      updatedAt: now,
    }));
    await LayerUnitSegmentWriteService.upsertSegments(db, normalizedSegments);
  }

  await db.collections.speakers.remove(sourceId);
  return unitRows.length + segments.length;
}

export async function deleteSpeaker(
  speakerId: string,
  options: {
    strategy?: 'clear' | 'merge' | 'reject';
    targetSpeakerId?: string;
  } = {},
): Promise<number> {
  const db = await getDb();
  const id = speakerId.trim();
  if (!id) throw new Error('\u8bf4\u8bdd\u4eba ID \u4e0d\u80fd\u4e3a\u7a7a');

  const strategy = options.strategy ?? 'reject';
  const speakerDoc = await db.collections.speakers.findOne({ selector: { id } }).exec();
  if (!speakerDoc) throw new Error(`\u8bf4\u8bdd\u4eba\u4e0d\u5b58\u5728: ${id}`);

  const units = (await listUnitDocsFromCanonicalLayerUnits(db)).filter(
    (row) => row.speakerId?.trim() === id,
  );
  const segments = (await LayerSegmentQueryService.listAllSegments()).filter(
    (segment) => segment.speakerId?.trim() === id,
  );
  const affectedCount = units.length + segments.length;

  if (affectedCount > 0 && strategy === 'reject') {
    throw new Error(
      `\u8bf4\u8bdd\u4eba\u4ecd\u88ab ${affectedCount} \u6761\u53e5\u6bb5\u5f15\u7528`,
    );
  }

  const now = new Date().toISOString();

  if (affectedCount > 0 && strategy === 'merge') {
    const targetId = options.targetSpeakerId?.trim();
    if (!targetId)
      throw new Error(
        '\u5220\u9664\u8bf4\u8bdd\u4eba\u65f6\u672a\u6307\u5b9a\u8fc1\u79fb\u76ee\u6807',
      );
    if (targetId === id)
      throw new Error('\u8fc1\u79fb\u76ee\u6807\u4e0d\u80fd\u662f\u5f53\u524d\u8bf4\u8bdd\u4eba');
    const targetDoc = await db.collections.speakers.findOne({ selector: { id: targetId } }).exec();
    if (!targetDoc)
      throw new Error(`\u76ee\u6807\u8bf4\u8bdd\u4eba\u4e0d\u5b58\u5728: ${targetId}`);
    const target = targetDoc.toJSON();

    const normalized = units.map((row) =>
      normalizeUnitDocForStorage({
        ...row,
        speakerId: target.id,
        speaker: target.name,
        updatedAt: now,
      }),
    );
    if (normalized.length > 0) {
      await bulkUpsertUnitLayerUnits(db, normalized);
    }

    if (segments.length > 0) {
      const normalizedSegments = segments.map((segment) => ({
        ...segment,
        speakerId: target.id,
        updatedAt: now,
      }));
      await LayerUnitSegmentWriteService.upsertSegments(db, normalizedSegments);
    }
  }

  if (affectedCount > 0 && strategy === 'clear') {
    const normalized = units.map((row) => {
      const { speaker: _oldSpeaker, speakerId: _oldSpeakerId, ...rest } = row;
      return normalizeUnitDocForStorage({
        ...rest,
        updatedAt: now,
      });
    });
    if (normalized.length > 0) {
      await bulkUpsertUnitLayerUnits(db, normalized);
    }

    if (segments.length > 0) {
      const normalizedSegments = segments.map((segment) => {
        const { speakerId: _oldSpeakerId, ...rest } = segment;
        return {
          ...rest,
          updatedAt: now,
        };
      });
      await LayerUnitSegmentWriteService.upsertSegments(db, normalizedSegments);
    }
  }

  void SegmentMetaService.syncForUnitIds([
    ...units.map((row) => row.id),
    ...segments.map((row) => row.id),
  ]).catch(() => {
    // SegmentMeta 为统一读模型，说话人同步失败不应阻塞删除流程 | SegmentMeta is a shared read model; speaker-sync failures must not block deletion.
  });
  await db.collections.speakers.remove(id);
  return affectedCount;
}

export async function assignSpeakerToUnits(
  unitIds: Iterable<string>,
  speakerId?: string,
): Promise<number> {
  const db = await getDb();
  const ids = [
    ...new Set(
      Array.from(unitIds)
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    ),
  ];
  if (ids.length === 0) return 0;

  const selectedSpeakerId = speakerId?.trim();
  let speaker: SpeakerDocType | undefined;
  if (selectedSpeakerId) {
    const speakerDoc = await db.collections.speakers
      .findOne({ selector: { id: selectedSpeakerId } })
      .exec();
    if (!speakerDoc) {
      throw new Error(`\u8bf4\u8bdd\u4eba\u4e0d\u5b58\u5728: ${selectedSpeakerId}`);
    }
    speaker = speakerDoc.toJSON();
  }

  const rows = (await Promise.all(ids.map((id) => getUnitDocProjectionById(db, id)))).filter(
    (row): row is LayerUnitDocType => Boolean(row),
  );
  if (rows.length === 0) return 0;

  const now = new Date().toISOString();
  const updates = rows.map((row) => {
    const { speaker: _oldSpeaker, speakerId: _oldSpeakerId, ...rest } = row;
    return normalizeUnitDocForStorage({
      ...rest,
      ...(speaker ? { speaker: speaker.name, speakerId: speaker.id } : {}),
      updatedAt: now,
    });
  });

  await bulkUpsertUnitLayerUnits(db, updates);
  void SegmentMetaService.syncForUnitIds(updates.map((row) => row.id)).catch(() => {
    // SegmentMeta 为统一读模型，说话人同步失败不应阻塞主流程 | SegmentMeta is a shared read model; speaker-sync failures must not block the primary flow.
  });
  return updates.length;
}

export async function assignSpeakerToSegments(
  segmentIds: Iterable<string>,
  speakerId?: string,
): Promise<number> {
  const db = await getDb();
  const ids = [
    ...new Set(
      Array.from(segmentIds)
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    ),
  ];
  if (ids.length === 0) return 0;

  const selectedSpeakerId = speakerId?.trim();
  let resolvedSpeakerId: string | undefined;
  if (selectedSpeakerId) {
    const speakerDoc = await db.collections.speakers
      .findOne({ selector: { id: selectedSpeakerId } })
      .exec();
    if (!speakerDoc) {
      throw new Error(`\u8bf4\u8bdd\u4eba\u4e0d\u5b58\u5728: ${selectedSpeakerId}`);
    }
    resolvedSpeakerId = speakerDoc.toJSON().id;
  }

  const rows = await LayerSegmentQueryService.listSegmentsByIds(ids);
  if (rows.length === 0) return 0;

  const now = new Date().toISOString();
  const updates = rows.map((row) => {
    const { speakerId: _oldSpeakerId, ...rest } = row;
    return {
      ...rest,
      ...(resolvedSpeakerId ? { speakerId: resolvedSpeakerId } : {}),
      updatedAt: now,
    };
  });

  await LayerUnitSegmentWriteService.upsertSegments(db, updates);
  void SegmentMetaService.syncForUnitIds(updates.map((row) => row.id)).catch(() => {
    // SegmentMeta 为统一读模型，说话人同步失败不应阻塞主流程 | SegmentMeta is a shared read model; speaker-sync failures must not block the primary flow.
  });
  return updates.length;
}
