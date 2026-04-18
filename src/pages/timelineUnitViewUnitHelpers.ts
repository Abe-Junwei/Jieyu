/**
 * ⚠️ READ-ONLY / NAVIGATION-ONLY helpers — timeline-view based segment → host-unit lookup.
 *
 * 这些 helper 从 TimelineUnitView（统一行视图）取出对应的 host unit id/doc。
 * 尽管早期命名里带 "Speaker" / "SpeakerTarget"，它们实际是「通用的 kind-无关 segment→host」
 * 解析器，只在以下场景使用：
 *   - 读模型：展示 unit 维度字段（speaker、unit-intrinsic 数据）；
 *   - 结构性操作：split / merge / delete 真正需要 parent unit 的情况（见 findParentUnitXxx）。
 *
 * ❌ 严禁用途：写入段层 per-layer 字段（selfCertainty、status、provenance、per-layer notes…）
 *    之前把 segment ID 映射成 host unit ID 再写回——那会让同一 host unit 被多层共享的
 *    sibling segments 同时读到被污染值。per-layer 字段只能写 segment row。
 *    详见 docs/execution/plans/父unit回退彻底治理方案-2026-04-17.md 与 self-certainty 串层 post-mortem。
 *
 * ⚠️ READ-ONLY: Never use these helpers to re-route writes. Per-layer fields belong to the
 *   segment row, not the shared canonical unit. Use `dispatchTimelineUnitMutation` for writes.
 */

import type { TimelineUnitView } from '../hooks/timelineUnitView';

/** Resolve backing unit doc for speaker/batch/AI tools from a unified row view. */
export function unitDocForSpeakerTargetFromUnitView<T extends { id: string }>(
  view: TimelineUnitView | null | undefined,
  getUnitDocById: (id: string) => T | undefined,
): T | null {
  if (!view) return null;
  if (view.kind === 'unit') return getUnitDocById(view.id) ?? null;
  const pid = view.parentUnitId?.trim();
  return pid ? getUnitDocById(pid) ?? null : null;
}

/**
 * READ-ONLY navigation helper: 从 timeline view 把一个 row id 归并到其「宿主 unit id」。
 *   - kind === 'unit'    → 返回自身 id
 *   - kind === 'segment' → 返回 `parentUnitId`
 *
 * ⚠️ 仅用于 speaker / batch / AI 等「作用在 unit 维度」的读路径。
 * ⚠️ 不得用于 per-layer 字段的 write path：如果你发现自己在写入前调用它，
 *   说明你该改用 `dispatchTimelineUnitMutation` + 段层原子写。
 */
export function resolveHostUnitIdForTimelineView(
  unitId: string,
  unitViewById: ReadonlyMap<string, TimelineUnitView>,
  resolveUnitViewById?: (unitId: string) => TimelineUnitView | undefined,
): string | undefined {
  const view = resolveUnitViewById?.(unitId) ?? unitViewById.get(unitId);
  if (!view) return undefined;
  if (view.kind === 'unit') return view.id;
  return view.parentUnitId?.trim() || undefined;
}

/**
 * @deprecated 名字会产生「只跟 speaker 相关」的误导，请改用
 *   {@link resolveHostUnitIdForTimelineView}。保留别名避免一次性大规模改动；
 *   新代码禁止引用该别名（architecture-guard 覆盖）。
 */
export const resolveSpeakerTargetUnitIdFromUnitId = resolveHostUnitIdForTimelineView;

export function unitUnitsOnMedia(units: ReadonlyArray<TimelineUnitView>): TimelineUnitView[] {
  return units.filter((u) => u.kind === 'unit');
}

export function findUnitUnitById(
  units: ReadonlyArray<TimelineUnitView>,
  id: string,
): TimelineUnitView | undefined {
  const row = units.find((x) => x.id === id);
  return row?.kind === 'unit' ? row : undefined;
}

/** Time-subdivision: parent by `parentUnitId` or containment of segment bounds. */
export function findParentUnitUnitForSegment(
  units: ReadonlyArray<TimelineUnitView>,
  segment: { parentUnitId?: string; startTime: number; endTime: number },
): TimelineUnitView | undefined {
  if (segment.parentUnitId) {
    return findUnitUnitById(units, segment.parentUnitId);
  }
  return unitUnitsOnMedia(units).find(
    (u) => u.startTime <= segment.startTime + 0.01 && u.endTime >= segment.endTime - 0.01,
  );
}

/** Subdivision: unit that fully contains [innerStart, innerEnd]. */
export function findUnitContainingTimeRange(
  units: ReadonlyArray<TimelineUnitView>,
  innerStart: number,
  innerEnd: number,
): TimelineUnitView | undefined {
  return unitUnitsOnMedia(units).find(
    (u) => u.startTime <= innerStart + 0.01 && u.endTime >= innerEnd - 0.01,
  );
}

/** Independent segment: any unit overlapping the range (open interval tolerance). */
export function findOverlappingUnitUnit(
  units: ReadonlyArray<TimelineUnitView>,
  rangeStart: number,
  rangeEnd: number,
): TimelineUnitView | undefined {
  return unitUnitsOnMedia(units).find(
    (u) => u.startTime <= rangeEnd - 0.01 && u.endTime >= rangeStart + 0.01,
  );
}

export type ParentUnitBounds = {
  id: string;
  startTime: number;
  endTime: number;
  speakerId?: string | undefined;
};

/** Batch merge: shared parent id wins; else unit containing [first.start, last.end]. */
export function findParentUnitForMergedSegmentRange(
  units: ReadonlyArray<TimelineUnitView>,
  firstSegment: { parentUnitId?: string; startTime: number },
  lastSegment: { parentUnitId?: string; endTime: number },
): TimelineUnitView | undefined {
  if (
    firstSegment.parentUnitId
    && firstSegment.parentUnitId === lastSegment.parentUnitId
  ) {
    return findUnitUnitById(units, firstSegment.parentUnitId);
  }
  return unitUnitsOnMedia(units).find(
    (u) => u.startTime <= firstSegment.startTime + 0.01 && u.endTime >= lastSegment.endTime - 0.01,
  );
}
