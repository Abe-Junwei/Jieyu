import type { Transaction } from 'dexie';
import { assignLexemeNestedIdsInPlace } from '../lexemeNestedIds';

/** Dexie v54: backfill missing sense/form ids on existing lexeme rows. */
export async function upgradeV54LexemeNestedIds(tx: Transaction): Promise<void> {
  const table = tx.table('lexemes');
  await table.toCollection().modify((row: { senses?: unknown; forms?: unknown }) => {
    assignLexemeNestedIdsInPlace(row);
  });
}
