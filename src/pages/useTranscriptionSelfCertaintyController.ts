import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TimelineUnitKind } from '../hooks/transcription/transcriptionTypes';
import { fireAndForget } from '../utils/fireAndForget';
import type { UnitSelfCertainty } from '../utils/unitSelfCertainty';
import { brandLayerUnitWriteTarget, type LayerUnitWriteTarget } from '../app/jieyuDbPageAccess';
import {
  overrideMasksAuthoritative,
  putInflightSelfCertaintyOverrides,
  reconcileSettledSelfCertaintyOverrides,
  rollbackSelfCertaintyOverrides,
  settleSelfCertaintyOverrides,
  type SelfCertaintyOverrideEntry,
} from './selfCertaintyOptimisticOverride';

/**
 * ⚠️ per-layer 字段严格分治原则（self-certainty 治理 post-mortem）
 *   - selfCertainty 是 per-layer 属性：它属于某一层对某一段的"注释"，天然不能跨层共享。
 *   - canonical unit 行（unitType === 'unit'）是多层共享的宿主；segment 行（unitType === 'segment'）是层私有的。
 *   - 因此：
 *       ① 写路径绝不允许把 per-layer 字段解析/回退到宿主 unit 行。kind='segment' 写段行自己，
 *         kind='unit' 写 unit 自己——仅此二者。
 *       ② 读路径不再做"段行没值就回宿主找"的 fallback；没有就是没有（避免把宿主上的脏数据或他层值
 *         投影回当前层）。
 *       ③ 历史上把段 self-certainty 写到了宿主上的数据视为待清洗（lazy migration 在其他 module 处理）。
 *
 *   ⚠️ Strict kind-partitioning for per-layer fields.
 *     Self-certainty is per-layer. Canonical unit rows are shared across layers; segment rows are
 *     layer-private. Therefore: writes MUST land on the row that matches the kind (never the host),
 *     and reads MUST NOT fall back to the host — otherwise the host becomes a cross-layer leak surface.
 */

type SelfCertaintyHintUnit = {
  id: string;
  layerId?: string | undefined;
  unitId?: string | undefined;
  parentUnitId?: string | undefined;
  mediaId?: string | undefined;
  selfCertainty?: UnitSelfCertainty | undefined;
  startTime: number;
  endTime: number;
};

type SelfCertaintyUnit = {
  id: string;
  startTime: number;
  endTime: number;
  mediaId?: string | undefined;
  selfCertainty?: UnitSelfCertainty | undefined;
};

type UseTranscriptionSelfCertaintyControllerInput = {
  segmentsByLayer: ReadonlyMap<string, readonly SelfCertaintyHintUnit[]>;
  currentMediaUnits: readonly SelfCertaintyHintUnit[];
  units: readonly SelfCertaintyUnit[];
  /**
   * ⚠️ kind-aware tagged targets。
   *   `{ kind: 'unit', id }`    → 写 layer_units 中的 canonical unit 行（unitType='unit'）。
   *   `{ kind: 'segment', id }` → 写 layer_units 中的段行（unitType='segment'）。
   *   控制器保证 target.id 与 target.kind 严格一致；leaf 层根据 DB 行 unitType 分派到
   *   LinguisticService.units.saveBatch vs LayerUnitSegmentWriteService.upsertSegments。
   *
   * ⚠️ Upgraded to kind-aware tagged targets. Controller guarantees targets match the row kind;
   *   the leaf dispatches by DB row unitType. Never routes a per-layer write to a shared host.
   */
  saveUnitSelfCertainty: (
    targets: ReadonlyArray<LayerUnitWriteTarget>,
    value: UnitSelfCertainty | undefined,
  ) => Promise<unknown> | unknown;
};

function scopedKey(layerId: string | undefined, unitId: string): string {
  return `${layerId ?? ''}::${unitId}`;
}

/** Deduped segment rows by id for alias resolution (dependent lane vs segment storage layer). */
function buildSegmentRowLayerIndex(
  segmentsByLayer: ReadonlyMap<string, readonly SelfCertaintyHintUnit[]>,
  currentMediaUnits: readonly SelfCertaintyHintUnit[],
  canonicalUnitIds: ReadonlySet<string>,
): Map<string, readonly { layerId: string }[]> {
  const map = new Map<string, { layerId: string }[]>();
  const push = (rawId: string, rawLayerId: string | undefined) => {
    const id = rawId.trim();
    if (!id || canonicalUnitIds.has(id)) return;
    const layerId = rawLayerId?.trim() ?? '';
    const arr = map.get(id) ?? [];
    if (!arr.some((x) => x.layerId === layerId)) arr.push({ layerId });
    map.set(id, arr);
  };
  for (const segs of segmentsByLayer.values()) {
    for (const seg of segs) push(seg.id, seg.layerId);
  }
  for (const u of currentMediaUnits) push(u.id, u.layerId);
  return map;
}

