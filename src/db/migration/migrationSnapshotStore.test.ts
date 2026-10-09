/**
 * 两槽位快照（rev5 8.2）：T42 恢复、T45 配额预检、T55 中途失败与残留清理。
 * Two-slot snapshots (rev5 8.2): T42 restore, T45 quota precheck, T55 mid-write failure + leftovers.
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupUnverifiedSnapshots,
  listSnapshotSlots,
  restoreSnapshot,
  takeVerifiedSnapshot,
} from './migrationSnapshotStore';
import { idbDeleteDatabase, idbTransactionDone, readStoreSchema } from './rawIdb';
import { createRawSourceDb, RAW_SOURCE_ITEM_COUNT, readAllRaw } from './__fixtures__/rawSourceDb';
import { canonicalSha256 } from './canonicalValue';

const SOURCE = 'snap-test-source';
const SNAP = 'snap-test-snapshots';
const RESTORED = 'snap-test-restored';

afterEach(async () => {
  for (const name of [SOURCE, SNAP, RESTORED]) await idbDeleteDatabase(indexedDB, name);
});

async function sourceFingerprint(): Promise<string> {
  const items = await readAllRaw(indexedDB, SOURCE, 'items');
  const blobs = await readAllRaw(indexedDB, SOURCE, 'blobs');
  return canonicalSha256({ items, blobs });
}

async function snapshot(extra: Partial<Parameters<typeof takeVerifiedSnapshot>[0]> = {}) {
  return takeVerifiedSnapshot({
    factory: indexedDB,
    sourceDbName: SOURCE,
    snapshotDbName: SNAP,
    estimate: null,
    ...extra,
  });
}

describe('two-slot migration snapshots', () => {
  it('writes, verifies and rotates: the previous slot is deleted only after the new one is verified', async () => {
    await createRawSourceDb(indexedDB, SOURCE);
    const first = await snapshot();
    expect(first.status).toBe('verified');
    if (first.status !== 'verified') return;
    expect(first.meta.slot).toBe('A');
    expect(first.deletedPreviousSlot).toBeNull();
    expect(first.meta.nativeVersion).toBe(10);
    expect(first.meta.schemaVersion).toBe(1);
    expect(
      Object.fromEntries(first.meta.stores.map((store) => [store.name, store.rowCount])),
    ).toEqual({
      blobs: 2,
      empty: 0,
      items: RAW_SOURCE_ITEM_COUNT,
    });
    // 抽样包含带二进制的行 | samples include binary-bearing rows
    expect(first.meta.samples.some((sample) => sample.store === 'blobs')).toBe(true);

    const second = await snapshot();
    expect(second.status).toBe('verified');
    if (second.status !== 'verified') return;
    expect(second.meta.slot).toBe('B');
    expect(second.deletedPreviousSlot).toBe('A');
    const slots = await listSnapshotSlots(indexedDB, SNAP);
    expect(slots.map((slot) => [slot.slot, slot.state])).toEqual([['B', 'verified']]);
  });

  it('returns source-missing for a fresh install and leaves no slot behind', async () => {
    const result = await snapshot();
    expect(result).toMatchObject({
      status: 'failed',
      kind: 'source-missing',
      previousVerifiedSlot: null,
    });
    expect(await listSnapshotSlots(indexedDB, SNAP)).toEqual([]);
  });

  it.each([
    [
      'QuotaExceededError',
      (tx: IDBTransaction) => {
        void tx;
        throw new DOMException('simulated quota', 'QuotaExceededError');
      },
      'quota-exceeded',
    ],
    [
      'AbortError (transaction aborted)',
      (tx: IDBTransaction) => {
        tx.abort();
      },
      'aborted',
    ],
  ] as const)(
    'T55: %s mid-write removes the partial slot and keeps the previous verified one',
    async (_label, inject, kind) => {
      await createRawSourceDb(indexedDB, SOURCE);
      const first = await snapshot();
      expect(first.status).toBe('verified');
      const before = await sourceFingerprint();

      const failed = await snapshot({
        beforeRowWrite: ({ store, seq, tx }) => {
          if (store === 'items' && seq === 250) inject(tx);
        },
      });
      expect(failed).toMatchObject({
        status: 'failed',
        kind: 'write-failed',
        previousVerifiedSlot: 'A',
      });
      if (failed.status === 'failed') expect(failed.storageFailure?.kind).toBe(kind);
      const slots = await listSnapshotSlots(indexedDB, SNAP);
      expect(slots.map((slot) => [slot.slot, slot.state])).toEqual([['A', 'verified']]);
      // 原件不动 | the source is untouched
      expect(await sourceFingerprint()).toBe(before);
    },
  );

  it('T55: a tab closed mid-write leaves an unverified slot that the next startup cleans up', async () => {
    await createRawSourceDb(indexedDB, SOURCE);
    const first = await snapshot();
    expect(first.status).toBe('verified');
    // 模拟写到一半标签页被关：直接留下 'writing' 槽位和孤儿行 | simulate a half-written slot + orphan rows
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(SNAP, 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(['slots', 'rows'], 'readwrite');
    const done = idbTransactionDone(tx);
    tx.objectStore('slots').put({ slot: 'B', state: 'writing', stores: [], samples: [] });
    tx.objectStore('rows').put({ slot: 'B', store: 'items', seq: 0, key: 'k', value: { id: 'k' } });
    await done;
    db.close();
    expect((await listSnapshotSlots(indexedDB, SNAP)).map((slot) => slot.slot)).toEqual(['A', 'B']);

    expect(await cleanupUnverifiedSnapshots(indexedDB, SNAP)).toEqual(['B']);
    const slots = await listSnapshotSlots(indexedDB, SNAP);
    expect(slots.map((slot) => [slot.slot, slot.state])).toEqual([['A', 'verified']]);
  });

  it('T45: the quota precheck assumes two coexisting snapshots and keeps the previous verified one', async () => {
    await createRawSourceDb(indexedDB, SOURCE);
    const first = await snapshot();
    expect(first.status).toBe('verified');
    if (first.status !== 'verified') return;
    // 剩余空间只够一份的一半 | free space is only half of one copy
    const failed = await snapshot({
      estimate: async () => ({
        quota: 1_000_000,
        usage: 1_000_000 - Math.floor(first.meta.approxBytes / 2),
      }),
    });
    expect(failed).toMatchObject({
      status: 'failed',
      kind: 'quota-precheck',
      previousVerifiedSlot: 'A',
    });
    const slots = await listSnapshotSlots(indexedDB, SNAP);
    expect(slots.map((slot) => [slot.slot, slot.state])).toEqual([['A', 'verified']]);
    // 空间足够时通过 | passes with enough room
    const ok = await snapshot({ estimate: async () => ({ quota: 10 ** 12, usage: 0 }) });
    expect(ok.status).toBe('verified');
  });

  it('T42: restore rebuilds primary keys and indexes, restores rows and keeps the snapshot', async () => {
    await createRawSourceDb(indexedDB, SOURCE);
    const taken = await snapshot();
    expect(taken.status).toBe('verified');

    const result = await restoreSnapshot({
      factory: indexedDB,
      snapshotDbName: SNAP,
      targetDbName: RESTORED,
    });
    expect(result).toMatchObject({
      slot: 'A',
      nativeVersion: 10,
      restoredRows: { items: RAW_SOURCE_ITEM_COUNT, blobs: 2, empty: 0 },
    });

    const open = (name: string) =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const [source, restored] = await Promise.all([open(SOURCE), open(RESTORED)]);
    try {
      expect(restored.version).toBe(source.version);
      const names = [...source.objectStoreNames].sort();
      expect([...restored.objectStoreNames].sort()).toEqual(names);
      const sourceTx = source.transaction(names, 'readonly');
      const restoredTx = restored.transaction(names, 'readonly');
      for (const name of names) {
        expect(readStoreSchema(restoredTx.objectStore(name)), name).toEqual(
          readStoreSchema(sourceTx.objectStore(name)),
        );
      }
    } finally {
      source.close();
      restored.close();
    }
    for (const store of ['items', 'blobs']) {
      const a = await readAllRaw(indexedDB, SOURCE, store);
      const b = await readAllRaw(indexedDB, RESTORED, store);
      expect(await canonicalSha256(b), store).toBe(await canonicalSha256(a));
    }
    // 唯一索引在恢复后仍然生效 | the unique index is enforced after restore
    const restoredDb = await open(RESTORED);
    const tx = restoredDb.transaction('items', 'readwrite');
    const dup = tx.objectStore('items').add({ id: 'dup', code: 'code-1', tags: [] });
    const outcome = await new Promise<string>((resolve) => {
      dup.onerror = (event) => {
        event.preventDefault();
        resolve(dup.error?.name ?? 'error');
      };
      dup.onsuccess = () => resolve('ok');
    });
    restoredDb.close();
    expect(outcome).toBe('ConstraintError');

    // 上一份已验证快照仍在 | the verified snapshot is still there
    expect(
      (await listSnapshotSlots(indexedDB, SNAP)).map((slot) => [slot.slot, slot.state]),
    ).toEqual([['A', 'verified']]);
  });

  it('T42: restore refuses to overwrite an existing target unless asked, then replaces it', async () => {
    await createRawSourceDb(indexedDB, SOURCE);
    expect((await snapshot()).status).toBe('verified');
    await createRawSourceDb(indexedDB, RESTORED, 20, 3);
    await expect(
      restoreSnapshot({ factory: indexedDB, snapshotDbName: SNAP, targetDbName: RESTORED }),
    ).rejects.toThrow(/already exists/);
    const result = await restoreSnapshot({
      factory: indexedDB,
      snapshotDbName: SNAP,
      targetDbName: RESTORED,
      replaceExisting: true,
    });
    expect(result.nativeVersion).toBe(10);
    expect((await readAllRaw(indexedDB, RESTORED, 'items')).values).toHaveLength(
      RAW_SOURCE_ITEM_COUNT,
    );
  });
});
