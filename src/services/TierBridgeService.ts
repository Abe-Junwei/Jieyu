/**
 * TierBridgeService — bridge between TranslationLayer and TierDefinition.
 *
 * 边界约束（必须遵守） | Boundary rules (must follow)
 * 1) 该服务是业务域访问 tier 概念的唯一边界之一。| This service is a primary boundary for tier usage from business domain.
 * 2) 页面/普通业务逻辑应优先使用 layer，不直接依赖 TierDefinition 细节。| UI and regular business logic should use layer-first and avoid direct TierDefinition semantics.
 * 3) tier 仅用于互操作与结构校验（EAF/TextGrid/语言学约束）。| tier is reserved for interop and structural validation (EAF/TextGrid/linguistic constraints).
 * 4) 新增 tier 相关访问路径时，优先在本服务或适配层扩展，不要在调用端散落实现。| Add new tier access paths in this service/adapter, not in scattered callers.
 * 5) 命名约定：业务域使用 layerId；tierId 仅用于 tier 语义或桥接上下文。| Naming convention: use layerId in business domain; tierId only in tier semantics or bridge context.
 *
 * Mapping rules:
 *   TranslationLayer(layerType='transcription')
 *     ⟷ TierDefinition(tierType='time-aligned', contentType='transcription')
 *   TranslationLayer(layerType='translation')
 *     ⟷ TierDefinition(tierType='time-aligned', contentType='translation')
 */
import {
  getDb,
  type TranslationLayerDocType,
  type TierDefinitionDocType,
} from '../db';

export interface ConsistencyIssue {
  kind: 'missing-tier' | 'missing-layer' | 'mismatch';
  layerId?: string;
  tierId?: string;
  message: string;
}

const TIER_KEY_PREFIX = 'bridge_';

function tierKeyForLayer(layer: Pick<TranslationLayerDocType, 'key'>): string {
  return `${TIER_KEY_PREFIX}${layer.key}`;
}

/**
 * Remove the TierDefinition bridge row for a TranslationLayer.
 * 通过统一桥接入口删除对应 tier，避免上层重复拼接 key 逻辑 | Remove bridge tier via a single canonical boundary
 */
export async function removeLayerTierBridge(
  layer: Pick<TranslationLayerDocType, 'textId' | 'key'>,
): Promise<number> {
  const db = await getDb();
  return db.collections.tier_definitions.removeBySelector({
    textId: layer.textId,
    key: tierKeyForLayer(layer),
  });
}

/**
 * Ensure a matching TierDefinition exists for the given layer.
 * Creates one if missing; updates name/language if changed.
 */
export async function syncLayerToTier(
  layer: TranslationLayerDocType,
  textId: string,
): Promise<TierDefinitionDocType> {
  const db = await getDb();
  const expectedKey = tierKeyForLayer(layer);

  const existingDoc = await db.collections.tier_definitions
    .findOne({ selector: { textId, key: expectedKey } }).exec();
  const existing = existingDoc?.toJSON();

  const now = new Date().toISOString();
  const contentType = layer.layerType === 'transcription' ? 'transcription' : 'translation';

  if (existing) {
    // Update mutable fields if they drifted
    const needsUpdate =
      existing.languageId !== layer.languageId ||
      JSON.stringify(existing.name) !== JSON.stringify(layer.name) ||
      existing.modality !== layer.modality ||
      existing.acceptsAudio !== layer.acceptsAudio ||
      existing.isDefault !== layer.isDefault ||
      existing.accessRights !== layer.accessRights;

    if (needsUpdate) {
      const updated: TierDefinitionDocType = {
        ...existing,
        languageId: layer.languageId,
        name: layer.name,
        modality: layer.modality,
        ...(layer.acceptsAudio !== undefined && { acceptsAudio: layer.acceptsAudio }),
        ...(layer.isDefault !== undefined && { isDefault: layer.isDefault }),
        ...(layer.accessRights !== undefined && { accessRights: layer.accessRights }),
        ...(layer.sortOrder !== undefined && { sortOrder: layer.sortOrder }),
        updatedAt: now,
      };
      await db.collections.tier_definitions.insert(updated);
      return updated;
    }
    return existing;
  }

  // Create new TierDefinition
  const newTier: TierDefinitionDocType = {
    id: layer.id,
    textId,
    key: expectedKey,
    name: layer.name,
    tierType: 'time-aligned',
    contentType,
    languageId: layer.languageId,
    modality: layer.modality,
    ...(layer.acceptsAudio !== undefined && { acceptsAudio: layer.acceptsAudio }),
    ...(layer.isDefault !== undefined && { isDefault: layer.isDefault }),
    ...(layer.accessRights !== undefined && { accessRights: layer.accessRights }),
    ...(layer.sortOrder !== undefined && { sortOrder: layer.sortOrder }),
    createdAt: now,
    updatedAt: now,
  };
  await db.collections.tier_definitions.insert(newTier);
  return newTier;
}

