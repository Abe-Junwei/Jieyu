import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PRE_MIGRATION_BACKUP_DB_NAME,
  PRE_MIGRATION_BACKUP_STORE_NAME,
  createPreMigrationBackupSnapshot,
} from './preMigrationBackup';

type MemoryStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

function createMemoryStorage(): MemoryStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
  };
}

function openDb(name: string, version: number, onUpgrade: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = () => {
      onUpgrade(request.result);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(`failed to open ${name}`));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('idb request failed'));
  });
}

describe('createPreMigrationBackupSnapshot', () => {
  const createdDbNames: string[] = [];
  const storage = createMemoryStorage();

  afterEach(async () => {
    storage.clear();
    await Promise.all(createdDbNames.map((name) => Dexie.delete(name)));
    createdDbNames.length = 0;
  });

  it('creates snapshot from source DB before migration and writes it into backup DB', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: storage,
      configurable: true,
      writable: true,
    });

    const sourceDbName = `jieyu_pre_migration_source_${Date.now()}`;
    createdDbNames.push(sourceDbName, PRE_MIGRATION_BACKUP_DB_NAME);

    const source = await openDb(sourceDbName, 1, (db) => {
      if (!db.objectStoreNames.contains('texts')) {
        db.createObjectStore('texts', { keyPath: 'id' });
      }
    });
    const writeTx = source.transaction('texts', 'readwrite');
    writeTx.objectStore('texts').put({ id: 't1', value: 'hello' });
    await new Promise<void>((resolve, reject) => {
      writeTx.oncomplete = () => resolve();
      writeTx.onerror = () => reject(writeTx.error ?? new Error('write failed'));
      writeTx.onabort = () => reject(writeTx.error ?? new Error('write aborted'));
    });
    source.close();

    const result = await createPreMigrationBackupSnapshot({
      dbName: sourceDbName,
      fromVersion: 1,
      toVersion: 2,
    });
    expect(result).toBe('created');

    const backup = await openDb(PRE_MIGRATION_BACKUP_DB_NAME, 1, () => {
      // noop
    });
    const readTx = backup.transaction(PRE_MIGRATION_BACKUP_STORE_NAME, 'readonly');
    const rows = await requestToPromise(readTx.objectStore(PRE_MIGRATION_BACKUP_STORE_NAME).getAll());
    backup.close();

    expect(rows).toHaveLength(1);
    const snapshot = rows[0] as {
      dbName: string;
      fromVersion: number;
      toVersion: number;
      collections: Record<string, unknown[]>;
    };
    expect(snapshot.dbName).toBe(sourceDbName);
    expect(snapshot.fromVersion).toBe(1);
    expect(snapshot.toVersion).toBe(2);
    expect(Array.isArray(snapshot.collections['texts'])).toBe(true);
    expect(snapshot.collections['texts']?.length).toBe(1);
  });

  it('skips repeated snapshots for the same migration window once marker exists', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: storage,
      configurable: true,
      writable: true,
    });

    const sourceDbName = `jieyu_pre_migration_marker_${Date.now()}`;
    createdDbNames.push(sourceDbName, PRE_MIGRATION_BACKUP_DB_NAME);

    const source = await openDb(sourceDbName, 3, (db) => {
      if (!db.objectStoreNames.contains('layers')) {
        db.createObjectStore('layers', { keyPath: 'id' });
      }
    });
    source.close();

    const first = await createPreMigrationBackupSnapshot({
      dbName: sourceDbName,
      fromVersion: 3,
      toVersion: 4,
    });
    const second = await createPreMigrationBackupSnapshot({
      dbName: sourceDbName,
      fromVersion: 3,
      toVersion: 4,
    });

    expect(first).toBe('created');
    expect(second).toBe('skipped');
  });
});
