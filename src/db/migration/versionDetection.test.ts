/** T38（版本检测部分）：合成 v1 → v2 夹具锁定 Dexie 版本号 | T38 version detection on a synthetic v1 → v2 fixture */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import {
  compareInstalledVersion,
  detectInstalledDatabase,
  dexieVersionFromNative,
  nativeVersionFromDexie,
} from './versionDetection';
import { applyJieyuSchemaVersions } from './schemaVersions';
import { SYNTH_LEDGER_ADDITIVE, SYNTH_V1 } from './__fixtures__/syntheticLedgers';

const NAME = 'jieyu-synth-version-detection';

afterEach(async () => {
  await Dexie.delete(NAME);
});

describe('version detection', () => {
  it('maps native ↔ Dexie versions (native = Dexie × 10)', () => {
    expect(dexieVersionFromNative(10)).toBe(1);
    expect(dexieVersionFromNative(20)).toBe(2);
    expect(nativeVersionFromDexie(2)).toBe(20);
  });

  it('reports a missing database without creating it', async () => {
    expect(await detectInstalledDatabase(indexedDB, NAME)).toEqual({ exists: false });
    const names = (await indexedDB.databases()).map((info) => info.name);
    expect(names).not.toContain(NAME);
  });

  it('reports a missing database without creating it when databases() is unavailable', async () => {
    const factoryWithoutList = {
      open: (name: string, version?: number) => indexedDB.open(name, version),
      deleteDatabase: (name: string) => indexedDB.deleteDatabase(name),
      cmp: (a: unknown, b: unknown) => indexedDB.cmp(a, b),
    } as unknown as IDBFactory;
    expect(await detectInstalledDatabase(factoryWithoutList, NAME)).toEqual({ exists: false });
    const names = (await indexedDB.databases()).map((info) => info.name);
    expect(names).not.toContain(NAME);
  });

  it('detects the synthetic v1 install and then v2 after the upgrade', async () => {
    const v1 = new Dexie(NAME);
    applyJieyuSchemaVersions(v1, [SYNTH_V1]);
    await v1.open();
    v1.close();
    const before = await detectInstalledDatabase(indexedDB, NAME);
    expect(before).toMatchObject({
      exists: true,
      nativeVersion: 10,
      schemaVersion: 1,
      patched: false,
    });
    expect(compareInstalledVersion(before, 2)).toEqual({
      kind: 'upgrade',
      installed: 1,
      target: 2,
    });

    const v2 = new Dexie(NAME);
    applyJieyuSchemaVersions(v2, SYNTH_LEDGER_ADDITIVE);
    await v2.open();
    v2.close();
    const after = await detectInstalledDatabase(indexedDB, NAME);
    expect(after).toMatchObject({ exists: true, nativeVersion: 20, schemaVersion: 2 });
    if (after.exists) expect(after.storeNames).toEqual(['items', 'notes', 'tags']);
    expect(compareInstalledVersion(after, 2).kind).toBe('current');
    expect(compareInstalledVersion(after, 1).kind).toBe('data-newer-than-app');
  });

  it('a fresh install compares as fresh-install', () => {
    expect(compareInstalledVersion({ exists: false }, 1)).toEqual({
      kind: 'fresh-install',
      target: 1,
    });
  });
});
