/**
 * 单元 ID 的类型品牌 | Branded types for layer-unit row identifiers.
 *
 * 背景 | Motivation:
 *   `LayerUnitDocType.id` 同时承载「canonical unit」（`unitType === 'unit' | undefined`）
 *   与「layer-scoped segment row」（`unitType === 'segment'`）两类实体。若把段 id 当作
 *   宿主 unit id 去写 per-layer 字段（selfCertainty / status / provenance…），会把本应只
 *   属于某一层的值写到共享 host unit，被其他层的 sibling segment 读到，表现为「串层污染」。
 *   详见 self-certainty 串层 post-mortem + docs/execution/plans/父unit回退彻底治理方案-2026-04-17.md。
 *
 *   The `LayerUnitDocType.id` surface spans two distinct entities (canonical unit rows vs
 *   per-layer segment rows). Writing a per-layer field onto a canonical unit by accident
 *   leaks the value across every sibling layer that points at that host — the root cause
 *   of the self-certainty cross-layer contamination bug.
 *
 * 方案 | Strategy:
 *   用 nominal brand 给两类 id 打标，要求所有 per-layer 写入路径的签名显式接收
 *   `CanonicalUnitId[]` 或 `LayerSegmentRowId[]`（或二者的 tagged union）。
 *   运行时批量写入（`selfCertainty` / `status` / `provenance` 等）统一走
 *   `useTranscriptionUnitActions` 的 `saveUnitLayerFields`（按 Dexie 行 `unitType` 分派），
 *   避免在业务层手写 `segmentId → hostId → LinguisticService.saveUnit` 的反模式。
 *   把 segment-id → canonical-unit-id 的"悄悄转换"变成必须显式调用 `unsafeAsCanonicalUnitId`
 *   的有意行为，方便 review / 架构守卫识别。
 */

import type { LayerUnitDocType } from './types';

declare const __canonicalUnitIdBrand: unique symbol;
declare const __layerSegmentRowIdBrand: unique symbol;

/** 规范 unit 行（`unitType` 为 'unit' 或 undefined）的 id。 */
export type CanonicalUnitId = string & { readonly [__canonicalUnitIdBrand]: true };

/** 段行（`unitType === 'segment'`）的 id；per-layer 字段的合法写入目标。 */
export type LayerSegmentRowId = string & { readonly [__layerSegmentRowIdBrand]: true };

/** per-layer 字段（self-certainty / status / provenance…）写入目标的 kind-aware tagged union。 */
export type LayerUnitWriteTarget =
  | { readonly kind: 'unit'; readonly id: CanonicalUnitId }
  | { readonly kind: 'segment'; readonly id: LayerSegmentRowId };

function isSegmentRow(row: Pick<LayerUnitDocType, 'unitType'>): boolean {
  return row.unitType === 'segment';
}

/** 从已读到的 row 安全打标：若 row 是 segment 抛错。 */
export function brandCanonicalUnitIdFromRow(row: Pick<LayerUnitDocType, 'id' | 'unitType'>): CanonicalUnitId {
  if (isSegmentRow(row)) {
    throw new Error(`[unitIdBrands] expected canonical-unit row for id="${row.id}", got unitType="segment".`);
  }
  return row.id as CanonicalUnitId;
}

/** 从已读到的 row 安全打标：若 row 不是 segment 抛错。 */
export function brandLayerSegmentRowIdFromRow(row: Pick<LayerUnitDocType, 'id' | 'unitType'>): LayerSegmentRowId {
  if (!isSegmentRow(row)) {
    throw new Error(`[unitIdBrands] expected segment row for id="${row.id}", got unitType="${row.unitType ?? 'unit'}".`);
  }
  return row.id as LayerSegmentRowId;
}

/** 从 row 自动按 kind 生成 tagged target（per-layer 字段写入的首选入口）。 */
export function brandLayerUnitWriteTarget(row: Pick<LayerUnitDocType, 'id' | 'unitType'>): LayerUnitWriteTarget {
  return isSegmentRow(row)
    ? { kind: 'segment', id: row.id as LayerSegmentRowId }
    : { kind: 'unit', id: row.id as CanonicalUnitId };
}

/**
 * 在仅有 id 字符串、没有 row 时使用：需要调用方提供一个「已知 kind」的上下文。
 * 如果 id 实际对应的 row 与声称的 kind 不匹配，会在开发期抛错。
 *
 * Use when only a raw id string is available and caller can assert the row kind.
 * Mismatches against the provided lookup throw in development builds.
 */
export function brandLayerUnitWriteTargetByLookup(
  id: string,
  declaredKind: 'unit' | 'segment',
  lookup: (rawId: string) => Pick<LayerUnitDocType, 'id' | 'unitType'> | undefined,
): LayerUnitWriteTarget {
  const row = lookup(id);
  if (row) {
    const actualKind: 'unit' | 'segment' = isSegmentRow(row) ? 'segment' : 'unit';
    if (actualKind !== declaredKind) {
      throw new Error(
        `[unitIdBrands] id="${id}" declaredKind="${declaredKind}" but stored row is "${actualKind}". `
        + `Refusing to brand — this would re-enable cross-layer contamination.`,
      );
    }
  }
  return declaredKind === 'segment'
    ? { kind: 'segment', id: id as LayerSegmentRowId }
    : { kind: 'unit', id: id as CanonicalUnitId };
}

/**
 * ⚠️ Escape hatch — 只给兼容/迁移期 explicit cast 使用。
 *   调用时必须提供 `reason` 字符串描述"为什么这里安全"，以便后续 review 与移除。
 *   任何新代码都应避免使用本函数，优先走 `brandLayerUnitWriteTarget*` 家族。
 *
 * ⚠️ Escape hatch. Prefer the `brandLayerUnitWriteTarget*` helpers; this exists only
 *   for legacy adapters and must always be accompanied by a documented reason.
 */
export function unsafeAsCanonicalUnitId(raw: string, reason: string): CanonicalUnitId {
  void reason;
  return raw as CanonicalUnitId;
}

/** ⚠️ Escape hatch mirror of {@link unsafeAsCanonicalUnitId}. */
export function unsafeAsLayerSegmentRowId(raw: string, reason: string): LayerSegmentRowId {
  void reason;
  return raw as LayerSegmentRowId;
}

/** 从 tagged target 里拆出 raw string（供过渡期与仍消费 string[] 的旧 API 对接）。 */
export function unwrapLayerUnitWriteTargetId(target: LayerUnitWriteTarget): string {
  return target.id;
}
