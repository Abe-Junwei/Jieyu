import { getDb } from './engine';
import { StorageReadbackError } from './storageReadbackError';
import type { TokenLexemeLinkDocType } from './types';

export async function replaceHostTokenGraph(hostUnitId: string): Promise<void> {
  const unitId = hostUnitId.trim();
  if (unitId.length === 0) return;
  const database = await getDb();
  const oldTokens = await database.dexie.unit_tokens.where('unitId').equals(unitId).toArray();
  const oldMorphs = await database.dexie.unit_morphemes.where('unitId').equals(unitId).toArray();
  const linkTargets = [
    ...oldTokens.map((row) => ['token', row.id] as [string, string]),
    ...oldMorphs.map((row) => ['morpheme', row.id] as [string, string]),
  ];
  if (linkTargets.length > 0) {
    await database.dexie.token_lexeme_links
      .where('[targetType+targetId]')
      .anyOf(linkTargets)
      .delete();
  }
  await database.dexie.unit_morphemes.where('unitId').equals(unitId).delete();
  await database.dexie.unit_tokens.where('unitId').equals(unitId).delete();
  const [tokensLeft, morphsLeft, linksLeft] = await Promise.all([
    database.dexie.unit_tokens.where('unitId').equals(unitId).count(),
    database.dexie.unit_morphemes.where('unitId').equals(unitId).count(),
    linkTargets.length === 0
      ? Promise.resolve(0)
      : database.dexie.token_lexeme_links.where('[targetType+targetId]').anyOf(linkTargets).count(),
  ]);
  if (tokensLeft !== 0 || morphsLeft !== 0 || linksLeft !== 0) {
    throw new StorageReadbackError('replaceHostTokenGraph');
  }
}

export async function putTokenLexemeLinks(rows: readonly TokenLexemeLinkDocType[]): Promise<void> {
  if (rows.length === 0) return;
  const database = await getDb();
  await database.dexie.token_lexeme_links.bulkPut([...rows]);
  for (const row of rows) {
    const stored = await database.dexie.token_lexeme_links.get(row.id);
    if (
      !stored ||
      stored.id !== row.id ||
      stored.targetId !== row.targetId ||
      stored.lexemeId !== row.lexemeId
    ) {
      throw new StorageReadbackError('putTokenLexemeLinks');
    }
  }
}
