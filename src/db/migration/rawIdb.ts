/**
 * 原生 IndexedDB 小工具（不经过 Dexie / getDb）| Raw IndexedDB helpers (bypass Dexie / getDb)
 */

export function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

/** 事务完成（complete）时 resolve；abort / error 时 reject | Resolves on complete, rejects on abort/error */
export function idbTransactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'));
    tx.onerror = (event) => {
      // 让 abort 统一 reject，避免重复 | let onabort carry the rejection
      event.preventDefault?.();
      try {
        tx.abort();
      } catch {
        // already finishing
      }
    };
  });
}

/**
 * 删除数据库。`rejectOnBlocked` 为真时，被其他连接阻塞就立即失败（请求仍会在对方关闭后完成）。
 * Delete a database; with `rejectOnBlocked` a blocked delete fails immediately.
 */
export function idbDeleteDatabase(
  factory: IDBFactory,
  name: string,
  rejectOnBlocked = false,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`failed to delete ${name}`));
    request.onblocked = () => {
      if (rejectOnBlocked)
        reject(
          new DOMException(`deleting ${name} is blocked by another connection`, 'BlockedError'),
        );
    };
  });
}

export type RawIndexSchema = {
  name: string;
  keyPath: string | string[];
  unique: boolean;
  multiEntry: boolean;
};

export type RawStoreSchema = {
  name: string;
  keyPath: string | string[] | null;
  autoIncrement: boolean;
  indexes: RawIndexSchema[];
};

function normalizeKeyPath(keyPath: string | string[] | null): string | string[] | null {
  if (keyPath === null) return null;
  return typeof keyPath === 'string' ? keyPath : [...keyPath];
}

/** 读取一个 object store 的结构（主键、索引）| Read an object store's structure */
export function readStoreSchema(store: IDBObjectStore): RawStoreSchema {
  const indexes: RawIndexSchema[] = [...store.indexNames].sort().map((indexName) => {
    const index = store.index(indexName);
    return {
      name: index.name,
      keyPath: normalizeKeyPath(index.keyPath) ?? '',
      unique: index.unique,
      multiEntry: index.multiEntry,
    };
  });
  return {
    name: store.name,
    keyPath: normalizeKeyPath(store.keyPath),
    autoIncrement: store.autoIncrement,
    indexes,
  };
}

/** 在 upgrade 事务里按结构重建 store 与索引 | Recreate a store with its indexes inside an upgrade tx */
export function createStoreFromSchema(db: IDBDatabase, schema: RawStoreSchema): void {
  const store = db.createObjectStore(schema.name, {
    ...(schema.keyPath !== null ? { keyPath: schema.keyPath } : {}),
    autoIncrement: schema.autoIncrement,
  });
  for (const index of schema.indexes) {
    store.createIndex(index.name, index.keyPath, {
      unique: index.unique,
      multiEntry: index.multiEntry,
    });
  }
}

export type RawStoreDump = {
  schema: RawStoreSchema;
  keys: IDBValidKey[];
  values: unknown[];
};

/**
 * 不指定版本、只读打开数据库并读出全部 store（结构 + 主键 + 值）。
 * Open without a version, read-only, and dump every store (schema + primary keys + values).
 */
export async function dumpDatabaseRaw(db: IDBDatabase): Promise<RawStoreDump[]> {
  const names = [...db.objectStoreNames].sort();
  if (names.length === 0) return [];
  const tx = db.transaction(names, 'readonly');
  const done = idbTransactionDone(tx);
  // 所有请求同步发出，再统一等待（事务内不夹杂其他异步）| issue every request before awaiting
  const pending = names.map((name) => {
    const store = tx.objectStore(name);
    return {
      schema: readStoreSchema(store),
      keys: idbRequest(store.getAllKeys()),
      values: idbRequest(store.getAll()),
    };
  });
  const dumps: RawStoreDump[] = [];
  for (const item of pending) {
    dumps.push({ schema: item.schema, keys: await item.keys, values: await item.values });
  }
  await done;
  return dumps;
}
