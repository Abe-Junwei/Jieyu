/**
 * ⚠️ READ-ONLY / NAVIGATION-ONLY — 段到宿主 unit 的时间重叠解析统一入口。
 * ⚠️ READ-ONLY / NAVIGATION-ONLY — single entry point for segment → host-unit resolution.
 *
 * 使用场景 | Allowed:
 *   - 高亮/对齐/导航/展示类场景下，需要把「没有自身字段值」的 segment 映射到其「宿主 unit」以便读取 unit 维度字段。
 *   - In read/display/navigation paths where a segment must be mapped to its host unit
 *     for display-only reading of unit-scoped columns (e.g. highlight alignment).
 *
 * ❌ 严禁使用 | Forbidden:
 *   - 任何写入路径（from-menu 写入、持久化、AI 工具调用等）不得用本模块把 segment ID 转换为 host unit ID 再写回。
 *     段层的「per-layer 字段」必须直接写 segment row（segmentsByLayer），以免跨层污染。
 *   - Never use inside a write path (menu actions, persistence, AI mutations).
 *     Per-layer fields MUST be written to the segment row — mapping to a host unit
 *     would persist the value on the shared canonical unit and leak across sibling layers
 *     (see: docs/execution/plans/父unit回退彻底治理方案-2026-04-17.md, self-certainty cross-layer
 *     contamination post-mortem).
 *
 * 调用方建议优先使用 dispatchTimelineUnitMutation(unit.kind + routing.editMode) 而不是本模块。
 * Prefer `dispatchTimelineUnitMutation` when you need `kind`-aware routing on a write path.
 */

import { createMetricTags, recordMetric } from '../observability/metrics';

export const HOST_RESOLUTION_EPS = 0.01;

export type SegmentHostCandidate = {
  id: string;
  startTime: number;
  endTime: number;
  mediaId?: string | undefined;
};

export type SegmentHostLocation = {
  startTime: number;
  endTime: number;
  mediaId?: string | undefined;
};

/**
 * 纯核心：在「一个候选组」内用「包含 → 重叠」两阶段选出最佳宿主。
 * Pure core: within a single candidate group, pick the best host by containment first,
 * then by overlap length, tie-breaking on center distance.
 */
export function selectBestHostByTimeOverlap<T extends SegmentHostCandidate>(
  candidates: ReadonlyArray<T>,
  segment: SegmentHostLocation,
): { resolved: T | undefined; overlapCount: number } {
  const segmentCenter = (segment.startTime + segment.endTime) / 2;
  let bestContaining: { unit: T; span: number; centerDistance: number } | undefined;
  let bestOverlap: { unit: T; overlap: number; centerDistance: number } | undefined;
  let overlapCount = 0;

  for (const unit of candidates) {
    if (
      unit.startTime > segment.endTime - HOST_RESOLUTION_EPS
      || unit.endTime < segment.startTime + HOST_RESOLUTION_EPS
    ) continue;
    overlapCount += 1;

    const centerDistance = Math.abs(((unit.startTime + unit.endTime) / 2) - segmentCenter);
    const contains = unit.startTime <= segment.startTime + HOST_RESOLUTION_EPS
      && unit.endTime >= segment.endTime - HOST_RESOLUTION_EPS;

    if (contains) {
      const span = unit.endTime - unit.startTime;
      if (
        !bestContaining
        || span < bestContaining.span
        || (span === bestContaining.span && centerDistance < bestContaining.centerDistance)
      ) {
        bestContaining = { unit, span, centerDistance };
      }
      continue;
    }

    const overlapStart = Math.max(segment.startTime, unit.startTime);
    const overlapEnd = Math.min(segment.endTime, unit.endTime);
    const overlap = Math.max(0, overlapEnd - overlapStart);
    if (
      !bestOverlap
      || overlap > bestOverlap.overlap
      || (overlap === bestOverlap.overlap && centerDistance < bestOverlap.centerDistance)
    ) {
      bestOverlap = { unit, overlap, centerDistance };
    }
  }

  return { resolved: bestContaining?.unit ?? bestOverlap?.unit, overlapCount };
}

export type HostMetricsConfig = {
  /** 指标模块标签；为空则不上报。 | Metrics module tag; empty disables emission. */
  metricsSource?: string | undefined;
};

/**
 * 严格同媒体策略：当 segment.mediaId 存在，仅在 mediaId 完全相等的 units 中查找。
 * Strict same-media strategy: when segment.mediaId is set, only units with the exact same
 * mediaId are considered (rows with undefined mediaId are also excluded).
 *
 * 对齐 {@link resolveFallbackOwnerUnit} 的历史语义 | Matches legacy `resolveFallbackOwnerUnit` behavior.
 */
export function resolveHostUnitStrictMedia<T extends SegmentHostCandidate>(
  segment: SegmentHostLocation,
  units: ReadonlyArray<T>,
  metrics?: HostMetricsConfig,
): T | undefined {
  const candidates = segment.mediaId
    ? units.filter((u) => u.mediaId === segment.mediaId)
    : units;
  const { resolved, overlapCount } = selectBestHostByTimeOverlap(candidates, segment);
  emitFallbackMetrics(resolved, overlapCount, metrics?.metricsSource);
  return resolved;
}

/**
 * 级联媒体策略：先同媒体，再「无 mediaId」候选，最后兜底全集。
 * Cascade strategy: same-media first, then media-agnostic rows, finally the full set.
 *
 * 对齐 {@link resolveSelfCertaintyHostUnitId} 的历史语义 | Matches legacy self-certainty behavior.
 */
export function resolveHostUnitCascadeMedia<T extends SegmentHostCandidate>(
  segment: SegmentHostLocation,
  units: ReadonlyArray<T>,
  metrics?: HostMetricsConfig,
): T | undefined {
  const normalizedMediaId = segment.mediaId?.trim() ?? '';
  if (!normalizedMediaId) {
    const { resolved, overlapCount } = selectBestHostByTimeOverlap(units, segment);
    emitFallbackMetrics(resolved, overlapCount, metrics?.metricsSource);
    return resolved;
  }

  const sameMedia = units.filter((u) => (u.mediaId?.trim() ?? '') === normalizedMediaId);
  const mediaAgnostic = units.filter((u) => (u.mediaId?.trim() ?? '') === '');

  for (const group of [sameMedia, mediaAgnostic, units]) {
    const attempt = selectBestHostByTimeOverlap(group, segment);
    if (attempt.resolved) {
      emitFallbackMetrics(attempt.resolved, attempt.overlapCount, metrics?.metricsSource);
      return attempt.resolved;
    }
  }
  emitFallbackMetrics(undefined, 0, metrics?.metricsSource);
  return undefined;
}

function emitFallbackMetrics(
  resolved: unknown,
  overlapCount: number,
  metricsSource: string | undefined,
): void {
  if (!metricsSource) return;
  try {
    recordMetric({
      id: 'parent_fallback_attempt_total',
      value: 1,
      tags: createMetricTags(metricsSource, {
        candidateCount: overlapCount,
        resolved: Boolean(resolved),
      }),
    });
    if (overlapCount > 1) {
      recordMetric({
        id: 'parent_fallback_ambiguous_total',
        value: 1,
        tags: createMetricTags(metricsSource, { candidateCount: overlapCount }),
      });
    }
  } catch {
    // 指标失败不影响业务 | Metric failures are non-fatal.
  }
}