/**
 * 读取优先保持当前显示层作用域；只有没有 layer 上下文时，才允许回落到唯一物理段行的存储层。
 * Keep reads scoped to the visible lane first; only fall back to the single physical segment row
 * when there is no explicit layer context at all.
 */
function scopedLayerIdForSegmentRead(
  segmentId: string,
  requestedLayerId: string,
  canonicalUnitIds: ReadonlySet<string>,
  segmentRowLayerIndex: ReadonlyMap<string, readonly { layerId: string }[]>,
): string {
  const id = segmentId.trim();
  const req = requestedLayerId.trim();
  if (!id || canonicalUnitIds.has(id)) return req;
  if (req) return req;
  const rows = segmentRowLayerIndex.get(id);
  if (!rows || rows.length !== 1) return req;
  const firstRow = rows[0];
  if (!firstRow) return req;
  const storage = firstRow.layerId.trim();
  return storage || req;
}

function scopedLayerIdForSegmentWrite(
  segmentId: string,
  menuLayerId: string,
  canonicalUnitIds: ReadonlySet<string>,
  segmentRowLayerIndex: ReadonlyMap<string, readonly { layerId: string }[]>,
): string {
  const id = segmentId.trim();
  const menu = menuLayerId.trim();
  if (!id || canonicalUnitIds.has(id)) return menu;
  if (menu) return menu;
  const rows = segmentRowLayerIndex.get(id);
  if (!rows || rows.length === 0) return menu;
  if (rows.length === 1) {
    const firstRow = rows[0];
    if (!firstRow) return menu;
    const storage = firstRow.layerId.trim();
    return storage || menu;
  }
  const hit = rows.find((r) => r.layerId.trim() === menu);
  return hit ? hit.layerId.trim() : menu;
}

