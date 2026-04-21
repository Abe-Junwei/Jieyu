/**
 * 无声学壳层：缩放/刻度用文献秒跨度（metadata 缺省时用语段最大 end 兜底）
 */
export function computeLogicalTimelineDurationForZoom(
  logicalDurationSecFromMapping: number | undefined,
  unitsOnCurrentMedia: ReadonlyArray<{ endTime?: number }>,
): number | undefined {
  if (typeof logicalDurationSecFromMapping === 'number' && Number.isFinite(logicalDurationSecFromMapping) && logicalDurationSecFromMapping > 0) {
    return logicalDurationSecFromMapping;
  }
  let maxEnd = 0;
  for (const u of unitsOnCurrentMedia) {
    maxEnd = Math.max(maxEnd, u.endTime ?? 0);
  }
  if (maxEnd > 0) return maxEnd;
  return undefined;
}
