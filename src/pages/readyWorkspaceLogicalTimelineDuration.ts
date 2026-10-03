import { DEFAULT_DOCUMENT_TIMELINE_EXTENT_FALLBACK_SEC } from '../utils/timelineExtentConstants';
import {
  isDefaultBlankTimelineLogical,
  maxTimedUnitEndSec,
} from '../utils/timelineLogicalDurationSync';

/** 与 `resolveTimelineExtentSec` 默认画布一致 */
const DEFAULT_DOCUMENT_LOGICAL_TIMELINE_FALLBACK_SEC =
  DEFAULT_DOCUMENT_TIMELINE_EXTENT_FALLBACK_SEC;

export type ComputeLogicalTimelineDurationForZoomOptions = {
  /**
   * 解码后的媒体秒（`player.isReady` 且 `duration>0`）。**仅**在尚无 `logicalDurationSec` 且无轨上 `endTime` 时
   * 用作 `documentSpanSec` 绿场回退；已有文献轴时传入亦不会抬高文献跨度。
   */
  acousticTimelineAnchorSec?: number;
};

/**
 * 无声学壳层：缩放/刻度用文献秒跨度。
 * 默认 1800s 空白画布在轨上已有语段时改用语段最大 `endTime`，纯文本导入不会再被压成一条线。
 * 用户另行写过的文献轴仍与语段最大 `endTime` 取 max。
 */
export function computeLogicalTimelineDurationForZoom(
  logicalDurationSecFromMapping: number | undefined,
  unitsOnCurrentMedia: ReadonlyArray<{ endTime?: number }>,
  options?: ComputeLogicalTimelineDurationForZoomOptions,
): number {
  const maxEnd = maxTimedUnitEndSec(unitsOnCurrentMedia);
  const ac = options?.acousticTimelineAnchorSec;
  if (
    typeof logicalDurationSecFromMapping === 'number' &&
    Number.isFinite(logicalDurationSecFromMapping) &&
    logicalDurationSecFromMapping > 0 &&
    isDefaultBlankTimelineLogical(logicalDurationSecFromMapping) &&
    maxEnd > 0.05
  ) {
    return maxEnd;
  }
  if (
    typeof logicalDurationSecFromMapping === 'number' &&
    Number.isFinite(logicalDurationSecFromMapping) &&
    logicalDurationSecFromMapping > 0 &&
    isDefaultBlankTimelineLogical(logicalDurationSecFromMapping) &&
    maxEnd <= 0.05 &&
    typeof ac === 'number' &&
    Number.isFinite(ac) &&
    ac > 0
  ) {
    return ac;
  }
  if (
    typeof logicalDurationSecFromMapping === 'number' &&
    Number.isFinite(logicalDurationSecFromMapping) &&
    logicalDurationSecFromMapping > 0
  ) {
    const merged = Math.max(logicalDurationSecFromMapping, maxEnd);
    return merged > 0 ? merged : DEFAULT_DOCUMENT_LOGICAL_TIMELINE_FALLBACK_SEC;
  }
  if (maxEnd > 0) return maxEnd;
  if (typeof ac === 'number' && Number.isFinite(ac) && ac > 0) {
    return ac;
  }
  return DEFAULT_DOCUMENT_LOGICAL_TIMELINE_FALLBACK_SEC;
}