/**
 * Ensure a matching TranslationLayer exists for the given TierDefinition.
 * Only applies to bridge-prefixed tiers (those managed by this service).
 */
export async function syncTierToLayer(
  tier: TierDefinitionDocType,
): Promise<TranslationLayerDocType | null> {
  if (!tier.key.startsWith(TIER_KEY_PREFIX)) return null;

  const db = await getDb();
  const layerKey = tier.key.slice(TIER_KEY_PREFIX.length);

  const existingDoc = await db.collections.translation_layers
    .findOne({ selector: { textId: tier.textId, key: layerKey } }).exec();
  const existing = existingDoc?.toJSON();

  if (existing) {
    // Update mutable fields if they drifted
    const needsUpdate =
      existing.textId !== tier.textId ||
      existing.languageId !== (tier.languageId ?? existing.languageId) ||
      JSON.stringify(existing.name) !== JSON.stringify(tier.name);

    if (needsUpdate) {
      const now = new Date().toISOString();
      const updated: TranslationLayerDocType = {
        ...existing,
        textId: tier.textId,
        languageId: tier.languageId ?? existing.languageId,
        name: tier.name,
        updatedAt: now,
      };
      await db.collections.translation_layers.insert(updated);
      return updated;
    }
    return existing;
  }

  // Layer doesn't exist — create it
  const layerType = tier.contentType === 'transcription' ? 'transcription' : 'translation';
  const newLayer: TranslationLayerDocType = {
    id: tier.id,
    textId: tier.textId,
    key: layerKey,
    name: tier.name,
    layerType,
    languageId: tier.languageId ?? '',
    modality: tier.modality ?? 'text',
    ...(tier.acceptsAudio !== undefined && { acceptsAudio: tier.acceptsAudio }),
    ...(tier.isDefault !== undefined && { isDefault: tier.isDefault }),
    ...(tier.accessRights !== undefined && { accessRights: tier.accessRights }),
    ...(tier.sortOrder !== undefined && { sortOrder: tier.sortOrder }),
    createdAt: tier.createdAt,
    updatedAt: tier.updatedAt,
  };
  await db.collections.translation_layers.insert(newLayer);
  return newLayer;
}

/**
 * Check consistency between all TranslationLayers and TierDefinitions.
 * Returns issues where one side exists without the other, or fields diverge.
 */
export async function validateLayerTierConsistency(
  textId: string,
): Promise<ConsistencyIssue[]> {
  const db = await getDb();
  const issues: ConsistencyIssue[] = [];

  const layerDocs = await db.collections.translation_layers.findByIndex('textId', textId);
  const layers = layerDocs.map((d) => d.toJSON());

  const tierDocs = await db.collections.tier_definitions.findByIndex('textId', textId);
  const tiers = tierDocs.map((d) => d.toJSON());

  const tierByKey = new Map(tiers.map((t) => [t.key, t]));

  // Check each layer has a corresponding tier in this text
  for (const layer of layers) {
    const expectedKey = tierKeyForLayer(layer);
    const tier = tierByKey.get(expectedKey);
    if (!tier) {
      issues.push({
        kind: 'missing-tier',
        layerId: layer.id,
        message: `Layer "${layer.key}" has no corresponding TierDefinition (expected key="${expectedKey}").`,
      });
      continue;
    }

    // Check field alignment
    if (layer.languageId !== (tier.languageId ?? '')) {
      issues.push({
        kind: 'mismatch',
        layerId: layer.id,
        tierId: tier.id,
        message: `Language mismatch: layer="${layer.languageId}", tier="${tier.languageId ?? ''}".`,
      });
    }
  }

  // Check each bridge-prefixed tier has a corresponding layer
  const layerKeySet = new Set(layers.map((l) => tierKeyForLayer(l)));
  for (const tier of tiers) {
    if (!tier.key.startsWith(TIER_KEY_PREFIX)) continue;
    if (!layerKeySet.has(tier.key)) {
      issues.push({
        kind: 'missing-layer',
        tierId: tier.id,
        message: `TierDefinition "${tier.key}" has no corresponding TranslationLayer.`,
      });
    }
  }

  return issues;
}
