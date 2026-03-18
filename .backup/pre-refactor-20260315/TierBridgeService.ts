/**
 * TierBridgeService — bridge between TranslationLayer and TierDefinition.
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

function tierKeyForLayer(layer: TranslationLayerDocType): string {
  return `${TIER_KEY_PREFIX}${layer.key}`;
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

  const allTierDocs = await db.collections.tier_definitions.find().exec();
  const existing = allTierDocs
    .map((d) => d.toJSON())
    .find((t) => t.textId === textId && t.key === expectedKey);

  const now = new Date().toISOString();
  const contentType = layer.layerType === 'transcription' ? 'transcription' : 'translation';

  if (existing) {
    // Update mutable fields if they drifted
    const needsUpdate =
      existing.languageId !== layer.languageId ||
      JSON.stringify(existing.name) !== JSON.stringify(layer.name);

    if (needsUpdate) {
      const updated: TierDefinitionDocType = {
        ...existing,
        languageId: layer.languageId,
        name: layer.name,
        updatedAt: now,
      };
      await db.collections.tier_definitions.insert(updated);
      return updated;
    }
    return existing;
  }

  // Create new TierDefinition
  const newTier: TierDefinitionDocType = {
    id: `tier_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    textId,
    key: expectedKey,
    name: layer.name,
    tierType: 'time-aligned',
    contentType,
    languageId: layer.languageId,
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

  const allLayerDocs = await db.collections.translation_layers.find().exec();
  const existing = allLayerDocs.map((d) => d.toJSON()).find((l) => l.key === layerKey);

  if (existing) {
    // Update mutable fields if they drifted
    const needsUpdate =
      existing.languageId !== (tier.languageId ?? existing.languageId) ||
      JSON.stringify(existing.name) !== JSON.stringify(tier.name);

    if (needsUpdate) {
      const now = new Date().toISOString();
      const updated: TranslationLayerDocType = {
        ...existing,
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
  const now = new Date().toISOString();
  const layerType = tier.contentType === 'transcription' ? 'transcription' : 'translation';
  const newLayer: TranslationLayerDocType = {
    id: `layer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    key: layerKey,
    name: tier.name,
    layerType,
    languageId: tier.languageId ?? '',
    modality: 'text',
    createdAt: now,
    updatedAt: now,
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

  const layerDocs = await db.collections.translation_layers.find().exec();
  const layers = layerDocs.map((d) => d.toJSON());

  const tierDocs = await db.collections.tier_definitions.find().exec();
  const tiers = tierDocs.map((d) => d.toJSON()).filter((t) => t.textId === textId);

  const tierByKey = new Map(tiers.map((t) => [t.key, t]));

  // Check each layer has a corresponding tier
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
