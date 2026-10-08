import { getDb, withTransaction, type MediaItemDocType } from '../db';
import { newId } from '../utils/transcriptionFormatters';
import {
  isAuxiliaryRecordingMediaRow,
  isMediaItemPlaceholderRow,
  MEDIA_TIMELINE_KIND_ACOUSTIC,
  MEDIA_TIMELINE_KIND_PLACEHOLDER,
} from '../utils/mediaItemTimelineKind';
import { remapLayerUnitsAndAnchorsForFirstAcousticImport } from '../utils/remapLayerUnitsForFirstAcousticImport';
import {
  maxTimedUnitEndSec,
  resolveLogicalDurationAfterAcousticImport,
} from '../utils/timelineLogicalDurationSync';
import { LayerSegmentQueryService } from './LayerSegmentQueryService';

/**
 * 项目里有多条占位时间轴、调用方又没有指定要挂接哪一条时抛出；不会自动合并任何占位轴。
 * Thrown when several placeholder timelines exist and the caller did not pick one; nothing is merged.
 */
export class AudioImportPlaceholderSelectionRequiredError extends Error {
  readonly candidateMediaIds: readonly string[];

  constructor(candidateMediaIds: readonly string[]) {
    super(
      `importAudio: ${candidateMediaIds.length} placeholder timelines exist; pass importMode 'replace' with replaceMediaId to choose one`,
    );
    this.name = 'AudioImportPlaceholderSelectionRequiredError';
    this.candidateMediaIds = candidateMediaIds;
  }
}

export async function importAudio(input: {
  textId: string;
  audioBlob: Blob;
  filename: string;
  duration: number;
  /**
   * `default`：没有声学轨且恰好一条占位轴时晋升这条占位；有多条占位时必须用 `replace` 指定，否则抛出
   *   `AudioImportPlaceholderSelectionRequiredError`；已存在声学轨（含缺音的声学轨）则新建 `mediaId`。
   * `replace`：覆盖 `replaceMediaId` 指向的行（声学就地换源，或显式晋升这一条占位）。
   * `add`：总是新增一条媒体轨；仅当没有声学轨且恰好一条占位时晋升这条占位。
   * 任何模式都不会合并、删除其他占位轴或其他录音（rev5 §4.2-11）。
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
  // 缺音的声学行（无字节，但 timelineKind 为 acoustic）不是占位行，不参与晋升。
  // Acoustic rows whose bytes are missing are not placeholders and are never promoted.
  const placeholderRows = mediaRows.filter((row) => isMediaItemPlaceholderRow(row));
  const timelineAcousticRows = mediaRows.filter(
    (row) =>
      !placeholderRows.some((candidate) => candidate.id === row.id) &&
      !isAuxiliaryRecordingMediaRow(row),
  );

  const refreshMediaTimelineMetadata = async (mediaIdForUnits: string) => {
    const textRow = await db.dexie.texts.get(input.textId);
    if (!textRow) return;
    const rowMeta = (textRow.metadata as Record<string, unknown> | undefined) ?? {};
    const prevLogical =
      typeof rowMeta.logicalDurationSec === 'number' && Number.isFinite(rowMeta.logicalDurationSec)
        ? rowMeta.logicalDurationSec
        : 0;
    const relatedUnits = await LayerSegmentQueryService.listUnitsByMediaId(mediaIdForUnits);
    const maxUnitEnd = maxTimedUnitEndSec(relatedUnits);
    const nextLogical = resolveLogicalDurationAfterAcousticImport({
      prevLogicalSec: prevLogical,
      acousticDurationSec: input.duration,
      maxUnitEndSec: maxUnitEnd,
      didRemap: false,
    });
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
        { label: 'LinguisticService.media.importAudio.replace' },
      );
      return { mediaId: targetRow.id };
    }
  }

  let primaryPlaceholder: MediaItemDocType | undefined;
  if (mode === 'replace') {
    primaryPlaceholder = placeholderRows.find((p) => p.id === replaceMediaIdTrimmed);
  } else if (timelineAcousticRows.length === 0 && placeholderRows.length === 1) {
    primaryPlaceholder = placeholderRows[0];
  } else if (
    mode === 'default' &&
    timelineAcousticRows.length === 0 &&
    placeholderRows.length > 1
  ) {
    throw new AudioImportPlaceholderSelectionRequiredError(placeholderRows.map((row) => row.id));
  }
  const shouldPromotePlaceholders = primaryPlaceholder !== undefined;

  let mediaId = newId('media');
  let createdAt = now;
  let mergedDetails: Record<string, unknown> = {};
  let accessRights: MediaItemDocType['accessRights'] | undefined;
  let isOfflineCached = true;

  if (primaryPlaceholder) {
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
        const nextLogicalAfter = resolveLogicalDurationAfterAcousticImport({
          prevLogicalSec: prevLogicalAfter,
          acousticDurationSec: input.duration,
          maxUnitEndSec: remapResult.maxUnitEnd,
          didRemap: remapResult.didRemap,
        });
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
    { label: 'LinguisticService.media.importAudio' },
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

/** 空白时间轴导入时写入 `logicalDurationSec`（可小于既有默认 1800s）。 */
export async function setTextLogicalDurationSec(input: {
  textId: string;
  logicalDurationSec: number;
}): Promise<void> {
  const db = await getDb();
  const textRow = await db.dexie.texts.get(input.textId);
  if (!textRow) return;
  const nextSec =
    Number.isFinite(input.logicalDurationSec) && input.logicalDurationSec > 0
      ? input.logicalDurationSec
      : 0;
  if (nextSec <= 0) return;
  const rowMeta = (textRow.metadata as Record<string, unknown> | undefined) ?? {};
  const prev =
    typeof rowMeta.logicalDurationSec === 'number' && Number.isFinite(rowMeta.logicalDurationSec)
      ? rowMeta.logicalDurationSec
      : 0;
  if (nextSec === prev) return;
  const now = new Date().toISOString();
  await db.dexie.texts.put({
    ...textRow,
    metadata: {
      ...rowMeta,
      logicalDurationSec: nextSec,
    },
    updatedAt: now,
  });
}
