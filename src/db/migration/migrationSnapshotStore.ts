/**
 * 升级前快照：两个槽位轮换（rev5 8.2 / T42 / T45 / T55）
 * Pre-migration snapshots with two rotating slots (rev5 8.2 / T42 / T45 / T55)
 *
 * - 新快照写入空闲槽位；写完后重新打开，逐个 store 核对行数，并抽样读回核对 sha256。
 *   全部通过后才标为“已验证”，同一个事务里删除上一份。
 * - 新快照验证通过之前，上一份已验证快照一直保留。
 * - 配额预检按“两份同时存在”估算：上一份仍计在 usage 里，新快照必须能放进剩余空间。
 * - 写入中途失败（QuotaExceededError、AbortError、事务中止、连接关闭）：删掉不完整的槽位，
 *   保留上一份，由调用方按 D2 处理。启动时没有“已验证”标记的槽位视为残留并清理。
 * - 恢复时按快照里记录的结构重建主键与索引。
 * - 源库只读：任何失败都不会动源库（原件）。
 *
 * New snapshots go to the free slot, are re-opened and verified (row counts + sampled sha256),
 * then marked verified while the previous slot is deleted in the same transaction. Partial slots
 * are removed on failure; unverified leftovers are removed at startup. The source DB is read-only.
 */
import { canonicalSha256 } from './canonicalValue';
import {
  createStoreFromSchema,
  dumpDatabaseRaw,
  idbDeleteDatabase,
  idbRequest,
  idbTransactionDone,
  type RawStoreSchema,
} from './rawIdb';
import {
  classifyStorageFailure,
  describeStorageFailure,
  type StorageFailure,
} from './storageFailure';
import { dexieVersionFromNative, openExistingDatabaseRaw } from './versionDetection';

/** 快照库名（rev5 6.1“恢复快照、迁移备份”）| Snapshot DB name */
export const JIEYU_MIGRATION_SNAPSHOT_DB_NAME = 'jieyu_migration_snapshots' as const;
const SNAPSHOT_DB_VERSION = 1;
const SLOTS = 'slots';
const ROWS = 'rows';
const WRITE_BATCH_ROWS = 200;
const DEFAULT_SAMPLES_PER_STORE = 8;
/** 预检余量：新快照估算体积 × 1.2 | Precheck headroom */
const QUOTA_HEADROOM = 1.2;

export type SnapshotSlotId = 'A' | 'B';

export type SnapshotStoreMeta = RawStoreSchema & { rowCount: number };

export type SnapshotSample = { store: string; seq: number; sha256: string };

export type SnapshotSlotMeta = {
  slot: SnapshotSlotId;
  state: 'writing' | 'verified';
  sourceDb: string;
  nativeVersion: number;
  schemaVersion: number;
  createdAt: string;
  verifiedAt?: string;
  approxBytes: number;
  stores: SnapshotStoreMeta[];
  samples: SnapshotSample[];
};

type SnapshotRow = {
  slot: SnapshotSlotId;
  store: string;
  seq: number;
  key: IDBValidKey;
  value: unknown;
};

export type StorageEstimateFn = () => Promise<{ usage?: number; quota?: number } | undefined>;

export type SnapshotWriteHook = (info: { store: string; seq: number; tx: IDBTransaction }) => void;

export type TakeSnapshotOptions = {
  factory: IDBFactory;
  sourceDbName: string;
  snapshotDbName?: string;
  /** 配额预检；传 `null` 关闭 | Quota precheck; `null` disables it */
  estimate?: StorageEstimateFn | null;
  samplesPerStore?: number;
  now?: () => Date;
  /** 测试钩子：在写入每一行之前调用，可抛错或中止事务 | Test hook before each row write */
  beforeRowWrite?: SnapshotWriteHook;
};

export type SnapshotFailureKind =
  | 'quota-precheck'
  | 'source-missing'
  | 'write-failed'
  | 'verification-failed';

