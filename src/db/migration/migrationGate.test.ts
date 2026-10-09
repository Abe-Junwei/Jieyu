/**
 * 迁移闸门（rev5 8.2）：T38 additive、T39 rewriting 快照失败被阻止、T54 多标签页、数据比代码新。
 * 合成 v1 → v2 夹具，fake-indexeddb 中用多个连接模拟多个标签页。
 * Migration gate (rev5 8.2): T38 additive, T39 blocked rewriting, T54 multi-tab, newer data.
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import {
  JieyuMigrationGateError,
  openThroughMigrationGate,
  type MigrationGateParams,
} from './migrationGate';
import { resolveMigrationPolicy } from './migrationPolicy';
import { applyJieyuSchemaVersions, type JieyuSchemaVersion } from './schemaVersions';
import {
  createUpgradeGuardedFactory,
  installStaleConnectionHandlers,
  UpgradeGuard,
  type ChannelFactory,
  type ChannelLike,
  type LockManagerLike,
} from './upgradeCoordinator';
import { listSnapshotSlots } from './migrationSnapshotStore';
import { detectInstalledDatabase } from './versionDetection';
import { idbDeleteDatabase } from './rawIdb';
import { exportRawIdbSnapshot } from './rawRecoveryExport';
import {
  SYNTH_LEDGER_ADDITIVE,
  SYNTH_LEDGER_REWRITING,
  SYNTH_V1,
} from './__fixtures__/syntheticLedgers';

const NAME = 'gate-synth-main';
const SNAP = 'gate-synth-snapshots';

const opened: Dexie[] = [];

afterEach(async () => {
  for (const dexie of opened.splice(0)) dexie.close();
  await idbDeleteDatabase(indexedDB, NAME);
  await idbDeleteDatabase(indexedDB, SNAP);
});

function makeDexie(ledger: readonly JieyuSchemaVersion[], guard: UpgradeGuard): Dexie {
  const dexie = new Dexie(NAME, { indexedDB: createUpgradeGuardedFactory(() => indexedDB, guard) });
  applyJieyuSchemaVersions(dexie, ledger);
  opened.push(dexie);
  return dexie;
}

function guardFor(target: number, frozen = true): UpgradeGuard {
  return new UpgradeGuard({ dbName: NAME, codeTargetVersion: target, frozen });
}

async function seedV1(rows = 5): Promise<void> {
  const v1 = new Dexie(NAME);
  applyJieyuSchemaVersions(v1, [SYNTH_V1]);
  await v1.open();
  await v1
    .table('items')
    .bulkPut(Array.from({ length: rows }, (_, i) => ({ id: `i${i}`, name: `name ${i}` })));
  v1.close();
}

/** 进程内的 BroadcastChannel 替身 | In-process BroadcastChannel stand-in */
function createChannelBus(): ChannelFactory {
  const members = new Set<{ listeners: Set<(event: MessageEvent) => void> }>();
  return () => {
    const self = { listeners: new Set<(event: MessageEvent) => void>() };
    members.add(self);
    const channel: ChannelLike = {
      postMessage: (data) => {
        for (const member of members) {
          if (member === self) continue;
          for (const listener of member.listeners) listener({ data } as MessageEvent);
        }
      },
      close: () => {
        members.delete(self);
      },
      addEventListener: (_type, listener) => self.listeners.add(listener),
      removeEventListener: (_type, listener) => self.listeners.delete(listener),
    };
    return channel;
  };
}

function gateParams(
  ledger: readonly JieyuSchemaVersion[],
  overrides: Partial<MigrationGateParams> = {},
): MigrationGateParams {
  const guard = overrides.guard ?? guardFor(ledger[ledger.length - 1]!.version);
  return {
    dexie: overrides.dexie ?? makeDexie(ledger, guard),
    dbName: NAME,
    versions: ledger,
    guard,
    factory: indexedDB,
    policy: resolveMigrationPolicy({}, true),
    snapshotDbName: SNAP,
    estimate: async () => ({ quota: 10 ** 12, usage: 0 }),
    channelFactory: createChannelBus(),
    locks: null,
    timeouts: { broadcastGraceMs: 5, upgradeOpenMs: 2_000, upgradeLockMs: 50 },
    ...overrides,
  };
}

const tinyQuota = async () => ({ quota: 100, usage: 99 });

