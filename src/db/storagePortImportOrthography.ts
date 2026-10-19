import { getDb } from './engine';
import type { OrthographyDocType } from './types';

export async function listOrthographiesByLanguageIds(
  languageIds: readonly string[],
): Promise<OrthographyDocType[]> {
  if (languageIds.length === 0) return [];
  const database = await getDb();
  return database.dexie.orthographies
    .where('languageId')
    .anyOf([...languageIds])
    .toArray();
}

export async function bulkGetOrthographies(
  ids: readonly string[],
): Promise<Array<OrthographyDocType | undefined>> {
  if (ids.length === 0) return [];
  const database = await getDb();
  return database.dexie.orthographies.bulkGet([...ids]);
}