export function useTranscriptionSelfCertaintyController(
  input: UseTranscriptionSelfCertaintyControllerInput,
) {
  /**
   * 已知 canonical unit id 集合，用于判断一条 id 应该写到 unit 行还是段行。
   * Set of known canonical unit ids — used to decide whether a raw id targets the
   * canonical unit row or a segment row.
   */
  const canonicalUnitIds = useMemo(() => {
    const set = new Set<string>();
    for (const unit of input.units) {
      if (unit.id) set.add(unit.id);
    }
    return set;
  }, [input.units]);

  const segmentRowLayerIndex = useMemo(
    () =>
      buildSegmentRowLayerIndex(input.segmentsByLayer, input.currentMediaUnits, canonicalUnitIds),
    [input.currentMediaUnits, input.segmentsByLayer, canonicalUnitIds],
  );

  /**
   * 层私有的 self-certainty 直接映射：
   *   - 段行：从 segmentsByLayer[layerId].find(seg.id).selfCertainty 读。
   *   - unit 行：从 currentMediaUnits.find((u) => u.layerId === layerId && u.id === unitId).selfCertainty 读。
   *
   * Layer-scoped direct map of self-certainty. Never reads from a shared host unit.
   */
  const selfCertaintyByScopedUnitId = useMemo(() => {
    const out = new Map<string, UnitSelfCertainty>();

    for (const segments of input.segmentsByLayer.values()) {
      for (const seg of segments) {
        if (seg.selfCertainty) {
          out.set(scopedKey(seg.layerId ?? '', seg.id), seg.selfCertainty);
        }
      }
    }

    for (const unit of input.currentMediaUnits) {
      if (unit.selfCertainty) {
        out.set(scopedKey(unit.layerId ?? '', unit.id), unit.selfCertainty);
      }
    }

    return out;
  }, [input.currentMediaUnits, input.segmentsByLayer]);

  /**
   * kind-less 查询的兜底：仅给 canonical unit 行用——它本就不是 per-layer 概念。
   * 段行从不走本表，避免跨层污染。
   *
   * Kind-less fallback map — ONLY for canonical unit rows (unit-intrinsic semantic).
   * Never populated from host for a segment.
   */
  const selfCertaintyByUnitId = useMemo(() => {
    const out = new Map<string, UnitSelfCertainty>();
    for (const unit of input.units) {
      if (unit.selfCertainty) {
        out.set(unit.id, unit.selfCertainty);
      }
    }
    return out;
  }, [input.units]);

  const [localSelfCertaintyByScopedUnitId, setLocalSelfCertaintyByScopedUnitId] = useState<
    Map<string, SelfCertaintyOverrideEntry>
  >(() => new Map());
  const overrideGenerationRef = useRef(0);
  const readModelRef = useRef({
    segmentsByLayer: input.segmentsByLayer,
    units: input.units,
  });
  readModelRef.current = {
    segmentsByLayer: input.segmentsByLayer,
    units: input.units,
  };

  /**
   * 层内有段行/视图值时用它。canonical unit 没有层内值时读自己的 unit 行，
   * 不是段行回退到宿主。段行没有自己的值就是没有。
   */
  const authoritativeSelfCertainty = useCallback(
    (unitId: string, layerId: string): UnitSelfCertainty | undefined => {
      if (layerId) {
        const scopedValue = selfCertaintyByScopedUnitId.get(scopedKey(layerId, unitId));
        if (scopedValue) return scopedValue;
        if (canonicalUnitIds.has(unitId)) return selfCertaintyByUnitId.get(unitId);
        return undefined;
      }
      return selfCertaintyByUnitId.get(unitId);
    },
    [canonicalUnitIds, selfCertaintyByScopedUnitId, selfCertaintyByUnitId],
  );
  const authoritativeRef = useRef(authoritativeSelfCertainty);
  authoritativeRef.current = authoritativeSelfCertainty;

  useEffect(() => {
    setLocalSelfCertaintyByScopedUnitId((prev) =>
      reconcileSettledSelfCertaintyOverrides(prev, {
        segmentsByLayer: input.segmentsByLayer,
        units: input.units,
        authoritativeFor: (entry) => authoritativeSelfCertainty(entry.unitId, entry.layerId),
      }),
    );
  }, [authoritativeSelfCertainty, input.segmentsByLayer, input.units]);

  const resolveSelfCertaintyForUnit = useCallback(
    (unitId: string, layerId?: string): UnitSelfCertainty | undefined => {
      const normalizedUnitId = unitId.trim();
      if (!normalizedUnitId) return undefined;

      const normalizedLayerId = layerId?.trim() ?? '';
      const lookupLayerId = canonicalUnitIds.has(normalizedUnitId)
        ? normalizedLayerId
        : scopedLayerIdForSegmentRead(
            normalizedUnitId,
            normalizedLayerId,
            canonicalUnitIds,
            segmentRowLayerIndex,
          );

      const authoritative = authoritativeSelfCertainty(normalizedUnitId, lookupLayerId);
      const localScopedKey = scopedKey(lookupLayerId, normalizedUnitId);
      const override = localSelfCertaintyByScopedUnitId.get(localScopedKey);
      if (
        override &&
        overrideMasksAuthoritative(override, authoritative, {
          segmentsByLayer: input.segmentsByLayer,
          units: input.units,
        })
      ) {
        return override.value ?? undefined;
      }
      return authoritative;
    },
    [
      authoritativeSelfCertainty,
      canonicalUnitIds,
      input.segmentsByLayer,
      input.units,
      localSelfCertaintyByScopedUnitId,
      segmentRowLayerIndex,
    ],
  );

  /**
   * Ambiguity 从定义消失：
   *   新语义下段行只读自己；不再存在"段 → 多 host 候选"的歧义。
   *   保留函数签名兼容外部（UI / hooks）导出，永远返回 false。
   *
   * Under the new semantics, segments only read their own row, so no host-candidate
   * ambiguity exists. The API is retained for call-site compatibility but always
   * reports false.
   */
  const resolveSelfCertaintyAmbiguityForUnit = useCallback((_unitId: string, _layerId?: string) => {
    return false;
  }, []);

  /**
   * 将入参 id 集合按照"是否为已知 canonical unit"过滤——保留给 UI 菜单层做 target 校验用。
   *   - 若该 id 在 input.units 中 → canonical unit → 留下。
   *   - 否则视为段行（或未知 id）→ 本函数不解析段行 id（菜单层本就直接用 segment id），
   *     因此对 segment 上下文用途返回空数组即可；segment 写入由 overlays 直接传 targetIds。
   *
   * Filter ids down to known canonical units. Segment-kind menu paths already pass
   * segment ids directly (see TranscriptionOverlays.tsx:184-187); this helper is only
   * used for the unit-kind branch to validate ids.
   */
  const resolveSelfCertaintyUnitIds = useCallback(
    (ids: readonly string[], _layerId?: string) => {
      const out: string[] = [];
      for (const rawId of ids) {
        const id = rawId.trim();
        if (!id) continue;
        if (canonicalUnitIds.has(id)) out.push(id);
      }
      return out;
    },
    [canonicalUnitIds],
  );

  const handleSetUnitSelfCertaintyFromMenu = useCallback(
    (
      unitIds: Iterable<string>,
      kind: TimelineUnitKind,
      value: UnitSelfCertainty | undefined,
      layerId?: string,
    ) => {
      const normalizedUnitIds = [...unitIds].map((id) => id.trim()).filter((id) => id.length > 0);
      if (normalizedUnitIds.length === 0) return;
      const normalizedLayerId = layerId?.trim() ?? '';

      /*
       * Strict kind partitioning — see the top-of-file post-mortem comment.
       *   segment → 段行自己（layer-private），绝不回退到宿主 unit。
       *   unit    → canonical unit 行自己。
       * 以前的 "segment → parent unit" 解析是串层污染根因；整条 host-resolution 链路已删除。
       */
      const targets: LayerUnitWriteTarget[] = [];
      const overrideTargets: { id: string; layerId: string }[] = [];
      for (const rawId of normalizedUnitIds) {
        switch (kind) {
          case 'segment':
            targets.push(brandLayerUnitWriteTarget({ id: rawId, unitType: 'segment' }));
            overrideTargets.push({
              id: rawId,
              layerId: scopedLayerIdForSegmentWrite(
                rawId,
                normalizedLayerId,
                canonicalUnitIds,
                segmentRowLayerIndex,
              ),
            });
            break;
          case 'unit':
            // 只接受 canonical 集里的 id，避免把野 id 写成 unit 行并留下清不掉的覆盖。
            if (!canonicalUnitIds.has(rawId)) break;
            targets.push(brandLayerUnitWriteTarget({ id: rawId, unitType: 'unit' }));
            overrideTargets.push({ id: rawId, layerId: normalizedLayerId });
            break;
          default: {
            const unreachable: never = kind;
            throw new Error(`unexpected timeline unit kind ${String(unreachable)}`);
          }
        }
      }
      if (targets.length === 0) return;

      // Optimistic 只压本次真正要写的 (layerId, unitId)，并且只在该次写入等待期间优先于读模型。
      // Segment rows are keyed by storage layerId. Menus pass the timeline lane id; remap so the
      // optimistic key matches the read that uses the segment row's layer when the menu layer is empty.
      const generation = overrideGenerationRef.current + 1;
      overrideGenerationRef.current = generation;
      const segmentsByLayerAtStart = input.segmentsByLayer;
      const unitsAtStart = input.units;
      const updates = overrideTargets.map((target) => ({
        key: scopedKey(target.layerId, target.id),
        unitId: target.id,
        layerId: target.layerId,
        value: value ?? null,
        generation,
        kind,
      }));
      const overrideKeys = updates.map((update) => ({
        key: update.key,
        generation: update.generation,
      }));
      setLocalSelfCertaintyByScopedUnitId((prev) =>
        putInflightSelfCertaintyOverrides(prev, updates),
      );

      let saveResult: unknown;
      try {
        saveResult = input.saveUnitSelfCertainty(targets, value);
      } catch (error) {
        saveResult = Promise.reject(error);
      }
      const task = Promise.resolve(saveResult).then(
        () => {
          const sources = readModelRef.current;
          setLocalSelfCertaintyByScopedUnitId((prev) =>
            settleSelfCertaintyOverrides(prev, {
              keys: overrideKeys,
              authoritativeFor: (entry) => authoritativeRef.current(entry.unitId, entry.layerId),
              segmentsByLayer: sources.segmentsByLayer,
              units: sources.units,
              segmentsByLayerAtStart,
              unitsAtStart,
            }),
          );
        },
        (error: unknown) => {
          setLocalSelfCertaintyByScopedUnitId((prev) =>
            rollbackSelfCertaintyOverrides(prev, overrideKeys),
          );
          throw error;
        },
      );
      fireAndForget(task, {
        context: 'src/pages/useTranscriptionSelfCertaintyController.ts:L422',
        policy: 'user-visible',
      });
    },
    [canonicalUnitIds, input, segmentRowLayerIndex],
  );

  return {
    resolveSelfCertaintyUnitIds,
    resolveSelfCertaintyForUnit,
    resolveSelfCertaintyAmbiguityForUnit,
    handleSetUnitSelfCertaintyFromMenu,
  };
}
