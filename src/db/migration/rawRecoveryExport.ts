/**
 * 原始恢复导出（rev5 8.2）| Raw recovery export (rev5 8.2)
 *
 * 不经过 `getDb()`：用原生 IndexedDB、不指定版本打开数据库，按 store 只读读取，生成“原始快照 ZIP”。
 * manifest 写明 `kind: raw-idb`、库名、原生版本号、Dexie 版本号和各 store 的行数。
 * 它保存的是**旧 schema 的原样数据，不是 JYB**；转换器（原始快照 → JYB）属于第 4b 批。
 *
 * Bypasses `getDb()`: opens the database natively without a version, reads every store read-only
 * and produces a "raw snapshot ZIP". The manifest records `kind: raw-idb`, DB name, native and Dexie
 * versions and per-store row counts. It is the old schema's data as-is, NOT a JYB.
 *
 * ZIP 布局 | ZIP layout
 * - `manifest.json`
 * - `stores/<nnn>.ndjson`：每行 `{"k": 主键, "v": 值}`（规范化标签编码，二进制换成 `$file` 引用）
 * - `blobs/<nnnnnn>.bin`：Blob / ArrayBuffer / TypedArray 的原始字节
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { fromTaggedTree, rebuildBinary, toTaggedTree, type BinaryEncoder } from './canonicalValue';
import {
  createStoreFromSchema,
  dumpDatabaseRaw,
  idbTransactionDone,
  type RawStoreSchema,
} from './rawIdb';
import { dexieVersionFromNative, openExistingDatabaseRaw } from './versionDetection';

export const RAW_IDB_SNAPSHOT_KIND = 'raw-idb' as const;
export const RAW_IDB_SNAPSHOT_FORMAT_VERSION = 1;

export type RawIdbSnapshotStoreEntry = RawStoreSchema & { rowCount: number; file: string };

export type RawIdbSnapshotManifest = {
  kind: typeof RAW_IDB_SNAPSHOT_KIND;
  formatVersion: number;
  dbName: string;
  nativeVersion: number;
  dexieVersion: number;
  exportedAt: string;
  /** 导出时代码的目标 schema 版本（便于判断差几个版本）| Code target version at export time */
  appSchemaVersion?: number;
  /** 导出原因，例如 migration-blocked | Why it was exported */
  reason?: string;
  stores: RawIdbSnapshotStoreEntry[];
  binaryFileCount: number;
};

export type RawIdbExportResult = {
  bytes: Uint8Array;
  manifest: RawIdbSnapshotManifest;
  fileName: string;
};

export type RawIdbExportOptions = {
  factory?: IDBFactory;
  dbName: string;
  appSchemaVersion?: number;
  reason?: string;
  now?: () => Date;
};

