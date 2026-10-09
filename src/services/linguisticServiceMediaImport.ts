import type { Table } from 'dexie';
import { getDb, withTransaction, type MediaItemDocType } from '../db';
import { patchProjectMetadata } from './projectMetadataPatch';
import { newId } from '../utils/transcriptionFormatters';
import { computeBlobSha256 } from '../utils/blobSha256';
import {
  DOCUMENT_PLACEHOLDER_TRACK_FILENAME,
  isAuxiliaryRecordingMediaRow,
  isMediaItemPlaceholderRow,
  managedAcousticMediaState,
  placeholderMediaState,
} from '../utils/mediaItemState';
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

/**
 * Relink 时新字节与记录的 `contentSha256` 不一致，且调用方没有确认时抛出；数据库不变。
 * Thrown when relinked bytes do not match the recorded `contentSha256` and the caller has not
 * acknowledged it; nothing is written (rev5 T20).
 */
export class MediaContentMismatchError extends Error {
  readonly mediaId: string;
  readonly expectedSha256: string;
  readonly actualSha256: string;

  constructor(mediaId: string, expectedSha256: string, actualSha256: string) {
    super(
      `relinkMedia: bytes for ${mediaId} do not match the recorded content (expected sha256 ${expectedSha256.slice(0, 12)}…, got ${actualSha256.slice(0, 12)}…)`,
    );
    this.name = 'MediaContentMismatchError';
    this.mediaId = mediaId;
    this.expectedSha256 = expectedSha256;
    this.actualSha256 = actualSha256;
  }
}

function stripStateDetails(details: Record<string, unknown> | undefined): Record<string, unknown> {
  const {
    placeholder: _placeholder,
    timelineMode: _timelineMode,
    timelineKind: _timelineKind,
    audioBlob: _oldAudioBlob,
    ...remainingDetails
  } = details ?? {};
  return remainingDetails;
}

function assertRelinkTarget(
  row: MediaItemDocType,
  contentSha256: string | undefined,
  acknowledged: boolean,
): void {
  if (row.timelineKind !== 'acoustic') {
    throw new Error('relinkMedia: only acoustic recordings can be relinked');
  }
  if (
    row.contentSha256 !== undefined &&
    contentSha256 !== undefined &&
    row.contentSha256 !== contentSha256 &&
    !acknowledged
  ) {
    throw new MediaContentMismatchError(row.id, row.contentSha256, contentSha256);
  }
}

/**
 * Relink：给一条缺音的声学录音挂回字节。ID、原名和句段时间都不变；
 * 新字节与已记录的 `contentSha256` 不符时，未确认就抛 `MediaContentMismatchError`。
 * Relink: reattach bytes to an acoustic recording whose bytes are missing. Keeps the id, the
 * original name and every unit time; throws `MediaContentMismatchError` on a sha256 mismatch
 * unless acknowledged (rev5 §4.2-10, T20).
 */
