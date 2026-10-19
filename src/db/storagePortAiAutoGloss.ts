import { getDb } from './engine';
import { validateTokenLexemeLinkDoc } from './schemas';
import { StorageReadbackError } from './storageReadbackError';
import type {
  LexemeDocType,
  MultiLangString,
  TokenLexemeLinkDocType,
  UnitTokenDocType,
} from './types';
import { withTransaction } from './withTransaction';

export async function listUnitTokensByUnitId(unitId: string): Promise<UnitTokenDocType[]> {
  if (unitId.length === 0) return [];
  const database = await getDb();
  return database.dexie.unit_tokens.where('unitId').equals(unitId).toArray();
}

export async function listLexemesByTextIds(textIds: readonly string[]): Promise<LexemeDocType[]> {
  if (textIds.length === 0) return [];
  const database = await getDb();
  return database.dexie.lexemes
    .where('textId')
    .anyOf([...textIds])
    .toArray();
}

export interface AutoGlossWrite {
  tokenId: string;
  gloss: MultiLangString;
  updatedAt: string;
  link: TokenLexemeLinkDocType;
}

function rethrowStorageReadback(error: unknown): never {
  if (error instanceof StorageReadbackError) throw error;
  if (error instanceof Error && error.cause instanceof StorageReadbackError) throw error.cause;
  throw error;
}

export async function applyAutoGlossWrites(items: readonly AutoGlossWrite[]): Promise<void> {
  if (items.length === 0) return;
  const database = await getDb();
  try {
    await withTransaction(
      database,
      'rw',
      [database.dexie.unit_tokens, database.dexie.token_lexeme_links],
      async () => {
        for (const item of items) {
          const updated = await database.dexie.unit_tokens.update(item.tokenId, {
            gloss: item.gloss,
            updatedAt: item.updatedAt,
          });
          if (updated > 0) {
            const storedToken = await database.dexie.unit_tokens.get(item.tokenId);
            if (!storedToken || storedToken.id !== item.tokenId) {
              throw new StorageReadbackError('applyAutoGlossWrites');
            }
          }
          validateTokenLexemeLinkDoc(item.link);
          await database.dexie.token_lexeme_links.put(item.link);
          const storedLink = await database.dexie.token_lexeme_links.get(item.link.id);
          if (!storedLink || storedLink.id !== item.link.id) {
            throw new StorageReadbackError('applyAutoGlossWrites');
          }
        }
      },
      { label: 'ai-autogloss' },
    );
  } catch (error) {
    rethrowStorageReadback(error);
  }
}
