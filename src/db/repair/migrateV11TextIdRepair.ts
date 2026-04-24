/**
 * Post–v11 repair: re-derive `tier_definitions.textId` for **translation** tiers from
 * `layer_unit_contents` + `layer_units`, fixing cases where an early v11 upgrade assigned
 * one fallback `textId` to every translation layer (CRITICAL-1).
 *
 * Callers should snapshot / export the project before running in production.
 */
import type { LayerUnitContentDocType, LayerUnitDocType, TierDefinitionDocType } from '../types';

export interface MigrateV11TextIdRepairTables {
  tier_definitions: {
    filter(fn: (t: TierDefinitionDocType) => boolean): { toArray(): Promise<TierDefinitionDocType[]> };
    put(row: TierDefinitionDocType): Promise<unknown>;
  };
  layer_units: { toArray(): Promise<LayerUnitDocType[]> };
  layer_unit_contents: { toArray(): Promise<LayerUnitContentDocType[]> };
}

export interface MigrateV11TextIdRepairResult {
  tiersExamined: number;
  tiersUpdated: number;
  changes: Array<{ tierId: string; from: string; to: string }>;
}

function resolveContentTextId(
  row: LayerUnitContentDocType,
  unitsById: Map<string, LayerUnitDocType>,
): string | undefined {
  if (typeof row.textId === 'string' && row.textId.trim().length > 0) {
    return row.textId.trim();
  }
  const uid = typeof row.unitId === 'string' && row.unitId.trim().length > 0 ? row.unitId.trim() : undefined;
  if (!uid) return undefined;
  let lu = unitsById.get(uid);
  let guard = 0;
  while (lu && lu.unitType !== 'unit' && typeof lu.parentUnitId === 'string' && lu.parentUnitId.length > 0 && guard < 32) {
    lu = unitsById.get(lu.parentUnitId);
    guard += 1;
  }
  const tid = lu?.textId;
  return typeof tid === 'string' && tid.trim().length > 0 ? tid.trim() : undefined;
}

/**
 * Majority-vote `textId` per translation tier from linked contents; updates tiers that differ.
 */
export async function repairTranslationTierTextIdsFromLayerContents(
  tables: MigrateV11TextIdRepairTables,
): Promise<MigrateV11TextIdRepairResult> {
  const tiers = await tables.tier_definitions
    .filter((t) => t.contentType === 'translation')
    .toArray();
  const units = await tables.layer_units.toArray();
  const unitsById = new Map(units.map((u) => [u.id, u]));

  const contents = await tables.layer_unit_contents.toArray();
  const byLayerId = new Map<string, LayerUnitContentDocType[]>();
  for (const c of contents) {
    const lid = c.layerId;
    if (typeof lid !== 'string' || lid.trim().length === 0) continue;
    const list = byLayerId.get(lid) ?? [];
    list.push(c);
    byLayerId.set(lid, list);
  }

  const changes: MigrateV11TextIdRepairResult['changes'] = [];
  let tiersUpdated = 0;

  for (const tier of tiers) {
    const rows = byLayerId.get(tier.id) ?? [];
    if (rows.length === 0) continue;

    const counts = new Map<string, number>();
    for (const r of rows) {
      const tid = resolveContentTextId(r, unitsById);
      if (!tid) continue;
      counts.set(tid, (counts.get(tid) ?? 0) + 1);
    }
    if (counts.size === 0) continue;

    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const best = ranked[0]![0];
    if (best && best !== tier.textId) {
      tiersUpdated += 1;
      changes.push({ tierId: tier.id, from: tier.textId, to: best });
      const now = new Date().toISOString();
      await tables.tier_definitions.put({
        ...tier,
        textId: best,
        updatedAt: now,
      });
    }
  }

  return {
    tiersExamined: tiers.length,
    tiersUpdated,
    changes,
  };
}
