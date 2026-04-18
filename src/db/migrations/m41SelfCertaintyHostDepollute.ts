/**
 * M41: Best-effort lazy migration for the self-certainty cross-layer contamination bug.
 *
 * 背景 | Motivation
 *   此前控制器会把 segment 菜单的 self-certainty 写到该 segment 的 parent unit（canonical 行）
 *   上。因 canonical unit 行在多层共享，一旦它持有 per-layer 字段，旁层/邻段读时 fallback 就
 *   "继承"到这个值，表现为串层污染（详见 self-certainty 根因 post-mortem +
 *   docs/execution/plans/父unit回退彻底治理方案-2026-04-17.md）。
 *
 *   新语义下写/读都不走 host，历史写入的 canonical 行 self-certainty 会对前端"消失"。本迁移
 *   只做 additive 的抢救：在能唯一消歧的场景下把 host 上的值下刷到唯一对应的 segment 行，
 *   不会覆盖已有 segment 值、不会删除 host 上的任何字段。
 *
 *   Previously the controller wrote segment menu self-certainty onto the shared canonical unit
 *   row. This migration performs an additive, best-effort down-flush of each canonical unit's
 *   selfCertainty to unambiguous child segments, restoring user data hidden by the behavior flip.
 *
 * 规则 | Rules
 *   对每个 layer_units 行 H（unitType === 'unit' 且 H.selfCertainty 有值）：
 *     1) S = 指向 H 作为 parentUnitId 的所有段行（unitType === 'segment'）。
 *     2) 若 S 为空 → 认为 H.selfCertainty 是 unit-intrinsic / unit-kind 层值，不动。
 *     3) 否则按 layerId 分组；对每个层仅持有"唯一一个段且该段自己没有 selfCertainty"的情形，
 *        把 H.selfCertainty 复制到那个段行。其他（一层内多段共享 H、或段已有自己的值）一律跳过。
 *     4) 本迁移不修改、不清除 H 本身的 selfCertainty——避免破坏 H 作为自己层 unit-kind 显示时的值。
 *
 *   For each canonical unit row H with selfCertainty:
 *     - gather its referring segment rows (by parentUnitId)
 *     - for each layer with exactly one such segment AND no pre-existing segment selfCertainty,
 *       copy H.selfCertainty onto that segment row
 *     - never overwrite existing segment values; never mutate H
 *
 * Idempotency
 *   后续再跑本迁移时，段行已有值的分支会短路——幂等。
 *   Re-running is a no-op because touched segments already carry selfCertainty.
 */
import type { Transaction } from 'dexie';
import type { LayerUnitDocType } from '../types';

export type M41Outcome = {
  scannedCanonicalUnits: number;
  touchedSegments: number;
  skippedAmbiguousLayerGroups: number;
  skippedPreExistingSegmentCertainty: number;
};

export async function upgradeM41SelfCertaintyHostDepollute(
  tx: Transaction,
): Promise<M41Outcome> {
  const outcome: M41Outcome = {
    scannedCanonicalUnits: 0,
    touchedSegments: 0,
    skippedAmbiguousLayerGroups: 0,
    skippedPreExistingSegmentCertainty: 0,
  };

  const layerUnitsTable = tx.table<LayerUnitDocType>('layer_units');
  if (!layerUnitsTable) return outcome;

  const allRows = await layerUnitsTable.toArray();
  if (allRows.length === 0) return outcome;

  /*
   * Index segment rows by parentUnitId → layerId → rows.
   * 段行按 parentUnitId+layerId 索引；判断"某 host 在某层恰好有 1 个段引用"时 O(1) 查。
   */
  const segmentsByParentByLayer = new Map<string, Map<string, LayerUnitDocType[]>>();
  for (const row of allRows) {
    if (row.unitType !== 'segment') continue;
    const parentId = typeof row.parentUnitId === 'string' ? row.parentUnitId.trim() : '';
    const layerId = typeof row.layerId === 'string' ? row.layerId.trim() : '';
    if (!parentId || !layerId) continue;
    let byLayer = segmentsByParentByLayer.get(parentId);
    if (!byLayer) {
      byLayer = new Map();
      segmentsByParentByLayer.set(parentId, byLayer);
    }
    const bucket = byLayer.get(layerId) ?? [];
    bucket.push(row);
    byLayer.set(layerId, bucket);
  }

  const toPut: LayerUnitDocType[] = [];
  const nowIso = new Date().toISOString();

  for (const host of allRows) {
    if (host.unitType === 'segment') continue;
    if (!host.selfCertainty) continue;
    outcome.scannedCanonicalUnits += 1;

    const byLayer = segmentsByParentByLayer.get(host.id);
    if (!byLayer || byLayer.size === 0) continue;

    for (const [, segments] of byLayer) {
      if (segments.length !== 1) {
        outcome.skippedAmbiguousLayerGroups += 1;
        continue;
      }
      const target = segments[0];
      if (!target) continue;
      if (target.selfCertainty !== undefined) {
        outcome.skippedPreExistingSegmentCertainty += 1;
        continue;
      }
      toPut.push({
        ...target,
        selfCertainty: host.selfCertainty,
        updatedAt: nowIso,
      });
      outcome.touchedSegments += 1;
    }
  }

  if (toPut.length > 0) {
    await layerUnitsTable.bulkPut(toPut);
  }

  return outcome;
}