export type TakeSnapshotResult =
  | { status: 'verified'; meta: SnapshotSlotMeta; deletedPreviousSlot: SnapshotSlotId | null }
  | {
      status: 'failed';
      kind: SnapshotFailureKind;
      reason: string;
      storageFailure?: StorageFailure;
      /** 失败后仍然保留的上一份已验证快照 | Previous verified slot kept after the failure */
      previousVerifiedSlot: SnapshotSlotId | null;
    };

function openSnapshotDb(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, SNAPSHOT_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SLOTS)) db.createObjectStore(SLOTS, { keyPath: 'slot' });
      if (!db.objectStoreNames.contains(ROWS))
        db.createObjectStore(ROWS, { keyPath: ['slot', 'store', 'seq'] });
    };
    request.onsuccess = () => {
      const db = request.result;
      // 自己永远不阻塞别人 | never block others
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error(`failed to open ${name}`));
    request.onblocked = () => reject(new DOMException(`${name} open blocked`, 'BlockedError'));
  });
}

function slotRange(slot: SnapshotSlotId): IDBKeyRange {
  return IDBKeyRange.bound([slot], [slot, []]);
}

function storeRange(slot: SnapshotSlotId, store: string): IDBKeyRange {
  return IDBKeyRange.bound([slot, store], [slot, store, []]);
}

async function readSlots(db: IDBDatabase): Promise<SnapshotSlotMeta[]> {
  const tx = db.transaction(SLOTS, 'readonly');
  const done = idbTransactionDone(tx);
  const metas = (await idbRequest(tx.objectStore(SLOTS).getAll())) as SnapshotSlotMeta[];
  await done;
  return metas;
}

async function deleteSlot(db: IDBDatabase, slot: SnapshotSlotId): Promise<void> {
  const tx = db.transaction([SLOTS, ROWS], 'readwrite');
  const done = idbTransactionDone(tx);
  tx.objectStore(ROWS).delete(slotRange(slot));
  tx.objectStore(SLOTS).delete(slot);
  await done;
}

/** 没有 meta 的行所在槽位 | Slots that only have rows (no meta) */
async function orphanRowSlots(
  db: IDBDatabase,
  known: Set<SnapshotSlotId>,
): Promise<SnapshotSlotId[]> {
  const result: SnapshotSlotId[] = [];
  for (const slot of ['A', 'B'] as const) {
    if (known.has(slot)) continue;
    const tx = db.transaction(ROWS, 'readonly');
    const done = idbTransactionDone(tx);
    const count = await idbRequest(tx.objectStore(ROWS).count(slotRange(slot)));
    await done;
    if (count > 0) result.push(slot);
  }
  return result;
}

/**
 * 清理没有“已验证”标记的槽位（写了一半、标签页被关掉等）。返回被清理的槽位。
 * Remove slots without the verified marker (half-written, tab closed…). Returns removed slots.
 */
export async function cleanupUnverifiedSnapshots(
  factory: IDBFactory,
  snapshotDbName: string = JIEYU_MIGRATION_SNAPSHOT_DB_NAME,
): Promise<SnapshotSlotId[]> {
  const db = await openSnapshotDb(factory, snapshotDbName);
  try {
    const metas = await readSlots(db);
    const removed: SnapshotSlotId[] = [];
    for (const meta of metas) {
      if (meta.state !== 'verified') {
        await deleteSlot(db, meta.slot);
        removed.push(meta.slot);
      }
    }
    const orphans = await orphanRowSlots(db, new Set(metas.map((meta) => meta.slot)));
    for (const slot of orphans) {
      await deleteSlot(db, slot);
      removed.push(slot);
    }
    return removed;
  } finally {
    db.close();
  }
}

/** 列出槽位（诊断与界面用）| List slots (diagnostics / UI) */
export async function listSnapshotSlots(
  factory: IDBFactory,
  snapshotDbName: string = JIEYU_MIGRATION_SNAPSHOT_DB_NAME,
): Promise<SnapshotSlotMeta[]> {
  const db = await openSnapshotDb(factory, snapshotDbName);
  try {
    return (await readSlots(db)).sort((a, b) => a.slot.localeCompare(b.slot));
  } finally {
    db.close();
  }
}

