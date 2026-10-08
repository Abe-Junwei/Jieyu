import type { MediaItemDocType } from '../db';

/**
 * 媒体行状态字段（rev5 §4.1，切片 2B-C）| Media row state fields (rev5 §4.1, slice 2B-C)
 *
 * `timelineKind`、`byteLocation`、`availability` 是必填字段，由统一写入校验强制；读取方只读字段，
 * 不再根据文件名、`details.placeholder` 或是否有字节去推断。
 * The three state fields are required and enforced by the unified write validation; readers only
 * read the fields and never infer them from the filename, `details.placeholder` or byte presence.
 */

/** 占位时间轴默认文件名（仅用于显示与新建）| Default filename for new placeholder timelines (display only) */
export const DOCUMENT_PLACEHOLDER_TRACK_FILENAME = 'document-placeholder.track';

export type MediaItemStateFields = Pick<
  MediaItemDocType,
  'timelineKind' | 'byteLocation' | 'availability'
> &
  Partial<Pick<MediaItemDocType, 'contentSize' | 'contentSha256'>>;

/** 占位时间轴：没有字节 | Placeholder timeline: no bytes */
export function placeholderMediaState(): MediaItemStateFields {
  return { timelineKind: 'placeholder', byteLocation: 'none', availability: 'missing' };
}

/**
 * 声学录音、字节由本机管理 | Acoustic recording whose bytes are managed locally.
 * `contentSha256` 须在事务外算好后传入 | Compute `contentSha256` outside the transaction.
 */
export function managedAcousticMediaState(
  blob: Blob,
  contentSha256?: string,
): MediaItemStateFields {
  return {
    timelineKind: 'acoustic',
    byteLocation: 'managed',
    availability: 'available',
    contentSize: blob.size,
    ...(contentSha256 !== undefined ? { contentSha256 } : {}),
  };
}

/**
 * 缺音的声学录音（删除字节后、或入站未带字节且本机没有）；保留已知的内容指纹。
 * Acoustic recording without bytes (after deleting bytes, or inbound omitted with no local copy);
 * keeps any known content fingerprint.
 */
export function missingAcousticMediaState(
  known?: Partial<Pick<MediaItemDocType, 'contentSize' | 'contentSha256'>>,
): MediaItemStateFields {
  return {
    timelineKind: 'acoustic',
    byteLocation: 'none',
    availability: 'missing',
    ...(known?.contentSize !== undefined ? { contentSize: known.contentSize } : {}),
    ...(known?.contentSha256 !== undefined ? { contentSha256: known.contentSha256 } : {}),
  };
}

/** 是否占位时间轴（只读字段）| Whether the row is a placeholder timeline (field read only) */
export function isMediaItemPlaceholderRow(row: Pick<MediaItemDocType, 'timelineKind'>): boolean {
  return row.timelineKind === 'placeholder';
}

/** 声学录音但字节缺失 | Acoustic recording whose bytes are missing */
export function isMediaItemBytesMissing(
  row: Pick<MediaItemDocType, 'timelineKind' | 'availability'>,
): boolean {
  return row.timelineKind === 'acoustic' && row.availability === 'missing';
}

const AUXILIARY_RECORDING_SOURCES = new Set(['translation-recording', 'transcription-recording']);

/**
 * 判定媒体行是否是附属录音（用于译文/转写录音附挂），不应驱动主时间轴导入策略。
 * Auxiliary recordings (translation/transcription voice notes) never drive the main timeline.
 */
export function isAuxiliaryRecordingMediaRow(row: Pick<MediaItemDocType, 'details'>): boolean {
  const details = (row.details as Record<string, unknown> | undefined) ?? {};
  const source = typeof details.source === 'string' ? details.source.trim() : '';
  return AUXILIARY_RECORDING_SOURCES.has(source);
}