export async function relinkMedia(input: {
  mediaId: string;
  audioBlob: Blob;
  duration?: number;
  acknowledgeContentMismatch?: boolean;
  /** 同一事务内的附加写入（只能做 IDB 操作）| Extra writes in the same transaction (IDB only) */
  afterWrite?: {
    tables: readonly Table<any, any>[];
    run: () => Promise<void>;
  };
}): Promise<{ mediaId: string }> {
  const db = await getDb();
  // 哈希在事务外先算好（rev5 §4.2-3）| Hash outside the transaction
  const contentSha256 = await computeBlobSha256(input.audioBlob);
  const row = await db.dexie.media_items.get(input.mediaId);
  if (!row) throw new Error(`relinkMedia: media ${input.mediaId} not found`);
  // 事务前先快速失败；事务内还会再检查一次 | Fail fast before the tx; checked again inside it
  assertRelinkTarget(row, contentSha256, input.acknowledgeContentMismatch === true);
  try {
    await withTransaction(
      db,
      'rw',
      [db.dexie.media_items, ...(input.afterWrite?.tables ?? [])],
      async () => {
        const current = await db.dexie.media_items.get(input.mediaId);
        if (!current) throw new Error(`relinkMedia: media ${input.mediaId} disappeared`);
        // JY-19：在事务内对最新行再比一次 sha（防 TOCTOU）| Re-check sha on the row read in the tx
        assertRelinkTarget(current, contentSha256, input.acknowledgeContentMismatch === true);
        await db.dexie.media_items.put({
          ...current,
          ...(typeof input.duration === 'number' &&
          Number.isFinite(input.duration) &&
          input.duration > 0
            ? { duration: input.duration }
            : {}),
          details: { ...stripStateDetails(current.details), audioBlob: input.audioBlob },
          ...managedAcousticMediaState(input.audioBlob, contentSha256),
        });
        if (input.afterWrite) await input.afterWrite.run();
      },
      { label: 'LinguisticService.media.relink' },
    );
  } catch (error) {
    // 事务内的 sha 不符保持原类型，界面才能弹确认 | Keep the typed mismatch so the UI can ask
    const cause = error instanceof Error ? (error as Error & { cause?: unknown }).cause : undefined;
    if (cause instanceof MediaContentMismatchError) throw cause;
    throw error;
  }
  return { mediaId: input.mediaId };
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
  /** 替换目标是缺音录音（即 Relink）且 sha256 不符时，用户已确认继续 | User confirmed a relink sha256 mismatch */
  acknowledgeContentMismatch?: boolean;
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
    if (!isMediaItemPlaceholderRow(targetRow) && targetRow.availability === 'missing') {
      // 缺音录音的替换就是 Relink：保留 ID 与原名 | Replacing a missing recording is a relink
      await relinkMedia({
        mediaId: targetRow.id,
        audioBlob: input.audioBlob,
        duration: input.duration,
        ...(input.acknowledgeContentMismatch === true ? { acknowledgeContentMismatch: true } : {}),
        afterWrite: {
          tables: [db.dexie.texts, db.dexie.layer_units],
          run: () => refreshMediaTimelineMetadata(targetRow.id),
        },
      });
      return { mediaId: targetRow.id };
    }
    if (!isMediaItemPlaceholderRow(targetRow)) {
      const contentSha256 = await computeBlobSha256(input.audioBlob);
      await withTransaction(
        db,
        'rw',
        [db.dexie.media_items, db.dexie.texts],
        async () => {
          // JY-19：以原行为底（以后新增的字段不会被悄悄清掉），只去掉描述旧字节的字段
          // JY-19: start from the original row (future fields survive); drop only the fields that
          // describe the old bytes
          const current = (await db.dexie.media_items.get(targetRow.id)) ?? targetRow;
          const {
            url: _oldUrl,
            contentSha256: _oldSha256,
            contentSize: _oldSize,
            ...kept
          } = current;
          await db.dexie.media_items.put({
            ...kept,
            id: targetRow.id,
            textId: input.textId,
            filename: input.filename,
            duration: input.duration,
            details: {
              ...stripStateDetails(current.details),
              audioBlob: input.audioBlob,
            },
            ...managedAcousticMediaState(input.audioBlob, contentSha256),
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
    mergedDetails = stripStateDetails(primaryPlaceholder.details);
  }
  // 哈希在事务外先算好（rev5 §4.2-3）| Hash outside the transaction
  const contentSha256 = await computeBlobSha256(input.audioBlob);

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
        },
        isOfflineCached,
        ...(accessRights ? { accessRights } : {}),
        createdAt,
        ...managedAcousticMediaState(input.audioBlob, contentSha256),
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
  const filename = input.filename?.trim() || DOCUMENT_PLACEHOLDER_TRACK_FILENAME;

  const mediaItem: MediaItemDocType = {
    id: mediaId,
    textId: input.textId,
    filename,
    duration,
    details: {
      timelineMode: 'document',
    },
    isOfflineCached: true,
    createdAt: now,
    ...placeholderMediaState(),
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
  const minSec =
    Number.isFinite(input.minLogicalDurationSec) && input.minLogicalDurationSec > 0
      ? input.minLogicalDurationSec
      : 0;
  if (minSec <= 0) return;
  // 读、比较、写在同一事务里（F3）| Read, compare and write in one transaction (F3)
  await patchProjectMetadata(input.textId, (rowMeta) => {
    const prev = finiteLogicalDurationSec(rowMeta);
    const next = Math.max(prev, minSec);
    return next <= prev ? null : { ...rowMeta, logicalDurationSec: next };
  });
}

/** 空白时间轴导入时写入 `logicalDurationSec`（可小于既有默认 1800s）。 */
export async function setTextLogicalDurationSec(input: {
  textId: string;
  logicalDurationSec: number;
}): Promise<void> {
  const nextSec =
    Number.isFinite(input.logicalDurationSec) && input.logicalDurationSec > 0
      ? input.logicalDurationSec
      : 0;
  if (nextSec <= 0) return;
  await patchProjectMetadata(input.textId, (rowMeta) =>
    nextSec === finiteLogicalDurationSec(rowMeta)
      ? null
      : { ...rowMeta, logicalDurationSec: nextSec },
  );
}

function finiteLogicalDurationSec(metadata: Record<string, unknown>): number {
  return typeof metadata.logicalDurationSec === 'number' &&
    Number.isFinite(metadata.logicalDurationSec)
    ? metadata.logicalDurationSec
    : 0;
}
