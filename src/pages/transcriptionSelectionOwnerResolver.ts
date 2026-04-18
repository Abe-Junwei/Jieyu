/**
 * 选区归属（owner）解析：将 segment（或 selection 上下文）映射回其 host unit。
 * Selection owner resolution: map a segment/selection back to its host unit.
 *
 * ⚠️ READ-ONLY / 上下文展示专用 | READ-ONLY / context-display only.
 *
 * 写入路径严禁直接使用 {@link resolveFallbackOwnerUnit}（已由 architecture-guard 强制）。
 * Write paths MUST NOT depend on the fallback branch (enforced by architecture-guard).
 *
 * 真正的时间重叠核心算法已迁至 `../utils/segmentHostResolution`，本文件仅作为
 * 带指标 + 显式 owner 先行的「选区策略薄壳」。
 * The actual time-overlap algorithm lives in `../utils/segmentHostResolution`; this
 * file is now a thin policy layer that adds metrics + explicit-owner-first semantics.
 */

import { resolveHostUnitStrictMedia } from '../utils/segmentHostResolution';

type TimelineOwnerCandidate = {
  id: string;
  startTime: number;
  endTime: number;
  mediaId?: string | undefined;
};

type TimelineSegmentOwnerTarget = {
  startTime: number;
  endTime: number;
  mediaId?: string | undefined;
  unitId?: string | undefined;
};

export function resolveFallbackOwnerUnit<T extends TimelineOwnerCandidate>(
  segment: TimelineSegmentOwnerTarget,
  units: ReadonlyArray<T>,
): T | undefined {
  return resolveHostUnitStrictMedia(
    {
      startTime: segment.startTime,
      endTime: segment.endTime,
      ...(segment.mediaId !== undefined ? { mediaId: segment.mediaId } : {}),
    },
    units,
    { metricsSource: 'transcriptionSelectionOwnerResolver' },
  );
}

export function resolveSegmentOwnerUnit<T extends TimelineOwnerCandidate>(
  segment: TimelineSegmentOwnerTarget,
  units: ReadonlyArray<T>,
): T | undefined {
  const explicitOwnerId = segment.unitId?.trim();
  if (explicitOwnerId) {
    const explicit = units.find((item) => item.id === explicitOwnerId);
    if (explicit) return explicit;
  }
  return resolveFallbackOwnerUnit(segment, units);
}
