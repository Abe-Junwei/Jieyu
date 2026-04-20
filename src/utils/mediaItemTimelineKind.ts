import type { MediaItemDocType } from '../db';

/** 文献/逻辑轴占位行在 `media_items.filename` 上的固定值（与 LinguisticService 写入一致）| Sentinel filename for logical-axis placeholder rows */
export const DOCUMENT_PLACEHOLDER_TRACK_FILENAME = 'document-placeholder.track';

/** 显式：逻辑轴占位行（无声学字节或删音后占位）| Explicit: logical-axis placeholder row */
export const MEDIA_TIMELINE_KIND_PLACEHOLDER = 'placeholder' as const;
/** 显式：承载声学时间线的媒体行（含 blob/url）| Explicit: row carrying acoustic timeline payload */
export const MEDIA_TIMELINE_KIND_ACOUSTIC = 'acoustic' as const;

export type MediaTimelineKind =
  | typeof MEDIA_TIMELINE_KIND_PLACEHOLDER
  | typeof MEDIA_TIMELINE_KIND_ACOUSTIC;

type MediaItemTimelineKindRow = Pick<MediaItemDocType, 'filename' | 'details'> & Partial<Pick<MediaItemDocType, 'url'>>;

const AUXILIARY_RECORDING_SOURCES = new Set([
  'translation-recording',
  'transcription-recording',
]);

function hasPlayableMediaPayload(row: MediaItemTimelineKindRow): boolean {
  const details = (row.details as Record<string, unknown> | undefined) ?? {};
  return details.audioBlob instanceof Blob
    || (typeof row.url === 'string' && row.url.trim().length > 0);
}

/**
 * 解析媒体行时间线类别；显式字段优先，缺省时按迁移规则推断。| Resolve media timeline kind; prefer the explicit field and derive only during migration.
 */
export function resolveMediaItemTimelineKind(row: MediaItemTimelineKindRow): MediaTimelineKind {
  const details = (row.details as Record<string, unknown> | undefined) ?? {};
  const kind = details.timelineKind;
  if (kind === MEDIA_TIMELINE_KIND_ACOUSTIC || kind === MEDIA_TIMELINE_KIND_PLACEHOLDER) {
    return kind;
  }
  if (hasPlayableMediaPayload(row)) {
    return MEDIA_TIMELINE_KIND_ACOUSTIC;
  }
  if (details.placeholder === true || row.filename === DOCUMENT_PLACEHOLDER_TRACK_FILENAME) {
    return MEDIA_TIMELINE_KIND_PLACEHOLDER;
  }
  if (details.timelineMode === 'document') {
    return MEDIA_TIMELINE_KIND_PLACEHOLDER;
  }
  return MEDIA_TIMELINE_KIND_ACOUSTIC;
}

/**
 * 为历史媒体行补齐显式 `details.timelineKind`，便于后续去启发式读取。| Backfill the explicit `details.timelineKind` on legacy rows so later reads stay non-heuristic.
 */
export function withResolvedMediaItemTimelineKind<T extends MediaItemTimelineKindRow>(row: T): T {
  const details = (row.details as Record<string, unknown> | undefined) ?? {};
  const timelineKind = resolveMediaItemTimelineKind(row);
  if (details.timelineKind === timelineKind) {
    return row;
  }
  return {
    ...row,
    details: {
      ...details,
      timelineKind,
    },
  } as T;
}

/**
 * 判定 `media_items` 行是否应参与「仅占位」聚类（importAudio 晋升、删音合并占位等）。
 */
export function isMediaItemPlaceholderRow(row: MediaItemTimelineKindRow): boolean {
  return resolveMediaItemTimelineKind(row) === MEDIA_TIMELINE_KIND_PLACEHOLDER;
}

/**
 * 判定媒体行是否是附属录音（用于译文/转写录音附挂），不应驱动主时间轴导入策略。
 */
export function isAuxiliaryRecordingMediaRow(row: MediaItemTimelineKindRow): boolean {
  const details = (row.details as Record<string, unknown> | undefined) ?? {};
  const source = typeof details.source === 'string' ? details.source.trim() : '';
  return AUXILIARY_RECORDING_SOURCES.has(source);
}
