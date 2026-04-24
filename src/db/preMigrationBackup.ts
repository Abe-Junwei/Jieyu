type PreMigrationBackupResult = 'created' | 'skipped' | 'failed';

type PreMigrationBackupSnapshot = {
  id: string;
  dbName: string;
  fromVersion: number;
  toVersion: number;
  createdAt: string;
  collections: Record<string, unknown[]>;
};

type CreatePreMigrationBackupInput = {
  dbName: string;
  fromVersion: number;
  toVersion: number;
};

export const PRE_MIGRATION_BACKUP_DB_NAME = 'jieyu_pre_migration_backups';
export const PRE_MIGRATION_BACKUP_STORE_NAME = 'snapshots';

const PRE_MIGRATION_BACKUP_SCHEMA_VERSION = 1;
const PRE_MIGRATION_MARKER_PREFIX = 'jieyu.backup.preMigrationSnapshot';
const PRE_MIGRATION_FAILURE_PREFIX = 'jieyu.backup.preMigrationSnapshotFailure';
const PRE_MIGRATION_FAILURE_COOLDOWN_MS = 6 * 60 * 60 * 1000;

function makeMarkerKey(dbName: string, fromVersion: number, toVersion: number): string {
  return `${PRE_MIGRATION_MARKER_PREFIX}:${encodeURIComponent(dbName)}:${fromVersion}->${toVersion}`;
}

function makeFailureKey(dbName: string, fromVersion: number, toVersion: number): string {
  return `${PRE_MIGRATION_FAILURE_PREFIX}:${encodeURIComponent(dbName)}:${fromVersion}->${toVersion}`;
}

function readLocalStorageNumber(key: string): number {
  try {
    const raw = globalThis.localStorage?.getItem(key) ?? '';
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function writeLocalStorageNumber(key: string, value: number): void {
  try {
    globalThis.localStorage?.setItem(key, String(value));
  } catch {
    // ignore
  }
}

function removeLocalStorageKey(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // ignore
  }
}

function hasCompletedMarker(key: string): boolean {
  return readLocalStorageNumber(key) > 0;
}

function isInFailureCooldown(key: string, now = Date.now()): boolean {
  const failedAt = readLocalStorageNumber(key);
  return failedAt > 0 && now - failedAt < PRE_MIGRATION_FAILURE_COOLDOWN_MS;
}

function openIndexedDb(
  dbName: string,
  version?: number,
  onUpgrade?: (db: IDBDatabase) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexedDB unavailable'));
      return;
    }

    const request = version ? indexedDB.open(dbName, version) : indexedDB.open(dbName);

    request.onupgradeneeded = () => {
      if (!request.result) {
        reject(new Error(`onupgradeneeded without result: ${dbName}`));
        return;
      }
      if (!onUpgrade) {
        request.transaction?.abort();
        reject(new Error(`unexpected upgrade while opening ${dbName}`));
        return;
      }
      onUpgrade(request.result);
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(`failed to open ${dbName}`));
    request.onblocked = () => reject(new Error(`open blocked for ${dbName}`));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('idb request failed'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('idb transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('idb transaction aborted'));
  });
}

async function dumpAllStores(db: IDBDatabase): Promise<Record<string, unknown[]>> {
  const collections: Record<string, unknown[]> = {};
  const storeNames = Array.from(db.objectStoreNames);
  for (const storeName of storeNames) {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const rows = await requestToPromise(store.getAll());
    await transactionDone(tx);
    collections[storeName] = rows as unknown[];
  }
  return collections;
}

async function persistSnapshot(snapshot: PreMigrationBackupSnapshot): Promise<void> {
  const db = await openIndexedDb(
    PRE_MIGRATION_BACKUP_DB_NAME,
    PRE_MIGRATION_BACKUP_SCHEMA_VERSION,
    (upgradeDb) => {
      if (!upgradeDb.objectStoreNames.contains(PRE_MIGRATION_BACKUP_STORE_NAME)) {
        upgradeDb.createObjectStore(PRE_MIGRATION_BACKUP_STORE_NAME, { keyPath: 'id' });
      }
    },
  );

  try {
    const tx = db.transaction(PRE_MIGRATION_BACKUP_STORE_NAME, 'readwrite');
    tx.objectStore(PRE_MIGRATION_BACKUP_STORE_NAME).put(snapshot);
    await transactionDone(tx);
  } finally {
    db.close();
  }
}

/**
 * 迁移前自动备份：在触发 Dexie schema upgrade 前，用原始 IndexedDB 连接导出快照到独立备份库。
 * Pre-migration auto backup: dump the current DB into a dedicated backup database before schema upgrade.
 */
export async function createPreMigrationBackupSnapshot(
  input: CreatePreMigrationBackupInput,
): Promise<PreMigrationBackupResult> {
  const { dbName, fromVersion, toVersion } = input;
  if (typeof indexedDB === 'undefined') return 'skipped';
  if (fromVersion <= 0 || toVersion <= fromVersion) return 'skipped';

  const markerKey = makeMarkerKey(dbName, fromVersion, toVersion);
  if (hasCompletedMarker(markerKey)) return 'skipped';

  const failureKey = makeFailureKey(dbName, fromVersion, toVersion);
  if (isInFailureCooldown(failureKey)) return 'skipped';

  let sourceDb: IDBDatabase | null = null;
  try {
    sourceDb = await openIndexedDb(dbName, fromVersion);
    const collections = await dumpAllStores(sourceDb);

    const snapshot: PreMigrationBackupSnapshot = {
      id: `${encodeURIComponent(dbName)}:${fromVersion}->${toVersion}:${Date.now()}`,
      dbName,
      fromVersion,
      toVersion,
      createdAt: new Date().toISOString(),
      collections,
    };
    await persistSnapshot(snapshot);

    writeLocalStorageNumber(markerKey, Date.now());
    removeLocalStorageKey(failureKey);
    return 'created';
  } catch {
    writeLocalStorageNumber(failureKey, Date.now());
    return 'failed';
  } finally {
    sourceDb?.close();
  }
}
