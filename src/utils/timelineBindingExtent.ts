import { DEFAULT_DOCUMENT_TIMELINE_EXTENT_FALLBACK_SEC } from './timelineExtentConstants';

export type TimelineInteropMetadata = {
  timelineMode?: 'document' | 'media';
  logicalDurationSec?: number;
  timebaseLabel?: string;
};

function normalizePositiveFinite(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return value;
}

function readPositiveLogical(metadata: Record<string, unknown> | undefined): number {
  const raw = metadata?.logicalDurationSec;
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 0;
}

export interface TimelineBindingExtentInput {
  documentSpanSec?: number;
  acousticDurationSec?: number;
  hasMediaUrl?: boolean;
  globalPlaybackReady?: boolean;
}

/**
 * 时间轴显示总跨度（秒）：文献轴与声学取 max，保证更长一侧（含更长声学）完整可见 / 可滚 / 可标尺。
 *
 * 注意：导入冻结只作用于**持久化的逻辑时长**（见 `mergeImportedTimelineMetadata` /
 * `resolveLogicalDurationAfterAudioImport`：更长声学不抬高 `logicalDurationSec`）；
 * 显示跨度不受冻结约束，否则更长声学会被钳在文献轴内（ADR-0004 修订 2026-06-26）。
 */
export function resolveTimelineBindingExtentSec(input: TimelineBindingExtentInput): number {
  const document = normalizePositiveFinite(input.documentSpanSec);
  const acoustic = normalizePositiveFinite(input.acousticDurationSec);
  const hasMedia = Boolean(input.hasMediaUrl);

  if (document > 0) {
    return hasMedia && acoustic > 0 ? Math.max(document, acoustic) : document;
  }
  if (hasMedia && acoustic > 0) {
    return acoustic;
  }
  return DEFAULT_DOCUMENT_TIMELINE_EXTENT_FALLBACK_SEC;
}

/**
 * 100% 缩放 fit 基准跨度（秒）：`max(文献, 声学)`。
 * 更长声学时一屏铺满整段波形；`documentSpanSec` / 持久化 `logicalDurationSec` 不因本函数抬高。
 */
export function resolveTimelineFitSpanSec(input: TimelineBindingExtentInput): number {
  return resolveTimelineBindingExtentSec(input);
}

export interface MergeImportedTimelineMetadataCaps {
  establishedDocumentSpanSec: number;
  establishedAcousticSec: number;
  /** 本次互操作解析出的语段最大 endTime；绿场时收紧 metadata，已确立轴时不得突破 freeze。 */
  importedUnitsMaxEndSec?: number;
}

/**
 * 互操作导入 metadata：已有轴时，更长导入方不得抬高 `logicalDurationSec`。
 */
export function mergeImportedTimelineMetadata(
  existingMetadata: Record<string, unknown> | undefined,
  imported: TimelineInteropMetadata,
  caps: MergeImportedTimelineMetadataCaps,
): Record<string, unknown> {
  const existing = existingMetadata ?? {};
  const merged: Record<string, unknown> = { ...existing, ...imported };
  const existingLogical = readPositiveLogical(existing);
  const importedLogical = readPositiveLogical(imported as Record<string, unknown>);

  if (importedLogical > 0) {
    let freezeAuthority = 0;
    if (existingLogical > 0 || caps.establishedDocumentSpanSec > 0) {
      freezeAuthority = Math.max(existingLogical, caps.establishedDocumentSpanSec);
    } else if (caps.establishedAcousticSec > 0) {
      freezeAuthority = caps.establishedAcousticSec;
    }

    let cap = importedLogical;
    if (freezeAuthority > 0) {
      cap = Math.min(cap, freezeAuthority);
    } else {
      const importedUnitsMaxEnd =
        typeof caps.importedUnitsMaxEndSec === 'number' &&
        Number.isFinite(caps.importedUnitsMaxEndSec) &&
        caps.importedUnitsMaxEndSec > 0
          ? caps.importedUnitsMaxEndSec
          : 0;
      if (importedUnitsMaxEnd > 0) {
        cap = Math.min(cap, importedUnitsMaxEnd);
      }
    }

    if (cap < importedLogical) {
      merged.logicalDurationSec = cap;
    }
  } else if (existingLogical > 0) {
    merged.logicalDurationSec = existingLogical;
  }

  return merged;
}
