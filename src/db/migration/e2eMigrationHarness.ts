/**
 * 浏览器自动化专用的迁移框架探针（rev5 T38 / T39 / T54 / T55 的“隔离浏览器”验证）。
 * 只在 `navigator.webdriver === true` 时由 main.tsx 动态加载；只操作 `jieyu-e2e-synth-*` 合成库，
 * 不碰主库。
 * Browser-automation-only probe for the migration framework (isolated-browser checks for T38 / T39 /
 * T54 / T55). Loaded dynamically by main.tsx only under webdriver; touches synthetic DBs only.
 */
import Dexie from 'dexie';
import { applyJieyuSchemaVersions } from './schemaVersions';
import { resolveMigrationPolicy } from './migrationPolicy';
import { JieyuMigrationGateError, openThroughMigrationGate } from './migrationGate';
import {
  createUpgradeGuardedFactory,
  installStaleConnectionHandlers,
  UpgradeGuard,
} from './upgradeCoordinator';
import {
  listSnapshotSlots,
  takeVerifiedSnapshot,
  cleanupUnverifiedSnapshots,
} from './migrationSnapshotStore';
import { detectInstalledDatabase } from './versionDetection';
import { idbDeleteDatabase } from './rawIdb';
import {
  SYNTH_LEDGER_ADDITIVE,
  SYNTH_LEDGER_REWRITING,
  SYNTH_V1,
} from './__fixtures__/syntheticLedgers';

const PREFIX = 'jieyu-e2e-synth-';

function assertSynthetic(name: string): void {
  if (!name.startsWith(PREFIX)) throw new Error(`e2e harness only touches ${PREFIX}* databases`);
}

const held = new Map<string, IDBDatabase>();
const staleAware = new Map<string, { dexie: Dexie; reasons: string[] }>();

export type E2eGateResult =
  | {
      ok: true;
      path: string;
      warning: string | null;
      snapshotStatus: string | null;
      nativeAfter: number | null;
    }
  | { ok: false; reason: string; nativeAfter: number | null };

async function nativeVersionOf(name: string): Promise<number | null> {
  const info = await detectInstalledDatabase(indexedDB, name);
  return info.exists ? info.nativeVersion : null;
}

