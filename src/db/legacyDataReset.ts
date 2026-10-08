/**
 * 旧数据检测与重置（rev5 8.1 / D10）| Legacy local-data detection and reset (rev5 8.1 / D10)
 *
 * 2A 基线把主库换成 `jieyu`。启动时若发现只有 2A 之前的构建才会留下的标记（旧主库
 * `jieyudb_v2`、旧迁移备份库，或迁移快照键），就提示用户；用户确认后**只**删除 8.1 表中
 * “提示后删除”的 5 个库和下面列出的存储键。拒绝时新库照常工作、旧库原样保留，下次启动再提示。
 *
 * The 2A baseline moves the main DB to `jieyu`. On boot, markers that only pre-2A builds leave
 * behind trigger a prompt; after confirmation ONLY the five "prompt_delete" databases and the listed
 * storage keys are removed. Declining keeps the new DB working; old data is untouched and the prompt
 * returns on next launch. Voice sessions, behavior log and the acoustic cache are never touched.
 */
import { LEGACY_RESET_DB_NAMES } from './tableRegistry';

/** 只有 2A 之前的构建会创建的库 | Databases only pre-2A builds create */
const LEGACY_MARKER_DB_NAMES = ['jieyudb_v2', 'jieyu_pre_migration_backups'] as const;

/** 前缀匹配的 localStorage 键（旧迁移备份）| Prefix-matched localStorage keys (old migration backups) */
const LEGACY_RESET_LOCAL_STORAGE_PREFIXES = [
  'jieyu.backup.preMigrationSnapshot:',
  'jieyu.backup.preMigrationSnapshotFailure:',
] as const;

/**
 * 精确匹配的 localStorage 键：8.1 清单 + 2A 开工时清点出的“保存项目 / 媒体 / 文本 ID”的键。
 * 未列入的键（AI 设置、界面偏好、语音设置等）一律保留。
 * Exact localStorage keys: the 8.1 list plus keys found at 2A start that hold project/media/text IDs.
 */
export const LEGACY_RESET_LOCAL_STORAGE_KEYS = [
  'jieyu:collab-client-state:v1',
  'jieyu.lastExportTimestamp',
  'jieyu.backup.dirtySinceLastExport',
  // 2A 清点补充 | added by the 2A inventory
  'jieyu:track-entity-state:v1',
  'jieyu:vad-cache',
  'jieyu:waveform-decode-attempt',
] as const;

const LEGACY_RESET_SESSION_STORAGE_KEYS = ['jieyu.workspace.transcriptionReturn.v1'] as const;

export type LegacyDataEnvironment = {
  indexedDB?: IDBFactory | undefined;
  localStorage?: Storage | undefined;
  sessionStorage?: Storage | undefined;
};

export type LegacyDataDetection = {
  detected: boolean;
  /** 存在且会被删除的库 | Databases present that would be deleted */
  databases: string[];
  /** 存在且会被删除的存储键 | Storage keys present that would be removed */
  localStorageKeys: string[];
  sessionStorageKeys: string[];
};

export type LegacyDataWipeResult = {
  deletedDatabases: string[];
  failedDatabases: string[];
  removedLocalStorageKeys: string[];
  removedSessionStorageKeys: string[];
};

function defaultEnvironment(): LegacyDataEnvironment {
  return {
    indexedDB: typeof indexedDB === 'undefined' ? undefined : indexedDB,
    localStorage: typeof localStorage === 'undefined' ? undefined : localStorage,
    sessionStorage: typeof sessionStorage === 'undefined' ? undefined : sessionStorage,
  };
}

function storageKeys(storage: Storage | undefined): string[] {
  if (!storage) return [];
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key !== null) keys.push(key);
    }
  } catch {
    return [];
  }
  return keys;
}

function matchingLocalKeys(storage: Storage | undefined): string[] {
  const exact = new Set<string>(LEGACY_RESET_LOCAL_STORAGE_KEYS);
  return storageKeys(storage).filter(
    (key) =>
      exact.has(key) ||
      LEGACY_RESET_LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix)),
  );
}

function matchingSessionKeys(storage: Storage | undefined): string[] {
  const exact = new Set<string>(LEGACY_RESET_SESSION_STORAGE_KEYS);
  return storageKeys(storage).filter((key) => exact.has(key));
}

async function listDatabaseNames(factory: IDBFactory | undefined): Promise<Set<string> | null> {
  if (!factory || typeof factory.databases !== 'function') return null;
  try {
    const infos = await factory.databases();
    return new Set(
      infos
        .map((info) => info.name)
        .filter((name): name is string => typeof name === 'string' && name.length > 0),
    );
  } catch {
    return null;
  }
}

/** 检测是否存在 2A 之前留下的数据 | Detect data left by pre-2A builds */
export async function detectLegacyLocalData(
  env: LegacyDataEnvironment = defaultEnvironment(),
): Promise<LegacyDataDetection> {
  const names = await listDatabaseNames(env.indexedDB);
  const localStorageKeys = matchingLocalKeys(env.localStorage);
  const sessionStorageKeys = matchingSessionKeys(env.sessionStorage);
  const markerDb = names !== null && LEGACY_MARKER_DB_NAMES.some((name) => names.has(name));
  const markerKey = localStorageKeys.some((key) =>
    LEGACY_RESET_LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix)),
  );
  const detected = markerDb || markerKey;
  if (!detected) {
    return { detected: false, databases: [], localStorageKeys: [], sessionStorageKeys: [] };
  }
  const databases =
    names === null
      ? [...LEGACY_RESET_DB_NAMES]
      : LEGACY_RESET_DB_NAMES.filter((name) => names.has(name));
  return { detected, databases, localStorageKeys, sessionStorageKeys };
}

const DELETE_DATABASE_TIMEOUT_MS = 15_000;

function deleteDatabase(factory: IDBFactory, name: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ok);
    };
    // 被其他标签页占用时 onblocked 之后仍可能成功；超时视为失败 | blocked may still succeed later; timeout = failure
    const timer = setTimeout(() => finish(false), DELETE_DATABASE_TIMEOUT_MS);
    try {
      const request = factory.deleteDatabase(name);
      request.onsuccess = () => finish(true);
      request.onerror = () => finish(false);
    } catch {
      finish(false);
    }
  });
}

/**
 * 用户确认后执行：只删除 8.1 列出的库与键。
 * Run after explicit confirmation: removes only the 8.1-listed databases and keys.
 */
export async function wipeLegacyLocalData(
  env: LegacyDataEnvironment = defaultEnvironment(),
): Promise<LegacyDataWipeResult> {
  const result: LegacyDataWipeResult = {
    deletedDatabases: [],
    failedDatabases: [],
    removedLocalStorageKeys: [],
    removedSessionStorageKeys: [],
  };
  if (env.indexedDB) {
    for (const name of LEGACY_RESET_DB_NAMES) {
      const ok = await deleteDatabase(env.indexedDB, name);
      (ok ? result.deletedDatabases : result.failedDatabases).push(name);
    }
  }
  for (const key of matchingLocalKeys(env.localStorage)) {
    try {
      env.localStorage?.removeItem(key);
      result.removedLocalStorageKeys.push(key);
    } catch {
      // 存储不可用时跳过 | skip when storage is unavailable
    }
  }
  for (const key of matchingSessionKeys(env.sessionStorage)) {
    try {
      env.sessionStorage?.removeItem(key);
      result.removedSessionStorageKeys.push(key);
    } catch {
      // 存储不可用时跳过 | skip when storage is unavailable
    }
  }
  return result;
}