function approxSizeOf(value: unknown, depth = 0): number {
  if (value === null || value === undefined) return 4;
  if (typeof value === 'string') return value.length * 2;
  if (typeof value === 'number' || typeof value === 'boolean') return 8;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return value.size;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (depth > 32) return 0;
  if (Array.isArray(value))
    return value.reduce<number>((sum, item) => sum + approxSizeOf(item, depth + 1), 16);
  if (typeof value === 'object') {
    let sum = 16;
    for (const [key, item] of Object.entries(value as Record<string, unknown>))
      sum += key.length * 2 + approxSizeOf(item, depth + 1);
    return sum;
  }
  return 8;
}

function sampleSeqs(rowCount: number, samples: number): number[] {
  if (rowCount <= 0 || samples <= 0) return [];
  if (rowCount <= samples) return Array.from({ length: rowCount }, (_, i) => i);
  const picked = new Set<number>([0, rowCount - 1]);
  for (let i = 1; picked.size < samples && i < samples; i += 1) {
    picked.add(Math.floor((i * (rowCount - 1)) / (samples - 1)));
  }
  return [...picked].sort((a, b) => a - b);
}

function hasBinary(value: unknown, depth = 0): boolean {
  if (typeof Blob !== 'undefined' && value instanceof Blob) return true;
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return true;
  if (depth > 16 || value === null || typeof value !== 'object') return false;
  return Object.values(value as Record<string, unknown>).some((item) => hasBinary(item, depth + 1));
}

/** 抽样：均匀取样，并补上前几条带二进制的行（核对字节）| Even samples plus the first binary-bearing rows */
function pickSamples(values: unknown[], samples: number): number[] {
  const picked = new Set(sampleSeqs(values.length, samples));
  let binaryExtra = 0;
  for (
    let seq = 0;
    seq < values.length && binaryExtra < Math.max(1, Math.floor(samples / 2));
    seq += 1
  ) {
    if (hasBinary(values[seq])) {
      if (!picked.has(seq)) picked.add(seq);
      binaryExtra += 1;
    }
  }
  return [...picked].sort((a, b) => a - b);
}

async function rowDigest(key: IDBValidKey, value: unknown): Promise<string> {
  return canonicalSha256({ key, value });
}

/**
 * 写一份新快照并验证。源库不存在时返回 `source-missing`（全新安装不需要快照）。
 * Write and verify a new snapshot. Returns `source-missing` when the source DB does not exist.
 */
