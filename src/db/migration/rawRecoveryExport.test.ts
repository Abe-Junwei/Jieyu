/**
 * 原始恢复导出（rev5 8.2）：不经过 getDb、原生版本号不变、含字节、可原样写回。
 * Raw recovery export (rev5 8.2): bypasses getDb, keeps the native version, carries bytes, restorable.
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import {
  exportRawIdbSnapshot,
  parseRawIdbSnapshot,
  rawRecoveryFileName,
  writeRawIdbSnapshotToNewDatabase,
} from './rawRecoveryExport';
import { idbDeleteDatabase } from './rawIdb';
import { createRawSourceDb, RAW_SOURCE_ITEM_COUNT, readAllRaw } from './__fixtures__/rawSourceDb';
import { canonicalSha256 } from './canonicalValue';
import { detectInstalledDatabase } from './versionDetection';
import { JYB_PACKAGE_POLICY } from '../../services/JybService';

const SOURCE = 'raw-export-source';
const TARGET = 'raw-export-target';

afterEach(async () => {
  await idbDeleteDatabase(indexedDB, SOURCE);
  await idbDeleteDatabase(indexedDB, TARGET);
});

describe('raw recovery export', () => {
  it('writes a raw-idb manifest with native / Dexie versions and per-store row counts', async () => {
    await createRawSourceDb(indexedDB, SOURCE, 20);
    const result = await exportRawIdbSnapshot({
      factory: indexedDB,
      dbName: SOURCE,
      appSchemaVersion: 1,
      reason: 'migration-blocked',
      now: () => new Date('2026-10-09T01:00:00.000Z'),
    });
    expect(result.manifest).toMatchObject({
      kind: 'raw-idb',
      dbName: SOURCE,
      nativeVersion: 20,
      dexieVersion: 2,
      appSchemaVersion: 1,
      reason: 'migration-blocked',
      binaryFileCount: 2,
    });
    expect(
      Object.fromEntries(result.manifest.stores.map((store) => [store.name, store.rowCount])),
    ).toEqual({
      blobs: 2,
      empty: 0,
      items: RAW_SOURCE_ITEM_COUNT,
    });
    expect(result.fileName).toBe(rawRecoveryFileName(result.manifest));
    const entries = unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
    expect(Object.keys(entries).filter((path) => path.startsWith('blobs/'))).toHaveLength(2);
    // 字节原样在包里 | raw bytes are in the archive
    expect([...entries['blobs/000001.bin']!]).toEqual([1, 2, 3, 250]);
  });

  it('does not change the source native version and refuses a missing database without creating it', async () => {
    await createRawSourceDb(indexedDB, SOURCE, 20);
    await exportRawIdbSnapshot({ factory: indexedDB, dbName: SOURCE });
    expect(await detectInstalledDatabase(indexedDB, SOURCE)).toMatchObject({ nativeVersion: 20 });
    await expect(
      exportRawIdbSnapshot({ factory: indexedDB, dbName: 'raw-export-missing' }),
    ).rejects.toThrow(/does not exist/);
    expect(await detectInstalledDatabase(indexedDB, 'raw-export-missing')).toEqual({
      exists: false,
    });
  });

  it('round-trips into a new database at the same version with identical rows, keys and indexes', async () => {
    await createRawSourceDb(indexedDB, SOURCE, 20);
    const result = await exportRawIdbSnapshot({ factory: indexedDB, dbName: SOURCE });
    const parsed = await parseRawIdbSnapshot(result.blob, JYB_PACKAGE_POLICY);
    await writeRawIdbSnapshotToNewDatabase({
      factory: indexedDB,
      snapshot: parsed,
      targetDbName: TARGET,
    });
    expect(await detectInstalledDatabase(indexedDB, TARGET)).toMatchObject({ nativeVersion: 20 });
    for (const store of ['items', 'blobs']) {
      const a = await readAllRaw(indexedDB, SOURCE, store);
      const b = await readAllRaw(indexedDB, TARGET, store);
      expect(await canonicalSha256(b), store).toBe(await canonicalSha256(a));
    }
    await expect(
      writeRawIdbSnapshotToNewDatabase({
        factory: indexedDB,
        snapshot: parsed,
        targetDbName: TARGET,
      }),
    ).rejects.toThrow(/already exists/);
  });

  it('rejects archives that are not raw-idb snapshots or whose row counts disagree', async () => {
    await createRawSourceDb(indexedDB, SOURCE, 10, 3);
    const result = await exportRawIdbSnapshot({ factory: indexedDB, dbName: SOURCE });
    const { zipSync, strToU8, strFromU8 } = await import('fflate');
    const entries = unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
    const manifest = JSON.parse(strFromU8(entries['manifest.json']!)) as Record<string, unknown>;
    const wrongKind = zipSync({
      ...entries,
      'manifest.json': strToU8(JSON.stringify({ ...manifest, kind: 'jyb' })),
    });
    await expect(parseRawIdbSnapshot(wrongKind, JYB_PACKAGE_POLICY)).rejects.toThrow(
      /unexpected kind/,
    );
    const stores = (manifest.stores as Array<Record<string, unknown>>).map((store) =>
      store.name === 'items' ? { ...store, rowCount: 99 } : store,
    );
    const wrongCount = zipSync({
      ...entries,
      'manifest.json': strToU8(JSON.stringify({ ...manifest, stores })),
    });
    await expect(parseRawIdbSnapshot(wrongCount, JYB_PACKAGE_POLICY)).rejects.toThrow(
      /manifest says 99/,
    );
  });
});
