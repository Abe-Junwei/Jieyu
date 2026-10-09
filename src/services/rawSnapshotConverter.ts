/**
 * 原始快照 → JYB 转换器（rev5 8.2，第 4b 批，T41）。
 * Raw snapshot → JYB converter (rev5 8.2, batch 4b, T41).
 *
 * 步骤：解析原始快照 ZIP → 原样写进一个临时库（版本号与快照相同）→ 用当前代码的版本账本（含
 * upgrader）打开，升到当前版本 → 从临时库导出 JYB（含字节）→ 删除临时库。导出的 JYB 交给 7.5 的
 * 流程导入（默认逐项目导入为新项目）。
 * 原始快照只读：任何一步失败都不会改动传入的字节，临时库在 finally 里删除。
 * Steps: parse the raw ZIP → write it as-is into a temp DB at the snapshot's native version → open
 * it with the current ledger (upgraders included) so it is upgraded to the current version → export
 * a JYB (bytes included) from the temp DB → delete the temp DB. The JYB then goes through the 7.5
 * flow (per-project import as new projects by default). The raw snapshot is read-only: no failure
 * touches the input bytes, and the temp DB is deleted in `finally`.
 */
import { JIEYU_DEXIE_DB_NAME, JieyuDexie, wrapJieyuDexie } from '../db/engine';
import { idbDeleteDatabase } from '../db/migration/rawIdb';
import {
  downloadRawRecoveryExport,
  exportRawIdbSnapshot,
  isRawIdbSnapshot,
  parseRawIdbSnapshot,
  writeRawIdbSnapshotToNewDatabase,
  type RawIdbSnapshotManifest,
} from '../db/migration/rawRecoveryExport';
import {
  JIEYU_SCHEMA_BASELINE_VERSION,
  JIEYU_SCHEMA_VERSIONS,
  latestSchemaVersion,
  type JieyuSchemaVersion,
} from '../db/migration/schemaVersions';
import { exportDatabaseToJybBlob, JYB_PACKAGE_POLICY } from './JybService';

export { isRawIdbSnapshot };

export type RawSnapshotConversionFailure =
  | 'not-raw-snapshot'
  | 'other-database'
  | 'newer-than-app'
  | 'older-than-baseline'
  | 'upgrade-failed'
  | 'export-failed';

/** 转换失败；原始快照保持不变 | Conversion failed; the raw snapshot is unchanged */
export class RawSnapshotConversionError extends Error {
  readonly reason: RawSnapshotConversionFailure;
  constructor(reason: RawSnapshotConversionFailure, message: string, cause?: unknown) {
    super(message);
    this.name = 'RawSnapshotConversionError';
    this.reason = reason;
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

export interface RawSnapshotConversionResult {
  jyb: Blob;
  source: Pick<RawIdbSnapshotManifest, 'dbName' | 'nativeVersion' | 'dexieVersion' | 'exportedAt'>;
  /** 升级到的 Dexie 版本 | Dexie version the data was upgraded to */
  upgradedToVersion: number;
}

export interface RawSnapshotConversionOptions {
  factory?: IDBFactory;
  /** 版本账本（测试用合成账本）；默认当前代码的账本 | Ledger (synthetic in tests); defaults to the app's */
  versions?: readonly JieyuSchemaVersion[];
  /** 临时库名（测试用）| Temp DB name (tests) */
  tempDbName?: string;
}

function defaultFactory(): IDBFactory {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is unavailable');
  return indexedDB;
}

function tempName(): string {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `jieyu-raw-convert-${id}`;
}

/**
 * 把原始快照转换成当前版本的 JYB（含字节、不含本机偏好）。
 * Convert a raw snapshot into a current-version JYB (bytes included, no local preferences).
 */
export async function convertRawSnapshotToJyb(
  rawZip: Uint8Array | Blob,
  options: RawSnapshotConversionOptions = {},
): Promise<RawSnapshotConversionResult> {
  const factory = options.factory ?? defaultFactory();
  const versions = options.versions ?? JIEYU_SCHEMA_VERSIONS;
  const target = latestSchemaVersion(versions);

  let snapshot;
  try {
    snapshot = await parseRawIdbSnapshot(rawZip, JYB_PACKAGE_POLICY);
  } catch (error) {
    throw new RawSnapshotConversionError(
      'not-raw-snapshot',
      `Not a readable raw snapshot: ${error instanceof Error ? error.message : String(error)}`,
      error,
    );
  }
  const { manifest } = snapshot;
  if (manifest.dbName !== JIEYU_DEXIE_DB_NAME) {
    throw new RawSnapshotConversionError(
      'other-database',
      `The raw snapshot is of ${manifest.dbName}, not ${JIEYU_DEXIE_DB_NAME}.`,
    );
  }
  if (manifest.dexieVersion > target) {
    throw new RawSnapshotConversionError(
      'newer-than-app',
      `The raw snapshot is at version ${manifest.dexieVersion}; this app only knows up to ${target}. Update the app first.`,
    );
  }
  if (manifest.dexieVersion < JIEYU_SCHEMA_BASELINE_VERSION) {
    throw new RawSnapshotConversionError(
      'older-than-baseline',
      `The raw snapshot predates the baseline (version ${manifest.dexieVersion}).`,
    );
  }

  const dbName = options.tempDbName ?? tempName();
  let dexie: JieyuDexie | undefined;
  try {
    let upgraded;
    try {
      await writeRawIdbSnapshotToNewDatabase({ factory, snapshot, targetDbName: dbName });
      dexie = new JieyuDexie(dbName, { indexedDB: factory }, versions);
      await dexie.open();
      upgraded = wrapJieyuDexie(dexie);
    } catch (error) {
      throw new RawSnapshotConversionError(
        'upgrade-failed',
        `Upgrading the raw snapshot failed: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
    try {
      const jyb = await exportDatabaseToJybBlob({
        source: upgraded,
        includeMedia: true,
        includePreferences: false,
      });
      return {
        jyb,
        source: {
          dbName: manifest.dbName,
          nativeVersion: manifest.nativeVersion,
          dexieVersion: manifest.dexieVersion,
          exportedAt: manifest.exportedAt,
        },
        upgradedToVersion: dexie.verno,
      };
    } catch (error) {
      throw new RawSnapshotConversionError(
        'export-failed',
        `Exporting the converted data failed: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  } finally {
    dexie?.close();
    await idbDeleteDatabase(factory, dbName).catch(() => undefined);
  }
}

/**
 * 手动导出主库的原始恢复快照并下载（项目中心“导出”菜单）。只读，不经过 `getDb()`。
 * Export the main database as a raw recovery snapshot and download it (project hub "Export" menu).
 * Read-only; bypasses `getDb()`.
 */
export async function downloadMainDatabaseRawSnapshot(): Promise<RawIdbSnapshotManifest> {
  const result = await exportRawIdbSnapshot({
    dbName: JIEYU_DEXIE_DB_NAME,
    appSchemaVersion: latestSchemaVersion(JIEYU_SCHEMA_VERSIONS),
    reason: 'manual',
  });
  downloadRawRecoveryExport(result);
  return result.manifest;
}