export async function takeVerifiedSnapshot(
  options: TakeSnapshotOptions,
): Promise<TakeSnapshotResult> {
  const snapshotDbName = options.snapshotDbName ?? JIEYU_MIGRATION_SNAPSHOT_DB_NAME;
  const now = options.now ?? (() => new Date());
  const samplesPerStore = options.samplesPerStore ?? DEFAULT_SAMPLES_PER_STORE;
  const { factory } = options;

  let snapshotDb: IDBDatabase;
  try {
    await cleanupUnverifiedSnapshots(factory, snapshotDbName);
    snapshotDb = await openSnapshotDb(factory, snapshotDbName);
  } catch (error) {
    const storageFailure = classifyStorageFailure(error);
    return {
      status: 'failed',
      kind: 'write-failed',
      reason: describeStorageFailure(storageFailure),
      storageFailure,
      previousVerifiedSlot: null,
    };
  }

  let previousVerifiedSlot: SnapshotSlotId | null = null;
  let freeSlot: SnapshotSlotId = 'A';
  try {
    const metas = await readSlots(snapshotDb);
    const verified = metas
      .filter((meta) => meta.state === 'verified')
      .sort((a, b) => (a.verifiedAt ?? a.createdAt).localeCompare(b.verifiedAt ?? b.createdAt));
    const newest = verified[verified.length - 1];
    previousVerifiedSlot = newest?.slot ?? null;
    freeSlot = previousVerifiedSlot === 'A' ? 'B' : 'A';
    // 理论上不会两槽都已验证；若有，较旧的一份让位 | both verified should not happen; the older one yields
    if (verified.length > 1) await deleteSlot(snapshotDb, freeSlot);
  } catch (error) {
    snapshotDb.close();
    const storageFailure = classifyStorageFailure(error);
    return {
      status: 'failed',
      kind: 'write-failed',
      reason: describeStorageFailure(storageFailure),
      storageFailure,
      previousVerifiedSlot,
    };
  }

  const fail = async (
    kind: SnapshotFailureKind,
    reason: string,
    storageFailure?: StorageFailure,
  ): Promise<TakeSnapshotResult> => {
    // 只删自己写了一半的槽位，上一份保持不动 | remove only our partial slot; keep the previous one
    try {
      await deleteSlot(snapshotDb, freeSlot);
    } catch {
      // 留给下次启动的残留清理 | left for the startup leftover cleanup
    }
    snapshotDb.close();
    return {
      status: 'failed',
      kind,
      reason,
      ...(storageFailure ? { storageFailure } : {}),
      previousVerifiedSlot,
    };
  };

  // 1. 只读读取源库 | 1. read the source read-only
  let source: IDBDatabase | null;
  try {
    source = await openExistingDatabaseRaw(factory, options.sourceDbName);
  } catch (error) {
    const storageFailure = classifyStorageFailure(error);
    return fail(
      'write-failed',
      `cannot open source: ${describeStorageFailure(storageFailure)}`,
      storageFailure,
    );
  }
  if (!source) return fail('source-missing', `${options.sourceDbName} does not exist`);
  let dumps;
  const nativeVersion = source.version;
  try {
    dumps = await dumpDatabaseRaw(source);
  } catch (error) {
    const storageFailure = classifyStorageFailure(error);
    return fail(
      'write-failed',
      `cannot read source: ${describeStorageFailure(storageFailure)}`,
      storageFailure,
    );
  } finally {
    source.close();
  }

  const approxBytes = dumps.reduce(
    (sum, dump) =>
      sum +
      dump.values.reduce<number>(
        (acc, value, i) => acc + approxSizeOf(value) + approxSizeOf(dump.keys[i]),
        0,
      ),
    0,
  );

  // 2. 配额预检（两份同时存在）| 2. quota precheck (two copies coexist)
  if (options.estimate !== null) {
    const estimateFn: StorageEstimateFn =
      options.estimate ??
      (async () =>
        typeof navigator !== 'undefined' && typeof navigator.storage?.estimate === 'function'
          ? navigator.storage.estimate()
          : undefined);
    let estimate: { usage?: number; quota?: number } | undefined;
    try {
      estimate = await estimateFn();
    } catch {
      estimate = undefined;
    }
    if (estimate && typeof estimate.quota === 'number' && typeof estimate.usage === 'number') {
      const free = estimate.quota - estimate.usage;
      const required = Math.ceil(approxBytes * QUOTA_HEADROOM);
      if (free < required) {
        return fail(
          'quota-precheck',
          `quota precheck failed: need ~${required} bytes with the previous snapshot kept, ${free} free`,
        );
      }
    }
  }

  // 3. 写入空闲槽位 | 3. write into the free slot
  const createdAt = now().toISOString();
  const samples: SnapshotSample[] = [];
  const storesMeta: SnapshotStoreMeta[] = dumps.map((dump) => ({
    ...dump.schema,
    rowCount: dump.values.length,
  }));
  const writingMeta: SnapshotSlotMeta = {
    slot: freeSlot,
    state: 'writing',
    sourceDb: options.sourceDbName,
    nativeVersion,
    schemaVersion: dexieVersionFromNative(nativeVersion),
    createdAt,
    approxBytes,
    stores: storesMeta,
    samples,
  };
  try {
    for (const dump of dumps) {
      for (const seq of pickSamples(dump.values, samplesPerStore)) {
        samples.push({
          store: dump.schema.name,
          seq,
          sha256: await rowDigest(dump.keys[seq]!, dump.values[seq]),
        });
      }
    }
    {
      const tx = snapshotDb.transaction(SLOTS, 'readwrite');
      const done = idbTransactionDone(tx);
      tx.objectStore(SLOTS).put(writingMeta);
      await done;
    }
    for (const dump of dumps) {
      for (let start = 0; start < dump.values.length; start += WRITE_BATCH_ROWS) {
        const tx = snapshotDb.transaction(ROWS, 'readwrite');
        const done = idbTransactionDone(tx);
        const rows = tx.objectStore(ROWS);
        const end = Math.min(start + WRITE_BATCH_ROWS, dump.values.length);
        try {
          for (let seq = start; seq < end; seq += 1) {
            options.beforeRowWrite?.({ store: dump.schema.name, seq, tx });
            const row: SnapshotRow = {
              slot: freeSlot,
              store: dump.schema.name,
              seq,
              key: dump.keys[seq]!,
              value: dump.values[seq],
            };
            rows.put(row);
          }
        } catch (error) {
          try {
            tx.abort();
          } catch {
            // already aborted
          }
          const abortError = await done.then(
            () => null,
            (reason: unknown) => reason,
          );
          // 事务先被中止时，后续 put 报 TransactionInactiveError；如实报告中止本身 | report the abort itself
          const name = error instanceof Error || error instanceof DOMException ? error.name : '';
          throw name === 'TransactionInactiveError' &&
            abortError !== null &&
            abortError !== undefined
            ? abortError
            : error;
        }
        await done;
      }
    }
  } catch (error) {
    const storageFailure = classifyStorageFailure(error);
    return fail('write-failed', describeStorageFailure(storageFailure), storageFailure);
  }

  // 4. 重新打开并验证 | 4. re-open and verify
  snapshotDb.close();
  try {
    snapshotDb = await openSnapshotDb(factory, snapshotDbName);
  } catch (error) {
    // 打不开就无法清理；残留的 'writing' 槽位由下次启动清理 | leftover 'writing' slot is cleaned at next startup
    const storageFailure = classifyStorageFailure(error);
    return {
      status: 'failed',
      kind: 'verification-failed',
      reason: describeStorageFailure(storageFailure),
      storageFailure,
      previousVerifiedSlot,
    };
  }
  try {
    const tx = snapshotDb.transaction([SLOTS, ROWS], 'readonly');
    const done = idbTransactionDone(tx);
    const rows = tx.objectStore(ROWS);
    // 所有请求同步发出再等待 | issue every request before awaiting
    const metaRequest = idbRequest(tx.objectStore(SLOTS).get(freeSlot)) as Promise<
      SnapshotSlotMeta | undefined
    >;
    const countRequests = storesMeta.map((store) =>
      idbRequest(rows.count(storeRange(freeSlot, store.name))),
    );
    const sampleRequests = samples.map(
      (sample) =>
        idbRequest(rows.get([freeSlot, sample.store, sample.seq])) as Promise<
          SnapshotRow | undefined
        >,
    );
    const meta = await metaRequest;
    const counts = await Promise.all(countRequests);
    const sampledRows = await Promise.all(sampleRequests);
    await done;
    if (!meta || meta.state !== 'writing')
      return fail('verification-failed', 'slot meta missing after write');
    for (let i = 0; i < storesMeta.length; i += 1) {
      if (counts[i] !== storesMeta[i]!.rowCount) {
        return fail(
          'verification-failed',
          `row count mismatch in ${storesMeta[i]!.name}: ${counts[i]} != ${storesMeta[i]!.rowCount}`,
        );
      }
    }
    for (let i = 0; i < samples.length; i += 1) {
      const row = sampledRows[i];
      if (!row || (await rowDigest(row.key, row.value)) !== samples[i]!.sha256) {
        return fail(
          'verification-failed',
          `sha256 mismatch in ${samples[i]!.store}#${samples[i]!.seq}`,
        );
      }
    }
  } catch (error) {
    const storageFailure = classifyStorageFailure(error);
    return fail('verification-failed', describeStorageFailure(storageFailure), storageFailure);
  }

  // 5. 标为已验证，同一事务里删除上一份 | 5. mark verified and delete the previous slot atomically
  const verifiedMeta: SnapshotSlotMeta = {
    ...writingMeta,
    state: 'verified',
    verifiedAt: now().toISOString(),
  };
  try {
    const tx = snapshotDb.transaction([SLOTS, ROWS], 'readwrite');
    const done = idbTransactionDone(tx);
    tx.objectStore(SLOTS).put(verifiedMeta);
    if (previousVerifiedSlot !== null) {
      tx.objectStore(ROWS).delete(slotRange(previousVerifiedSlot));
      tx.objectStore(SLOTS).delete(previousVerifiedSlot);
    }
    await done;
  } catch (error) {
    const storageFailure = classifyStorageFailure(error);
    return fail('write-failed', describeStorageFailure(storageFailure), storageFailure);
  }
  snapshotDb.close();
  return { status: 'verified', meta: verifiedMeta, deletedPreviousSlot: previousVerifiedSlot };
}

