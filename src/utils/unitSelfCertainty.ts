/**
 * 语段「自我确信度」：标注者对本人转写/标注/翻译的主观把握（与 annotationStatus、provenance、模型 confidence 独立）。
 * Unit self-certainty — annotator's subjective confidence in their own work.
 *
 * ⚠️ 重要：本文件暴露的 `resolveSelfCertaintyHostUnitId(s)` 虽然命名含 "SelfCertainty"，
 *    但实际上是「通用 segment → 宿主 unit」的 READ-ONLY 导航助手，仅用于在展示/聚合路径
 *    上为无字段值的 segment 读取 host unit 级别的字段。严禁在 from-menu 写入路径上使用
 *    这些函数将 segment ID 转换为 host unit ID 后写回，否则会导致跨层污染
 *    （详见 docs/execution/plans/父unit回退彻底治理方案-2026-04-17.md 与 self-certainty 串层 post-mortem）。
 *
 * ⚠️ IMPORTANT: `resolveSelfCertaintyHostUnitId(s)` below is a *generic* segment → host-unit
 *    READ-ONLY navigation helper despite the feature-specific name. NEVER use it on write
 *    paths to re-route a segment ID onto its canonical unit — that causes cross-layer
 *    contamination for per-layer fields (selfCertainty, status, provenance, etc.).
 *
 * TODO(2026Q2): 将本文件 helper 的调用方迁移到 `./segmentHostResolution` 的
 *   `resolveHostUnitCascadeMedia` 并在一切读路径上用 dispatchTimelineUnitMutation
 *   管控写路径后，标记这些 host-id helper 为 `@deprecated`。
 */

import {
  resolveHostUnitCascadeMedia,
  type SegmentHostCandidate,
} from './segmentHostResolution';

export const UNIT_SELF_CERTAINTY_VALUES = ['not_understood', 'uncertain', 'certain'] as const;

export type UnitSelfCertainty = (typeof UNIT_SELF_CERTAINTY_VALUES)[number];

export function isUnitSelfCertainty(value: string): value is UnitSelfCertainty {
  return (UNIT_SELF_CERTAINTY_VALUES as readonly string[]).includes(value);
}

/**
 * @deprecated 请优先直接组装 `SegmentHostLocation` 并调用
 *   `resolveHostUnitCascadeMedia` / `resolveHostUnitStrictMedia`（位于 `./segmentHostResolution`）；
 *   本函数仅作为历史调用点的过渡薄壳保留。
 *   Thin shim retained for backward compatibility with legacy callers.
 *
 * READ-ONLY navigation only — never use to route writes back onto a shared host unit.
 */
export function resolveSelfCertaintyHostUnitId(
  unitId: string,
  units: ReadonlyArray<SegmentHostCandidate>,
  options?: {
    parentUnitId?: string | undefined;
    mediaId?: string | undefined;
    startTime?: number | undefined;
    endTime?: number | undefined;
  },
): string | undefined {
  const id = unitId.trim();
  const explicitParentId = options?.parentUnitId?.trim() ?? '';
  if (explicitParentId && units.some((utt) => utt.id === explicitParentId)) {
    return explicitParentId;
  }
  if (id && units.some((utt) => utt.id === id)) {
    return id;
  }

  if (typeof options?.startTime !== 'number' || typeof options?.endTime !== 'number') {
    return undefined;
  }

  return resolveHostUnitCascadeMedia(
    {
      startTime: options.startTime,
      endTime: options.endTime,
      ...(options.mediaId !== undefined ? { mediaId: options.mediaId } : {}),
    },
    units,
  )?.id;
}

/**
 * 合并多条句段时取「更保守」的确信度：
 * - 任一为「不理解」→ 不理解
 * - 否则任一为「不确定」→ 不确定
 * - 否则若同时存在「确定」与未标记（undefined）→ 不确定（未标视为信息不完整）
 * - 否则若存在「确定」→ 确定
 * - 否则（全部未标）→ 无标记
 */
export function resolveSelfCertaintyHostUnitIds(
  unitIds: Iterable<string>,
  units: ReadonlyArray<{ id: string; startTime: number; endTime: number; mediaId?: string | undefined }>,
  hintsByUnitId?: ReadonlyMap<string, {
    parentUnitId?: string | undefined;
    mediaId?: string | undefined;
    startTime?: number | undefined;
    endTime?: number | undefined;
  }>,
): string[] {
  const out = new Set<string>();
  for (const rawId of unitIds) {
    const unitId = rawId.trim();
    if (!unitId) continue;
    const hint = hintsByUnitId?.get(unitId);
    const resolved = resolveSelfCertaintyHostUnitId(unitId, units, hint);
    if (resolved) out.add(resolved);
  }
  return [...out];
}

export function mergeUnitSelfCertaintyConservative(
  values: Array<UnitSelfCertainty | undefined>,
): UnitSelfCertainty | undefined {
  if (values.length === 0) return undefined;
  const has = (tier: UnitSelfCertainty) => values.some((v) => v === tier);
  const hasUndefined = values.some((v) => v === undefined);
  if (has('not_understood')) return 'not_understood';
  if (has('uncertain')) return 'uncertain';
  if (has('certain') && hasUndefined) return 'uncertain';
  if (has('certain')) return 'certain';
  return undefined;
}