const harness = {
  async seedV1(name: string, rows = 20): Promise<void> {
    assertSynthetic(name);
    const dexie = new Dexie(name);
    applyJieyuSchemaVersions(dexie, [SYNTH_V1]);
    await dexie.open();
    await dexie
      .table('items')
      .bulkPut(Array.from({ length: rows }, (_, i) => ({ id: `i${i}`, name: `name ${i}` })));
    dexie.close();
  },

  async runGate(options: {
    name: string;
    ledger: 'additive' | 'rewriting';
    quota: 'ample' | 'tiny';
    upgradeOpenMs?: number;
  }): Promise<E2eGateResult> {
    assertSynthetic(options.name);
    const ledger = options.ledger === 'additive' ? SYNTH_LEDGER_ADDITIVE : SYNTH_LEDGER_REWRITING;
    const guard = new UpgradeGuard({ dbName: options.name, codeTargetVersion: 2, frozen: true });
    const dexie = new Dexie(options.name, {
      indexedDB: createUpgradeGuardedFactory(() => indexedDB, guard),
    });
    applyJieyuSchemaVersions(dexie, ledger);
    try {
      const outcome = await openThroughMigrationGate({
        dexie,
        dbName: options.name,
        versions: ledger,
        guard,
        factory: indexedDB,
        policy: resolveMigrationPolicy({}, true),
        snapshotDbName: `${options.name}-snapshots`,
        estimate:
          options.quota === 'tiny'
            ? async () => ({ quota: 100, usage: 99 })
            : async () => ({ quota: 10 ** 12, usage: 0 }),
        timeouts: { upgradeOpenMs: options.upgradeOpenMs ?? 3_000 },
      });
      dexie.close();
      return {
        ok: true,
        path: outcome.path,
        warning: outcome.warning ?? null,
        snapshotStatus: outcome.snapshot?.status ?? null,
        nativeAfter: await nativeVersionOf(options.name),
      };
    } catch (error) {
      dexie.close();
      const reason =
        error instanceof JieyuMigrationGateError
          ? error.detail.reason
          : `unexpected: ${String(error)}`;
      return { ok: false, reason, nativeAfter: null };
    }
  },

  nativeVersionOf,

  /** 模拟运行旧代码的标签页：原生连接，不处理 versionchange | old-code tab: ignores versionchange */
  async holdConnection(name: string): Promise<void> {
    assertSynthetic(name);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    held.set(name, db);
  },

  releaseConnection(name: string): void {
    held.get(name)?.close();
    held.delete(name);
  },

  /** 运行新代码的标签页：装了 versionchange / BroadcastChannel 处理 | new-code tab with handlers */
  async openStaleAware(name: string): Promise<void> {
    assertSynthetic(name);
    const dexie = new Dexie(name);
    applyJieyuSchemaVersions(dexie, [SYNTH_V1]);
    await dexie.open();
    const entry = { dexie, reasons: [] as string[] };
    installStaleConnectionHandlers(dexie, { onStale: (reason) => entry.reasons.push(reason) });
    staleAware.set(name, entry);
  },

  staleState(name: string): { reasons: string[]; isOpen: boolean } {
    const entry = staleAware.get(name);
    return { reasons: entry ? [...entry.reasons] : [], isOpen: entry?.dexie.isOpen() ?? false };
  },

  async snapshotWithFault(
    name: string,
    fault: 'none' | 'quota' | 'abort',
  ): Promise<{ status: string; kind?: string; storageFailure?: string }> {
    assertSynthetic(name);
    const result = await takeVerifiedSnapshot({
      factory: indexedDB,
      sourceDbName: name,
      snapshotDbName: `${name}-snapshots`,
      estimate: null,
      beforeRowWrite: ({ seq, tx }) => {
        if (seq !== 5) return;
        if (fault === 'quota') throw new DOMException('simulated quota', 'QuotaExceededError');
        if (fault === 'abort') tx.abort();
      },
    });
    return result.status === 'verified'
      ? { status: result.status }
      : {
          status: result.status,
          kind: result.kind,
          ...(result.storageFailure ? { storageFailure: result.storageFailure.kind } : {}),
        };
  },

  /** 模拟标签页在写快照时被关：留下 'writing' 槽位 | leave a half-written slot behind */
  async leaveUnverifiedSlot(name: string): Promise<void> {
    assertSynthetic(name);
    const verified = (await listSnapshotSlots(indexedDB, `${name}-snapshots`)).filter(
      (meta) => meta.state === 'verified',
    );
    const free = verified.some((meta) => meta.slot === 'A') ? 'B' : 'A';
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`${name}-snapshots`, 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['slots', 'rows'], 'readwrite');
      tx.objectStore('slots').put({ slot: free, state: 'writing', stores: [], samples: [] });
      tx.objectStore('rows').put({
        slot: free,
        store: 'items',
        seq: 0,
        key: 'k',
        value: { id: 'k' },
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  },

  async slots(name: string): Promise<Array<{ slot: string; state: string }>> {
    assertSynthetic(name);
    return (await listSnapshotSlots(indexedDB, `${name}-snapshots`)).map((meta) => ({
      slot: meta.slot,
      state: meta.state,
    }));
  },

  async cleanupLeftovers(name: string): Promise<string[]> {
    assertSynthetic(name);
    return cleanupUnverifiedSnapshots(indexedDB, `${name}-snapshots`);
  },

  async drop(name: string): Promise<void> {
    assertSynthetic(name);
    harness.releaseConnection(name);
    staleAware.get(name)?.dexie.close();
    staleAware.delete(name);
    await idbDeleteDatabase(indexedDB, name);
    await idbDeleteDatabase(indexedDB, `${name}-snapshots`);
  },
};

export type JieyuE2eMigrationHarness = typeof harness;

export function installE2eMigrationHarness(): void {
  (
    globalThis as typeof globalThis & { __jieyuE2eMigration__?: JieyuE2eMigrationHarness }
  ).__jieyuE2eMigration__ = harness;
  document.documentElement.dataset.jieyuE2eMigrationHarness = '1';
}
