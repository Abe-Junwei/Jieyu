/**
 * 版本检测（rev5 8.2）| Version detection (rev5 8.2)
 *
 * 统一使用 Dexie 版本号（原生版本 / 10）。检测不经过 Dexie，也不创建数据库：
 * 优先用 `indexedDB.databases()`；不支持时不指定版本打开，若触发 `upgradeneeded`（库不存在）
 * 就中止创建。
 * Uses Dexie versions (native / 10). Detection bypasses Dexie and never creates the database.
 */

export type InstalledDatabaseInfo =
  | { exists: false }
  | {
      exists: true;
      /** 原生 IndexedDB 版本 | Native IndexedDB version */
      nativeVersion: number;
      /** Dexie 版本号（取整；Dexie 打过 schema 补丁时原生版本不是 10 的倍数）| Dexie version (floored) */
      schemaVersion: number;
      /** 原生版本不是 10 的倍数（Dexie SchemaDiff 补丁）| Native version is not a multiple of 10 */
      patched: boolean;
      storeNames: string[];
    };

/** 原生版本 → Dexie 版本号 | Native → Dexie version */
export function dexieVersionFromNative(nativeVersion: number): number {
  return nativeVersion / 10;
}

/** Dexie 版本号 → 原生版本 | Dexie → native version */
export function nativeVersionFromDexie(dexieVersion: number): number {
  return Math.round(dexieVersion * 10);
}

async function listedInDatabases(factory: IDBFactory, name: string): Promise<boolean | undefined> {
  if (typeof factory.databases !== 'function') return undefined;
  try {
    const list = await factory.databases();
    return list.some((info) => info.name === name);
  } catch {
    return undefined;
  }
}

/**
 * 不指定版本打开数据库，读取版本和 store 名后立即关闭。库不存在时中止创建，返回 null。
 * Open without a version, read version and store names, close. Aborts creation when absent.
 */
export function openExistingDatabaseRaw(
  factory: IDBFactory,
  name: string,
): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    let aborted = false;
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(name);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = (event) => {
      if (event.oldVersion === 0) {
        aborted = true;
        try {
          request.transaction?.abort();
        } catch {
          // ignore
        }
      }
    };
    request.onsuccess = () => {
      if (aborted) {
        request.result.close();
        resolve(null);
        return;
      }
      resolve(request.result);
    };
    request.onerror = (event) => {
      if (aborted) {
        event.preventDefault?.();
        resolve(null);
        return;
      }
      reject(request.error ?? new Error(`failed to open ${name}`));
    };
    request.onblocked = () => {
      // 不带版本的打开不会被阻塞；保险起见不做处理 | A version-less open is never blocked
    };
  });
}

/** 检测已安装的数据库版本 | Detect the installed database version */
export async function detectInstalledDatabase(
  factory: IDBFactory,
  name: string,
): Promise<InstalledDatabaseInfo> {
  const listed = await listedInDatabases(factory, name);
  if (listed === false) return { exists: false };
  const native = await openExistingDatabaseRaw(factory, name);
  if (!native) return { exists: false };
  try {
    const nativeVersion = native.version;
    return {
      exists: true,
      nativeVersion,
      schemaVersion: Math.floor(dexieVersionFromNative(nativeVersion)),
      patched: nativeVersion % 10 !== 0,
      storeNames: [...native.objectStoreNames].sort(),
    };
  } finally {
    native.close();
  }
}

export type VersionComparison =
  | { kind: 'fresh-install'; target: number }
  | { kind: 'current'; installed: number; target: number }
  | { kind: 'upgrade'; installed: number; target: number }
  | { kind: 'data-newer-than-app'; installed: number; target: number };

/** 把已安装版本与代码目标版本比较 | Compare the installed version with the code target */
export function compareInstalledVersion(
  info: InstalledDatabaseInfo,
  target: number,
): VersionComparison {
  if (!info.exists) return { kind: 'fresh-install', target };
  const installed = info.schemaVersion;
  if (installed > target) return { kind: 'data-newer-than-app', installed, target };
  if (installed === target) return { kind: 'current', installed, target };
  return { kind: 'upgrade', installed, target };
}
