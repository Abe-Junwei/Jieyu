import { getDb, withTransaction, type MediaItemDocType } from '../db';
import { newId } from '../utils/transcriptionFormatters';
import {
  isAuxiliaryRecordingMediaRow,
  isMediaItemPlaceholderRow,
  MEDIA_TIMELINE_KIND_ACOUSTIC,
  MEDIA_TIMELINE_KIND_PLACEHOLDER,
} from '../utils/mediaItemTimelineKind';
import { remapLayerUnitsAndAnchorsForFirstAcousticImport } from '../utils/remapLayerUnitsForFirstAcousticImport';
import { LayerSegmentQueryService } from './LayerSegmentQueryService';
import { LayerUnitSegmentWriteService } from './LayerUnitSegmentWriteService';

export async function importAudio(input: {
  textId: string;
  audioBlob: Blob;
  filename: string;
  duration: number;
  /**
   * `default`：与既有行为一致——仅占位行时晋升占位；已存在非占位声学则新建 `mediaId`。
   * `replace`：覆盖 `replaceMediaId` 指向的行（声学就地换源，或显式晋升某条占位）。
   * `add`：在已存在非占位声学时强制新建一条媒体轨；若当前仅有占位则与 `default` 相同（仍晋升占位）。
   */
  importMode?: 'default' | 'replace' | 'add';
  /** `importMode === 'replace'` 时必填，且须属于 `textId`。 */
  replaceMediaId?: string;
}): Promise<{ mediaId: string }> {
  const db = await getDb();
  const now = new Date().toISOString();
  const mode = input.importMode ?? 'default';
  const replaceMediaIdTrimmed =
    typeof input.replaceMediaId === 'string' ? input.replaceMediaId.trim() : '';
  if (mode === 'replace' && replaceMediaIdTrimmed.length === 0) {
    throw new Error('importAudio: replaceMediaId is required when importMode is replace');
  }
  const mediaRows = await db.dexie.media_items.where('textId').equals(input.textId).toArray();
  const hasPlayablePayload = (row: MediaItemDocType): boolean => {
    const details = (row.details as Record<string, unknown> | undefined) ?? {};
    return (
      details.audioBlob instanceof Blob ||
      (typeof row.url === 'string' && row.url.trim().length > 0)
    );
  };
  const placeholderRows = mediaRows.filter(
    (row) =>
      isMediaItemPlaceholderRow(row) ||
      (!isAuxiliaryRecordingMediaRow(row) && !hasPlayablePayload(row)),
  );
  const timelineAcousticRows = mediaRows.filter(
    (row) =>
      !placeholderRows.some((candidate) => candidate.id === row.id) &&
      !isAuxiliaryRecordingMediaRow(row),
  );

  const refreshMediaTimelineMetadata = async (_mediaId: string) => {
    const textRow = await db.dexie.texts.get(input.textId);
    if (!textRow) return;
    const rowMeta = (textRow.metadata as Record<string, unknown> | undefined) ?? {};
    const prevLogical =
      typeof rowMeta.logicalDurationSec === 'number' && Number.isFinite(rowMeta.logicalDurationSec)
        ? rowMeta.logicalDurationSec
        : 0;
    const nextLogical = Math.max(prevLogical, input.duration);
    await db.dexie.texts.put({
      ...textRow,
      metadata: {
        ...rowMeta,
        timelineMode: 'media',
        ...(nextLogical > 0 ? { logicalDurationSec: nextLogical } : {}),
      },
      updatedAt: now,
    });
  };

  if (mode === 'replace') {
    const targetRow = mediaRows.find((r) => r.id === replaceMediaIdTrimmed);
    if (!targetRow || targetRow.textId !== input.textId) {
      throw new Error('importAudio: replaceMediaId must refer to a media item in this text');
    }
    if (!isMediaItemPlaceholderRow(targetRow)) {
      const previousDetails = (targetRow.details as Record<string, unknown> | undefined) ?? {};
      const {
        placeholder: _placeholder,
        timelineMode: _timelineMode,
        timelineKind: _timelineKind,
        audioBlob: _oldAudioBlob,
        ...remainingDetails
      } = previousDetails;
      await withTransaction(
        db,
        'rw',
        [db.dexie.media_items, db.dexie.texts],
        async () => {
          await db.dexie.media_items.put({
            id: targetRow.id,
            textId: input.textId,
            filename: input.filename,
            duration: input.duration,
            details: {
              ...remainingDetails,
              audioBlob: input.audioBlob,
              timelineKind: MEDIA_TIMELINE_KIND_ACOUSTIC,
            },
            isOfflineCached: targetRow.isOfflineCached,
            ...(targetRow.accessRights ? { accessRights: targetRow.accessRights } : {}),
            createdAt: targetRow.createdAt,
          });
          await refreshMediaTimelineMetadata(targetRow.id);
        },
        { label: 'LinguisticService.importAudio.replace' },
      );
      return { mediaId: targetRow.id };
    }
  }

  const shouldPromotePlaceholders =
    placeholderRows.length > 0 &&
    ((mode === 'default' && timelineAcousticRows.length === 0) ||
      (mode === 'replace' && placeholderRows.some((p) => p.id === replaceMediaIdTrimmed)) ||
      (mode === 'add' && timelineAcousticRows.length === 0));

  let mediaId = newId('media');
  let createdAt = now;
  let mergedDetails: Record<string, unknown> = {};
  let accessRights: MediaItemDocType['accessRights'] | undefined;
  let isOfflineCached = true;

  if (shouldPromotePlaceholders) {
    let primaryPlaceholder: MediaItemDocType;
    if (mode === 'replace' && placeholderRows.some((p) => p.id === replaceMediaIdTrimmed)) {
      primaryPlaceholder = placeholderRows.find((p) => p.id === replaceMediaIdTrimmed)!;
    } else {
      const placeholderCounts = await Promise.all(
        placeholderRows.map(async (row) => ({
          row,
          count: await LayerSegmentQueryService.countUnitsByMediaId(row.id),
        })),
      );
      placeholderCounts.sort((a, b) => b.count - a.count);
      primaryPlaceholder = placeholderCounts[0]?.row ?? placeholderRows[0]!;
    }
    mediaId = primaryPlaceholder.id;
    createdAt = primaryPlaceholder.createdAt;
    accessRights = primaryPlaceholder.accessRights;
    isOfflineCached = primaryPlaceholder.isOfflineCached;
    const previousDetails =
      (primaryPlaceholder.details as Record<string, unknown> | undefined) ?? {};
    const {
      placeholder: _placeholder,
      timelineMode: _timelineMode,
      timelineKind: _timelineKind,
      audioBlob: _oldAudioBlob,
      ...remainingDetails
    } = previousDetails;
    mergedDetails = remainingDetails;

    const stalePlaceholderIds = placeholderRows
      .filter((row) => row.id !== mediaId)
      .map((row) => row.id);
    if (stalePlaceholderIds.length > 0) {
      const staleUnits = await LayerSegmentQueryService.listUnitsByMediaIds(stalePlaceholderIds);
      if (staleUnits.length > 0) {
        await LayerUnitSegmentWriteService.reassignUnitsToMediaId(db, staleUnits, mediaId, now);
      }
      await db.dexie.media_items.bulkDelete(stalePlaceholderIds);
    }
  }

  await withTransaction(
    db,
    'rw',
    [db.dexie.media_items, db.dexie.texts, db.dexie.layer_units, db.dexie.anchors],
    async () => {
      await db.dexie.media_items.put({
        id: mediaId,
        textId: input.textId,
        filename: input.filename,
        duration: input.duration,
        details: {
          ...mergedDetails,
          audioBlob: input.audioBlob,
          timelineKind: MEDIA_TIMELINE_KIND_ACOUSTIC,
        },
        isOfflineCached,
        ...(accessRights ? { accessRights } : {}),
        createdAt,
      });

      let remapResult = { didRemap: false, maxUnitEnd: 0 };
      if (shouldPromotePlaceholders) {
        remapResult = await remapLayerUnitsAndAnchorsForFirstAcousticImport({
          db,
          textId: input.textId,
          mediaId,
          acousticDurationSec: input.duration,
          now,
        });
      }

      const textRowAfterPut = await db.dexie.texts.get(input.textId);
      if (textRowAfterPut) {
        const rowMetaAfter =
          (textRowAfterPut.metadata as Record<string, unknown> | undefined) ?? {};
        const prevLogicalAfter =
          typeof rowMetaAfter.logicalDurationSec === 'number' &&
          Number.isFinite(rowMetaAfter.logicalDurationSec)
            ? rowMetaAfter.logicalDurationSec
            : 0;
        const nextLogicalAfter = remapResult.didRemap
          ? Math.max(input.duration, remapResult.maxUnitEnd, 1)
          : Math.max(prevLogicalAfter, input.duration);
        await db.dexie.texts.put({
          ...textRowAfterPut,
          metadata: {
            ...rowMetaAfter,
            timelineMode: 'media',
            ...(nextLogicalAfter > 0 ? { logicalDurationSec: nextLogicalAfter } : {}),
          },
          updatedAt: now,
        });
      }
    },
    { label: 'LinguisticService.importAudio' },
  );

  return { mediaId };
}

