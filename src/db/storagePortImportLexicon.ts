import { getDb } from './engine';
import { isLexemeEntry } from './lexemeNestedIds';
import { withTransaction } from './withTransaction';

export async function listForeignLexemeIds(
  textId: string,
  ids: readonly string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const database = await getDb();
  const rows = await database.dexie.lexemes.bulkGet([...ids]);
  return new Set(
    rows.flatMap((row) => (row !== undefined && row.textId !== textId ? [row.id] : [])),
  );
}

export async function runLiftLexemeTransaction<T>(work: () => Promise<T>): Promise<T> {
  const database = await getDb();
  return withTransaction(database, 'rw', [database.dexie.lexemes], work, { label: 'lift-import' });
}

export async function readOwnedLexemeEntryId(
  textId: string,
  lexemeId: string,
): Promise<string | undefined> {
  const explicit = lexemeId.trim();
  if (explicit.length === 0) return undefined;
  const database = await getDb();
  const row = await database.dexie.lexemes.get(explicit);
  if (row && isLexemeEntry(row) && row.textId === textId) return row.id;
  return undefined;
}