export type RestoreSnapshotOptions = {
  factory: IDBFactory;
  /** 恢复目标库名 | Target database name */
  targetDbName: string;
  snapshotDbName?: string;
  /** 默认取最新的已验证槽位 | Defaults to the newest verified slot */
  slot?: SnapshotSlotId;
  /** 目标库已存在时先删除（调用方须确认没有其他连接）| Delete an existing target first */
  replaceExisting?: boolean;
};

export type RestoreSnapshotResult = {
  slot: SnapshotSlotId;
  nativeVersion: number;
  restoredRows: Record<string, number>;
};

/**
 * 用已验证快照恢复（T42）：按记录的结构重建主键和索引，再写回所有行。快照本身不变。
 * Restore from a verified snapshot (T42): rebuild keys and indexes, then write rows back.
 */
export async function restoreSnapshot(
  options: RestoreSnapshotOptions,
): Promise<RestoreSnapshotResult> {
  const snapshotDbName = options.snapshotDbName ?? JIEYU_MIGRATION_SNAPSHOT_DB_NAME;
  const { factory } = options;
  const snapshotDb = await openSnapshotDb(factory, snapshotDbName);
  try {
    const metas = (await readSlots(snapshotDb)).filter((meta) => meta.state === 'verified');
    const meta =
      options.slot !== undefined
        ? metas.find((candidate) => candidate.slot === options.slot)
        : metas.sort((a, b) => (a.verifiedAt ?? '').localeCompare(b.verifiedAt ?? '')).pop();
    if (!meta) throw new Error('no verified snapshot slot to restore from');

    const existing = await openExistingDatabaseRaw(factory, options.targetDbName);
    if (existing) {
      existing.close();
      if (options.replaceExisting !== true)
        throw new Error(
          `${options.targetDbName} already exists; pass replaceExisting to overwrite`,
        );
      await idbDeleteDatabase(factory, options.targetDbName, true);
    }

    const target = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(options.targetDbName, meta.nativeVersion);
      request.onupgradeneeded = () => {
        for (const store of meta.stores) createStoreFromSchema(request.result, store);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('restore open failed'));
      request.onblocked = () => reject(new DOMException('restore open blocked', 'BlockedError'));
    });
    const restoredRows: Record<string, number> = {};
    try {
      for (const store of meta.stores) {
        const readTx = snapshotDb.transaction(ROWS, 'readonly');
        const readDone = idbTransactionDone(readTx);
        const rows = (await idbRequest(
          readTx.objectStore(ROWS).getAll(storeRange(meta.slot, store.name)),
        )) as SnapshotRow[];
        await readDone;
        for (let start = 0; start < rows.length; start += WRITE_BATCH_ROWS) {
          const tx = target.transaction(store.name, 'readwrite');
          const done = idbTransactionDone(tx);
          const objectStore = tx.objectStore(store.name);
          for (const row of rows.slice(start, start + WRITE_BATCH_ROWS)) {
            if (store.keyPath === null) objectStore.put(row.value, row.key);
            else objectStore.put(row.value);
          }
          await done;
        }
        restoredRows[store.name] = rows.length;
      }
    } finally {
      target.close();
    }
    return { slot: meta.slot, nativeVersion: meta.nativeVersion, restoredRows };
  } finally {
    snapshotDb.close();
  }
}