function defaultFactory(): IDBFactory {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is unavailable');
  return indexedDB;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/** 导出文件名（只含安全字符）| Export file name (safe characters only) */
export function rawRecoveryFileName(
  manifest: Pick<RawIdbSnapshotManifest, 'dbName' | 'nativeVersion' | 'exportedAt'>,
): string {
  const safeDb = manifest.dbName.replace(/[^A-Za-z0-9_-]/g, '_');
  const stamp = manifest.exportedAt.replace(/[:.]/g, '-');
  return `jieyu-raw-recovery-${safeDb}-n${manifest.nativeVersion}-${stamp}.zip`;
}

/**
 * 生成原始快照 ZIP。数据库不存在时抛错；源库只读，不做任何写入。
 * Build the raw snapshot ZIP. Throws when the database is absent; never writes to the source.
 */
export async function exportRawIdbSnapshot(
  options: RawIdbExportOptions,
): Promise<RawIdbExportResult> {
  const factory = options.factory ?? defaultFactory();
  const now = options.now ?? (() => new Date());
  const db = await openExistingDatabaseRaw(factory, options.dbName);
  if (!db) throw new Error(`${options.dbName} does not exist; nothing to export`);
  const nativeVersion = db.version;
  let dumps;
  try {
    dumps = await dumpDatabaseRaw(db);
  } finally {
    db.close();
  }

  const files: Zippable = {};
  let binaryCount = 0;
  const encodeBinary: BinaryEncoder = (bytes, meta) => {
    binaryCount += 1;
    const path = `blobs/${pad(binaryCount, 6)}.bin`;
    files[path] = [bytes, { level: 0 }];
    return {
      $file: path,
      kind: meta.kind,
      ...(meta.type !== undefined ? { type: meta.type } : {}),
      ...(meta.name !== undefined ? { name: meta.name } : {}),
      ...(meta.ctor !== undefined ? { ctor: meta.ctor } : {}),
    };
  };

  const stores: RawIdbSnapshotStoreEntry[] = [];
  for (let i = 0; i < dumps.length; i += 1) {
    const dump = dumps[i]!;
    const lines: string[] = [];
    for (let row = 0; row < dump.values.length; row += 1) {
      const k = await toTaggedTree(dump.keys[row], encodeBinary);
      const v = await toTaggedTree(dump.values[row], encodeBinary);
      lines.push(JSON.stringify({ k, v }));
    }
    const file = `stores/${pad(i, 3)}.ndjson`;
    files[file] = strToU8(lines.length > 0 ? `${lines.join('\n')}\n` : '');
    stores.push({ ...dump.schema, rowCount: dump.values.length, file });
  }

  const manifest: RawIdbSnapshotManifest = {
    kind: RAW_IDB_SNAPSHOT_KIND,
    formatVersion: RAW_IDB_SNAPSHOT_FORMAT_VERSION,
    dbName: options.dbName,
    nativeVersion,
    dexieVersion: dexieVersionFromNative(nativeVersion),
    exportedAt: now().toISOString(),
    ...(options.appSchemaVersion !== undefined
      ? { appSchemaVersion: options.appSchemaVersion }
      : {}),
    ...(options.reason !== undefined ? { reason: options.reason } : {}),
    stores,
    binaryFileCount: binaryCount,
  };
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  return { bytes: zipSync(files), manifest, fileName: rawRecoveryFileName(manifest) };
}

export type ParsedRawIdbSnapshot = {
  manifest: RawIdbSnapshotManifest;
  stores: Array<{ schema: RawStoreSchema; keys: IDBValidKey[]; values: unknown[] }>;
};

/**
 * 解析原始快照 ZIP（转换器与原版本还原共用）。结构不对就抛错，不做任何写入。
 * Parse a raw snapshot ZIP (shared by the converter and same-version restore). Throws on bad shape.
 */
export function parseRawIdbSnapshot(bytes: Uint8Array): ParsedRawIdbSnapshot {
  const entries = unzipSync(bytes);
  const manifestBytes = entries['manifest.json'];
  if (!manifestBytes) throw new Error('raw snapshot: manifest.json missing');
  const manifest = JSON.parse(strFromU8(manifestBytes)) as RawIdbSnapshotManifest;
  if (manifest.kind !== RAW_IDB_SNAPSHOT_KIND)
    throw new Error(`raw snapshot: unexpected kind ${String(manifest.kind)}`);
  if (manifest.formatVersion !== RAW_IDB_SNAPSHOT_FORMAT_VERSION) {
    throw new Error(`raw snapshot: unsupported format version ${String(manifest.formatVersion)}`);
  }
  const decodeBinary = (tag: Record<string, unknown>): unknown => {
    const path = String(tag.$file ?? '');
    const data = entries[path];
    if (!data) throw new Error(`raw snapshot: binary file ${path} missing`);
    return rebuildBinary(data, tag);
  };
  const stores = manifest.stores.map((store) => {
    const data = entries[store.file];
    if (!data) throw new Error(`raw snapshot: ${store.file} missing`);
    const lines = strFromU8(data)
      .split('\n')
      .filter((line) => line.length > 0);
    if (lines.length !== store.rowCount) {
      throw new Error(
        `raw snapshot: ${store.name} has ${lines.length} rows, manifest says ${store.rowCount}`,
      );
    }
    const keys: IDBValidKey[] = [];
    const values: unknown[] = [];
    for (const line of lines) {
      const parsed = JSON.parse(line) as { k: unknown; v: unknown };
      keys.push(fromTaggedTree(parsed.k, decodeBinary) as IDBValidKey);
      values.push(fromTaggedTree(parsed.v, decodeBinary));
    }
    const { rowCount: _rowCount, file: _file, ...schema } = store;
    return { schema, keys, values };
  });
  return { manifest, stores };
}

/**
 * 把原始快照原样写进一个**新**库（版本号与快照相同）。目标库已存在就拒绝。
 * Write a raw snapshot into a NEW database at the snapshot's native version. Refuses existing targets.
 */
export async function writeRawIdbSnapshotToNewDatabase(options: {
  factory?: IDBFactory;
  snapshot: ParsedRawIdbSnapshot;
  targetDbName: string;
}): Promise<void> {
  const factory = options.factory ?? defaultFactory();
  const existing = await openExistingDatabaseRaw(factory, options.targetDbName);
  if (existing) {
    existing.close();
    throw new Error(`${options.targetDbName} already exists; refusing to overwrite`);
  }
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(options.targetDbName, options.snapshot.manifest.nativeVersion);
    request.onupgradeneeded = () => {
      for (const store of options.snapshot.stores)
        createStoreFromSchema(request.result, store.schema);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('raw snapshot target open failed'));
    request.onblocked = () =>
      reject(new DOMException('raw snapshot target open blocked', 'BlockedError'));
  });
  try {
    for (const store of options.snapshot.stores) {
      if (store.values.length === 0) continue;
      const tx = db.transaction(store.schema.name, 'readwrite');
      const done = idbTransactionDone(tx);
      const objectStore = tx.objectStore(store.schema.name);
      store.values.forEach((value, i) => {
        if (store.schema.keyPath === null) objectStore.put(value, store.keys[i]);
        else objectStore.put(value);
      });
      await done;
    }
  } finally {
    db.close();
  }
}

/**
 * 浏览器里触发下载（被阻止的升级界面使用）。
 * Trigger a browser download (used by the blocked-upgrade UI).
 */
export function downloadRawRecoveryExport(result: RawIdbExportResult): void {
  const blob = new Blob([result.bytes as unknown as BlobPart], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = result.fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
