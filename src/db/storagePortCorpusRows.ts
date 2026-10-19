import { getDb } from './engine';
import type { UnitMorphemeDocType, UnitTokenDocType } from './types';

function trimmed(id: string): string {
  return id.trim();
}

export async function listUnitTokensByText(textId: string): Promise<UnitTokenDocType[]> {
  const id = trimmed(textId);
  if (id.length === 0) return [];
  const database = await getDb();
  return database.dexie.unit_tokens.where('textId').equals(id).toArray();
}

export async function listUnitMorphemesByText(textId: string): Promise<UnitMorphemeDocType[]> {
  const id = trimmed(textId);
  if (id.length === 0) return [];
  const database = await getDb();
  return database.dexie.unit_morphemes.where('textId').equals(id).toArray();
}