describe('migration gate', () => {
  it('fresh install opens without a snapshot', async () => {
    const params = gateParams(SYNTH_LEDGER_ADDITIVE);
    const outcome = await openThroughMigrationGate(params);
    expect(outcome.path).toBe('fresh-install');
    expect(params.dexie.verno).toBe(2);
    expect(await detectInstalledDatabase(indexedDB, SNAP)).toEqual({ exists: false });
  });

  it('T38: additive v1 → v2 detects the version, snapshots v1 and upgrades', async () => {
    await seedV1();
    const params = gateParams(SYNTH_LEDGER_ADDITIVE);
    const outcome = await openThroughMigrationGate(params);
    expect(outcome).toMatchObject({ path: 'upgraded', installedVersion: 1, targetVersion: 2 });
    expect(outcome.classification?.tier).toBe('additive');
    expect(outcome.snapshot?.status).toBe('verified');
    expect(outcome.warning).toBeUndefined();
    expect(await detectInstalledDatabase(indexedDB, NAME)).toMatchObject({ nativeVersion: 20 });
    expect(await params.dexie.table('items').count()).toBe(5);
    const [slot] = await listSnapshotSlots(indexedDB, SNAP);
    expect(slot).toMatchObject({ state: 'verified', nativeVersion: 10, schemaVersion: 1 });
  });

  it('T38: additive continues with a visible warning when the snapshot fails', async () => {
    await seedV1();
    const params = gateParams(SYNTH_LEDGER_ADDITIVE, { estimate: tinyQuota });
    const outcome = await openThroughMigrationGate(params);
    expect(outcome.path).toBe('upgraded');
    expect(outcome.snapshot).toMatchObject({ status: 'failed', kind: 'quota-precheck' });
    expect(outcome.warning).toMatch(/additive migration continued without a verified snapshot/);
    expect(await detectInstalledDatabase(indexedDB, NAME)).toMatchObject({ nativeVersion: 20 });
  });

  it('T39: rewriting v1 → v2 is blocked when the snapshot fails; DB stays at v1 and can be exported raw', async () => {
    await seedV1();
    const params = gateParams(SYNTH_LEDGER_REWRITING, { estimate: tinyQuota });
    const error = await openThroughMigrationGate(params).then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(JieyuMigrationGateError);
    const detail = (error as JieyuMigrationGateError).detail;
    expect(detail).toMatchObject({
      reason: 'migration-blocked',
      installedVersion: 1,
      targetVersion: 2,
      tier: 'rewriting',
      offerRawExport: true,
    });
    expect(params.dexie.isOpen()).toBe(false);
    expect(await detectInstalledDatabase(indexedDB, NAME)).toMatchObject({ nativeVersion: 10 });
    const raw = await exportRawIdbSnapshot({
      factory: indexedDB,
      dbName: NAME,
      reason: 'migration-blocked',
    });
    expect(raw.manifest).toMatchObject({ kind: 'raw-idb', nativeVersion: 10, dexieVersion: 1 });
    expect(raw.manifest.stores.find((store) => store.name === 'items')?.rowCount).toBe(5);
  });

  it('T39: rewriting runs the upgrader once the snapshot is verified', async () => {
    await seedV1();
    const params = gateParams(SYNTH_LEDGER_REWRITING);
    const outcome = await openThroughMigrationGate(params);
    expect(outcome).toMatchObject({ path: 'upgraded', snapshot: { status: 'verified' } });
    expect(await params.dexie.table('items').get('i3')).toMatchObject({ displayName: 'NAME 3' });
  });

  it('rewriting with the snapshot switched off is blocked once frozen, but only warned before the freeze point', async () => {
    await seedV1();
    const frozenParams = gateParams(SYNTH_LEDGER_REWRITING, {
      policy: resolveMigrationPolicy(
        { snapshotBeforeUpgrade: false, blockRewritingWithoutVerifiedSnapshot: false },
        true,
      ),
    });
    await expect(openThroughMigrationGate(frozenParams)).rejects.toMatchObject({
      detail: { reason: 'migration-blocked' },
    });
    frozenParams.dexie.close();

    const devParams = gateParams(SYNTH_LEDGER_REWRITING, {
      policy: resolveMigrationPolicy(
        { snapshotBeforeUpgrade: false, blockRewritingWithoutVerifiedSnapshot: false },
        false,
      ),
    });
    const outcome = await openThroughMigrationGate(devParams);
    expect(outcome.path).toBe('upgraded');
    expect(outcome.warning).toMatch(/rewriting migration continued/);
  });

  it('refuses to open data newer than the app and leaves its version alone', async () => {
    await seedV1();
    const v2 = new Dexie(NAME);
    applyJieyuSchemaVersions(v2, SYNTH_LEDGER_ADDITIVE);
    await v2.open();
    v2.close();
    const params = gateParams([SYNTH_V1]);
    await expect(openThroughMigrationGate(params)).rejects.toMatchObject({
      detail: {
        reason: 'data-newer-than-app',
        installedVersion: 2,
        targetVersion: 1,
        offerRawExport: true,
      },
    });
    expect(params.dexie.isOpen()).toBe(false);
    expect(await detectInstalledDatabase(indexedDB, NAME)).toMatchObject({ nativeVersion: 20 });
  });

  it('the upgrade guard stops an auto-open that bypasses the gate from upgrading', async () => {
    await seedV1();
    const dexie = makeDexie(SYNTH_LEDGER_ADDITIVE, guardFor(2));
    await expect(dexie.table('items').count()).rejects.toThrow();
    expect(await detectInstalledDatabase(indexedDB, NAME)).toMatchObject({ nativeVersion: 10 });
  });

  it('T54(a): another tab that handles versionchange closes, is told to refresh, and the upgrade continues', async () => {
    await seedV1();
    const bus = createChannelBus();
    const otherTab = new Dexie(NAME);
    applyJieyuSchemaVersions(otherTab, [SYNTH_V1]);
    opened.push(otherTab);
    await otherTab.open();
    const onStale = vi.fn();
    installStaleConnectionHandlers(otherTab, { onStale, channelFactory: bus, tabId: 'other' });

    const params = gateParams(SYNTH_LEDGER_ADDITIVE, { channelFactory: bus });
    const outcome = await openThroughMigrationGate(params);
    expect(outcome.path).toBe('upgraded');
    expect(onStale).toHaveBeenCalledWith('upgrade-intent');
    expect(otherTab.isOpen()).toBe(false);
    // 不会自动重开 | no auto-reopen
    await expect(otherTab.table('items').count()).rejects.toThrow();
  });

  it('T54(a): versionchange alone (no BroadcastChannel) closes the other tab', async () => {
    await seedV1();
    const otherTab = new Dexie(NAME);
    applyJieyuSchemaVersions(otherTab, [SYNTH_V1]);
    opened.push(otherTab);
    await otherTab.open();
    const onStale = vi.fn();
    installStaleConnectionHandlers(otherTab, { onStale, channelFactory: () => null });
    const params = gateParams(SYNTH_LEDGER_ADDITIVE, { channelFactory: () => null });
    expect((await openThroughMigrationGate(params)).path).toBe('upgraded');
    expect(onStale).toHaveBeenCalledWith('versionchange');
  });

  it('T54(b): a tab that keeps its connection open blocks the upgrade, which is aborted and stays aborted', async () => {
    await seedV1();
    // 旧代码标签页：原生连接，不处理 versionchange | old-code tab: raw connection ignoring versionchange
    const stubborn = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const params = gateParams(SYNTH_LEDGER_ADDITIVE);
    await expect(openThroughMigrationGate(params)).rejects.toMatchObject({
      detail: { reason: 'upgrade-blocked-by-other-tabs', installedVersion: 1 },
    });
    // 挂起的升级请求排在连接队列里，对方关闭之前任何打开都要排队；对方关闭后守卫中止它，库仍停在 v1。
    // The pending upgrade request stays queued until the other tab closes; then the guard aborts it.
    stubborn.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await detectInstalledDatabase(indexedDB, NAME)).toMatchObject({ nativeVersion: 10 });
    // 关闭其他标签页后重试成功 | retry succeeds once the other tab is gone
    const retry = gateParams(SYNTH_LEDGER_ADDITIVE);
    expect((await openThroughMigrationGate(retry)).path).toBe('upgraded');
  });

  it('T54: when the exclusive upgrade lock is held elsewhere the upgrade is not attempted', async () => {
    await seedV1();
    const heldLock: LockManagerLike = {
      request: (_name, options) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    };
    const params = gateParams(SYNTH_LEDGER_ADDITIVE, { locks: heldLock });
    await expect(openThroughMigrationGate(params)).rejects.toMatchObject({
      detail: { reason: 'upgrade-lock-timeout' },
    });
    expect(await detectInstalledDatabase(indexedDB, NAME)).toMatchObject({ nativeVersion: 10 });
  });

  it('gate switched off opens directly (pre-freeze only)', async () => {
    const params = gateParams(SYNTH_LEDGER_ADDITIVE, {
      policy: resolveMigrationPolicy({ gate: false }, false),
    });
    expect((await openThroughMigrationGate(params)).path).toBe('gate-disabled');
  });

  it('startup cleans unverified snapshot leftovers', async () => {
    await seedV1();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(SNAP, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('slots', { keyPath: 'slot' });
        request.result.createObjectStore('rows', { keyPath: ['slot', 'store', 'seq'] });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('slots', 'readwrite');
      tx.objectStore('slots').put({ slot: 'A', state: 'writing', stores: [], samples: [] });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    const params = gateParams([SYNTH_V1]);
    const outcome = await openThroughMigrationGate(params);
    expect(outcome.path).toBe('current');
    expect(outcome.cleanedSnapshotSlots).toEqual(['A']);
  });
});
