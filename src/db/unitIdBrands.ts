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
 *   避免在业务层手写 `segmentId → hostId → LinguisticService.units.save` 的反模式。
 *   需要 escape hatch 时在适配层显式 cast，并附带可审计的 reason，便于 review / 架构守卫识别。
 */

import type { LayerUnitDocType } from './types';

declare const __canonicalUnitIdBrand: unique symbol;
declare const __layerSegmentRowIdBrand: unique symbol;

/** 规范 unit 行（`unitType` 为 'unit' 或 undefined）的 id。 */
type CanonicalUnitId = string & { readonly [__canonicalUnitIdBrand]: true };

/** 段行（`unitType === 'segment'`）的 id；per-layer 字段的合法写入目标。 */
type LayerSegmentRowId = string & { readonly [__layerSegmentRowIdBrand]: true };

/** per-layer 字段（self-certainty / status / provenance…）写入目标的 kind-aware tagged union。 */
export type LayerUnitWriteTarget =
  | { readonly kind: 'unit'; readonly id: CanonicalUnitId }
  | { readonly kind: 'segment'; readonly id: LayerSegmentRowId };

function isSegmentRow(row: Pick<LayerUnitDocType, 'unitType'>): boolean {
  return row.unitType === 'segment';
}

/** 从 row 自动按 kind 生成 tagged target（per-layer 字段写入的首选入口）。 */
export function brandLayerUnitWriteTarget(
  row: Pick<LayerUnitDocType, 'id' | 'unitType'>,
): LayerUnitWriteTarget {
  return isSegmentRow(row)
    ? { kind: 'segment', id: row.id as LayerSegmentRowId }
    : { kind: 'unit', id: row.id as CanonicalUnitId };
}
