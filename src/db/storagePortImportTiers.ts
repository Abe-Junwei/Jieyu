import { getDb } from './engine';
import type { TierDefinitionDocType } from './types';

export async function readTierDefinitionForLayerForm(
  layerId: string,
): Promise<TierDefinitionDocType | undefined> {
  const id = layerId.trim();
  if (id.length === 0) return undefined;
  const database = await getDb();
  return database.dexie.tier_definitions.get(id);
}
