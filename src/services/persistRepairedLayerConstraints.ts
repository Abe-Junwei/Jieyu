import { getDb, withTransaction, type LayerDocType, type LayerLinkDocType } from '../db';
import type { Locale } from '../i18n';
import {
  type ExistingLayerConstraintIssue,
  type ExistingLayerConstraintRepair,
  hasRepairPersistableLayerDiff,
  repairExistingLayerConstraints,
  validateExistingLayerConstraints,
} from './LayerConstraintService';
import { syncLayerToTier } from './TierBridgeService';

export interface PersistRepairedLayerConstraintsResult {
  layers: LayerDocType[];
  repairs: ExistingLayerConstraintRepair[];
  issues: ExistingLayerConstraintIssue[];
  changedCount: number;
}

/**
 * 一次约束修复里，有差异的层和对应 tier 进同一个事务。
 * Layers whose constraint binding changed, and their tiers, commit together.
 */
export async function persistRepairedLayerConstraints(input: {
  layers: readonly LayerDocType[];
  layerLinks: readonly LayerLinkDocType[];
  locale: Locale;
}): Promise<PersistRepairedLayerConstraintsResult> {
  const layers = [...input.layers];
  const repaired = repairExistingLayerConstraints(
    layers,
    undefined,
    input.locale,
    input.layerLinks,
  );
  const beforeById = new Map(layers.map((layer) => [layer.id, layer] as const));
  const changed = repaired.layers.filter((layer) => {
    const before = beforeById.get(layer.id);
    if (!before) return false;
    return hasRepairPersistableLayerDiff(before, layer, layers, input.layerLinks);
  });
  const issues = validateExistingLayerConstraints(
    repaired.layers,
    undefined,
    input.locale,
    input.layerLinks,
  );
  if (changed.length === 0) {
    return {
      layers: repaired.layers,
      repairs: repaired.repairs,
      issues,
      changedCount: 0,
    };
  }

  const now = new Date().toISOString();
  const changedIds = new Set(changed.map((layer) => layer.id));
  const stampedLayers = repaired.layers.map((layer) =>
    changedIds.has(layer.id) ? { ...layer, updatedAt: now } : layer,
  );
  const db = await getDb();
  await withTransaction(db, 'rw', [db.dexie.tier_definitions], async () => {
    for (const layer of stampedLayers) {
      if (!changedIds.has(layer.id)) continue;
      // 层没有独立的 Dexie 表，仍经 tier 适配器写入。| No dexie.layers table; the tier adapter is the write.
      await db.collections.layers.insert(layer);
      await syncLayerToTier(layer, layer.textId, db);
    }
  });

  return {
    layers: stampedLayers,
    repairs: repaired.repairs,
    issues,
    changedCount: changed.length,
  };
}
