import { DEFAULT_DOCUMENT_TIMELINE_EXTENT_FALLBACK_SEC } from '../utils/timelineExtent';

/** 与 `resolveTimelineExtentSec` 默认画布一致 */
export const DEFAULT_DOCUMENT_LOGICAL_TIMELINE_FALLBACK_SEC = DEFAULT_DOCUMENT_TIMELINE_EXTENT_FALLBACK_SEC;

export type ComputeLogicalTimelineDurationForZoomOptions = {
  /**
   * 解码后的媒体秒（`player.isReady` 且 `duration>0`）。在「无 mapping、轨上无 endTime」时取代 1800s 回退，
   * 与 `resolveTimelineExtentSec` 的 `max(声学, 文献)` 一起避免：导入短音频后仍按 30min 铺轨、100% 下仍可横向大滚。
   */
  acousticTimelineAnchorSec?: number;
};

/**
 * 无声学壳层：缩放/刻度用文献秒跨度。
 * metadata 有 `logicalDurationSec` 时仍与当前轨上 unit 最大 `endTime` 取 max，避免内容超出默认画布后视口锁死。
 */
export function computeLogicalTimelineDurationForZoom(
  logicalDurationSecFromMapping: number | undefined,
  unitsOnCurrentMedia: ReadonlyArray<{ endTime?: number }>,
  options?: ComputeLogicalTimelineDurationForZoomOptions,
): number {
  let maxEnd = 0;
  for (const u of unitsOnCurrentMedia) {
    maxEnd = Math.max(maxEnd, u.endTime ?? 0);
  }
  if (typeof logicalDurationSecFromMapping === 'number' && Number.isFinite(logicalDurationSecFromMapping) && logicalDurationSecFromMapping > 0) {
    const merged = Math.max(logicalDurationSecFromMapping, maxEnd);
    return merged > 0 ? merged : DEFAULT_DOCUMENT_LOGICAL_TIMELINE_FALLBACK_SEC;
  }
  if (maxEnd > 0) return maxEnd;
  const ac = options?.acousticTimelineAnchorSec;
  if (typeof ac === 'number' && Number.isFinite(ac) && ac > 0) {
    return ac;
  }
  return DEFAULT_DOCUMENT_LOGICAL_TIMELINE_FALLBACK_SEC;
}