export async function createPlaceholderMedia(input: {
  textId: string;
  duration?: number;
  filename?: string;
}): Promise<MediaItemDocType> {
  const db = await getDb();
  const now = new Date().toISOString();
  const mediaId = newId('media');
  const duration =
    Number.isFinite(input.duration) && (input.duration ?? 0) > 0
      ? (input.duration as number)
      : 1800;
  const filename = input.filename?.trim() || 'document-placeholder.track';

  const mediaItem: MediaItemDocType = {
    id: mediaId,
    textId: input.textId,
    filename,
    duration,
    details: {
      placeholder: true,
      timelineMode: 'document',
      timelineKind: MEDIA_TIMELINE_KIND_PLACEHOLDER,
    },
    isOfflineCached: true,
    createdAt: now,
  };

  await db.collections.media_items.insert(mediaItem);
  return mediaItem;
}

/**
 * 显式扩展 `texts.metadata.logicalDurationSec` 至不小于给定值（ADR-0004 决策 2 选项 C，7C 最小闭环）。
 * **不**修改 `layer_units` 坐标；不缩放声学时间轴。
 */
export async function expandTextLogicalDurationToAtLeast(input: {
  textId: string;
  minLogicalDurationSec: number;
}): Promise<void> {
  const db = await getDb();
  const textRow = await db.dexie.texts.get(input.textId);
  if (!textRow) return;
  const minSec =
    Number.isFinite(input.minLogicalDurationSec) && input.minLogicalDurationSec > 0
      ? input.minLogicalDurationSec
      : 0;
  if (minSec <= 0) return;
  const rowMeta = (textRow.metadata as Record<string, unknown> | undefined) ?? {};
  const prev =
    typeof rowMeta.logicalDurationSec === 'number' && Number.isFinite(rowMeta.logicalDurationSec)
      ? rowMeta.logicalDurationSec
      : 0;
  const next = Math.max(prev, minSec);
  if (next <= prev) return;
  const now = new Date().toISOString();
  await db.dexie.texts.put({
    ...textRow,
    metadata: {
      ...rowMeta,
      logicalDurationSec: next,
    },
    updatedAt: now,
  });
}
