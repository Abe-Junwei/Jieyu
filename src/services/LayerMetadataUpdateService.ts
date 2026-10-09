/**
 * 图层元信息更新：层、翻译层链接、层定义在同一个事务里写入（JY-18）。
 * 任一步失败（含层约束校验不通过）整体回滚，不会留下层与链接不一致。
 * Layer metadata update: the layer, its translation links and its tier definition are written in
 * one transaction (JY-18). Any failure, including a tier-constraint error, rolls everything back.
 */
import {
  dexieStoresForTierDefinitionAtomicRw,
  getDb,
  withTransaction,
  type LayerDocType,
  type LayerLinkDocType,
  type TierDefinitionDocType,
} from '../db';
import type { AuditSource } from '../db/types';
import { saveTierDefinition } from './LinguisticService.tiers';
import { syncLayerToTier } from './TierBridgeService';

/** 层约束校验失败 | Tier constraint check failed */
export class LayerMetadataConstraintError extends Error {
  constructor(
    public readonly layerId: string,
    public readonly violations: readonly { rule: string; message: string }[],
  ) {
    super(violations.map((violation) => violation.message).join('; '));
    this.name = 'LayerMetadataConstraintError';
  }
}

export type ApplyLayerMetadataUpdateInput = {
  layer: LayerDocType;
  /** 给出时整体替换该翻译层的链接；`null` 表示不动 | Replace this layer's links when given */
  replaceLinks: readonly LayerLinkDocType[] | null;
  /** 根据事务里读到的层定义算出下一版 | Compute the next tier from the row read in the transaction */
  patchTier: (tier: TierDefinitionDocType) => TierDefinitionDocType;
  source?: AuditSource;
};

export async function applyLayerMetadataUpdate(
  input: ApplyLayerMetadataUpdateInput,
): Promise<void> {
  const db = await getDb();
  const { layer } = input;
  try {
    await withTransaction(
      db,
      'rw',
      [db.dexie.layer_links, ...dexieStoresForTierDefinitionAtomicRw(db)],
      async () => {
        await db.collections.layers.insert(layer);
        await syncLayerToTier(layer, layer.textId, db);
        if (input.replaceLinks !== null) {
          await db.collections.layer_links.removeBySelector({ layerId: layer.id });
          for (const link of input.replaceLinks) {
            await db.collections.layer_links.insert(link);
          }
        }
        const tier = await db.dexie.tier_definitions.get(layer.id);
        if (!tier) return;
        const result = await saveTierDefinition(input.patchTier(tier), input.source ?? 'human');
        if (result.errors.length > 0) {
          throw new LayerMetadataConstraintError(layer.id, result.errors);
        }
      },
      { label: 'LayerMetadataUpdateService.apply' },
    );
  } catch (error) {
    // withTransaction 把领域错误放在 cause 里 | withTransaction keeps the domain error as `cause`
    throw error instanceof Error && error.cause instanceof Error ? error.cause : error;
  }
}
