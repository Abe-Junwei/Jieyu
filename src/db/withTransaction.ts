import type { Table } from 'dexie';

import type { JieyuDatabase } from './engine';

export type DbTransactionMode = 'r' | 'rw';

/**
 * Heterogeneous object stores passed to `db.dexie.transaction(…)`.
 * Must not use `Table<unknown, …>` — Dexie 4 `Table` is 3-arity and `TableHooks` are incompatible
 * across concrete entity types; `any` is the intended erase for mixed store lists.
 */
type DexieStore = Table<any, any, any>;

function dedupeStores(stores: readonly DexieStore[]): DexieStore[] {
  const byName = new Map<string, DexieStore>();
  for (const store of stores) {
    byName.set(store.name, store);
  }
  return [...byName.values()];
}

function withTransactionErrorPrefix(message: string, label?: string): string {
  if (!label) return message;
  return `[db.transaction:${label}] ${message}`;
}

/**
 * 统一事务门面 | Unified Dexie transaction facade
 *
 * - 统一事务调用入口，便于后续做埋点、重试策略与治理检查。
 * - 自动按表名去重，避免重复声明 store 造成可读性噪音。
 */
export async function withTransaction<T>(
  db: JieyuDatabase,
  mode: DbTransactionMode,
  stores: readonly DexieStore[],
  scope: () => Promise<T>,
  options?: { label?: string },
): Promise<T> {
  const dedupedStores = dedupeStores(stores);
  if (dedupedStores.length === 0) {
    return scope();
  }

  try {
    return await db.dexie.transaction(mode, [...dedupedStores], scope);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(withTransactionErrorPrefix(error.message, options?.label));
    }
    throw error;
  }
}

export async function withReadTransaction<T>(
  db: JieyuDatabase,
  stores: readonly DexieStore[],
  scope: () => Promise<T>,
  options?: { label?: string },
): Promise<T> {
  return withTransaction(db, 'r', stores, scope, options);
}

export async function withWriteTransaction<T>(
  db: JieyuDatabase,
  stores: readonly DexieStore[],
  scope: () => Promise<T>,
  options?: { label?: string },
): Promise<T> {
  return withTransaction(db, 'rw', stores, scope, options);
}
