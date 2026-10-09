import { liveQuery } from 'dexie';
import { getDb, withTransaction, type SourceRecordDocType } from '../db';
import { isAuxiliaryRecordingMediaRow, isMediaItemPlaceholderRow } from '../utils/mediaItemState';
import {
  audioDisplayName,
  linkManuscriptsToAudio,
  sourceFileFromRecord,
  syntheticManuscriptId,
  type ProjectAudioFile,
  type ProjectFileView,
  type ProjectSourceFile,
} from '../utils/projectSourceFiles';
import {
  SourceProjectNotFoundError,
  linkSourceRecordToMedia,
  listSourceRecords,
  registerImportedSource,
  renameSourceRecord,
} from './sourceRecordService';

/** 来源列表读 `source_records`（rev5 4.1，切片 2B-D）| Sources come from `source_records` (slice 2B-D) */
export async function listProjectSourceFiles(textId: string): Promise<ProjectSourceFile[]> {
  return (await listSourceRecords(textId)).map(sourceFileFromRecord);
}

export async function listProjectAudioFiles(textId: string): Promise<ProjectAudioFile[]> {
  const db = await getDb();
  const rows = await db.dexie.media_items.where('textId').equals(textId).toArray();
  return rows
    .filter((row) => !isMediaItemPlaceholderRow(row) && !isAuxiliaryRecordingMediaRow(row))
    .map((row) => {
      const details =
        row.details && typeof row.details === 'object'
          ? (row.details as Record<string, unknown>)
          : {};
      const duration =
        typeof row.duration === 'number' && Number.isFinite(row.duration)
          ? row.duration
          : undefined;
      return {
        id: row.id,
        filename: row.filename,
        name: audioDisplayName(row.filename, details) || row.id,
        ...(duration !== undefined ? { durationSec: duration } : {}),
      };
    });
}

export async function listProjectFileViews(textId: string): Promise<ProjectFileView[]> {
  const [audio, stored] = await Promise.all([
    listProjectAudioFiles(textId),
    listProjectSourceFiles(textId),
  ]);
  let sources = stored;
  if (sources.length === 0) {
    const db = await getDb();
    const unitCount = await withTransaction(
      db,
      'r',
      [db.dexie.layer_units],
      async () => db.dexie.layer_units.where('textId').equals(textId).count(),
      { label: 'projectFileOps.unitCount' },
    );
    if (unitCount > 0) {
      const only = audio.length === 1 ? audio[0] : undefined;
      sources = [
        {
          id: syntheticManuscriptId(textId),
          name: '',
          format: 'file',
          ...(only ? { mediaId: only.id, linkedMediaFilename: only.filename } : {}),
        },
      ];
    }
  }
  return linkManuscriptsToAudio(audio, sources);
}

/**
 * 监听项目文件清单的来源表（录音 / 来源记录 / 是否已有转写单元）。首个结果及之后每次签名变化都回调（首个结果用于补上挂载与订阅之间的写入）。
 * 导入、建项目、删媒体等路径都直接写库而不经过文件面板，这里让面板随库自动刷新，而不是靠各入口手动失效缓存。
 *
 * Observe the tables behind the project file list (media rows, source records, whether the text has
 * units). Calls `onChange` for the first emission (covers writes between mount and subscribe) and whenever the signature changes. Imports,
 * project creation and media deletion write the DB without going through the file pane, so the pane
 * follows the DB instead of relying on every entry point to invalidate its cache.
 */
export function observeProjectFileSources(textId: string, onChange: () => void): () => void {
  const normalizedTextId = textId.trim();
  if (normalizedTextId.length === 0) return () => undefined;
  let lastSignature: string | undefined;
  const subscription = liveQuery(async () => {
    const db = await getDb();
    const [mediaIds, sourceIds, unitCount] = await Promise.all([
      db.dexie.media_items.where('textId').equals(normalizedTextId).primaryKeys(),
      db.dexie.source_records.where('textId').equals(normalizedTextId).primaryKeys(),
      db.dexie.layer_units.where('textId').equals(normalizedTextId).limit(1).count(),
    ]);
    return [
      [...mediaIds].map(String).sort().join(','),
      [...sourceIds].map(String).sort().join(','),
      unitCount > 0 ? 'units' : 'no-units',
    ].join('|');
  }).subscribe({
    next: (signature) => {
      if (signature === lastSignature) return;
      lastSignature = signature;
      onChange();
    },
    error: () => undefined,
  });
  return () => subscription.unsubscribe();
}

/**
 * 登记一次导入的原始文件（UUID；见 `sourceRecordService`）。
 * Register one imported original file (UUID identity; see `sourceRecordService`).
 */
export async function rememberImportedSourceFile(input: {
  textId: string;
  name: string;
  format: string;
  bytes?: Blob;
  /** 事务内调用时传入事务外算好的哈希 | Pass a hash computed outside when called inside a transaction */
  sha256?: string;
  byteSize?: number;
  externalDocId?: string;
  mediaId?: string;
  linkedMediaFilename?: string;
}): Promise<SourceRecordDocType | undefined> {
  const name = input.name.trim();
  if (name.length === 0) return undefined;
  try {
    const { record } = await registerImportedSource({
      textId: input.textId,
      originalName: name,
      format: input.format,
      ...(input.bytes ? { bytes: input.bytes } : {}),
      ...(input.sha256 !== undefined ? { sha256: input.sha256 } : {}),
      ...(input.byteSize !== undefined ? { byteSize: input.byteSize } : {}),
      ...(input.externalDocId !== undefined ? { externalDocId: input.externalDocId } : {}),
      ...(input.mediaId !== undefined ? { mediaId: input.mediaId } : {}),
      ...(input.linkedMediaFilename !== undefined
        ? { linkedMediaFilename: input.linkedMediaFilename }
        : {}),
    });
    return record;
  } catch (error) {
    // 与旧行为一致：项目行不存在时不登记 | Same as before: nothing to register without a project row
    if (error instanceof SourceProjectNotFoundError) return undefined;
    throw error;
  }
}

export async function renameProjectAudio(mediaId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (trimmed.length === 0) return;
  const db = await getDb();
  // 读和写在同一事务里，不覆盖并发的其他修改（F3）| Read and write in one transaction (F3)
  await withTransaction(
    db,
    'rw',
    [db.dexie.media_items],
    async () => {
      const row = await db.dexie.media_items.get(mediaId);
      if (!row) return;
      const details = row.details && typeof row.details === 'object' ? row.details : {};
      await db.dexie.media_items.put({
        ...row,
        details: { ...details, displayName: trimmed },
      });
    },
    { label: 'projectFileOps.renameProjectAudio' },
  );
}

export async function renameProjectSourceFile(
  textId: string,
  fileId: string,
  name: string,
): Promise<void> {
  await renameSourceRecord(textId, fileId, name);
}

/** 手动关联 / 取消关联录音 | Manually link or unlink a recording */
export async function linkProjectSourceFileToAudio(
  textId: string,
  fileId: string,
  mediaId: string | null,
): Promise<void> {
  await linkSourceRecordToMedia(textId, fileId, mediaId);
}
