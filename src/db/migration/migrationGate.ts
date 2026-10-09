/**
 * 迁移闸门（rev5 8.2 / D2 / T38 / T39 / T54）| Migration gate (rev5 8.2 / D2 / T38 / T39 / T54)
 *
 * 打开主库前：
 * 1. 清理没有“已验证”标记的快照残留；
 * 2. 检测已安装版本（不经过 Dexie）：数据比代码新就拒绝打开，提示更新应用；
 * 3. 需要升级时按 `(from, to]` 分级，在独占锁内广播“暂停写入”，写两槽位快照；
 * 4. 按 D2 判定：rewriting 快照未通过验证 → 停在旧版本并提供恢复导出；additive → 继续并警告；
 * 5. 放行升级守卫后打开；收到 `blocked` 或超时 → 中止升级，提示关闭其他标签页。
 *
 * Before opening the main DB: clean leftovers, detect the installed version (refuse newer data),
 * tier the range, broadcast pause inside the exclusive lock, snapshot, decide per D2, then open with
 * the guard armed; `blocked` or a timeout aborts the upgrade.
 */
import type Dexie from 'dexie';
import { JIEYU_MIGRATION_TIMEOUTS } from '../../config/migrationFeatures';
import { classifyUpgradeRange, type UpgradeRangeClassification } from './migrationTier';
import {
  decideUpgrade,
  type ResolvedMigrationPolicy,
  type SnapshotOutcomeForDecision,
} from './migrationPolicy';
import {
  cleanupUnverifiedSnapshots,
  JIEYU_MIGRATION_SNAPSHOT_DB_NAME,
  takeVerifiedSnapshot,
  type StorageEstimateFn,
  type TakeSnapshotResult,
} from './migrationSnapshotStore';
import { latestSchemaVersion, type JieyuSchemaVersion, type MigrationTier } from './schemaVersions';
import {
  broadcastUpgradeIntent,
  withUpgradeLock,
  type ChannelFactory,
  type LockManagerLike,
  type UpgradeGuard,
} from './upgradeCoordinator';
import { compareInstalledVersion, detectInstalledDatabase } from './versionDetection';

export type MigrationGateFailureReason =
  | 'data-newer-than-app'
  | 'migration-blocked'
  | 'upgrade-blocked-by-other-tabs'
  | 'upgrade-lock-timeout';

export type MigrationGateErrorDetail = {
  reason: MigrationGateFailureReason;
  dbName: string;
  installedVersion?: number;
  targetVersion: number;
  tier?: MigrationTier;
  message: string;
  /** 提供原始恢复导出（数据库仍是旧版本）| Offer the raw recovery export (DB still at the old version) */
  offerRawExport: boolean;
};

export class JieyuMigrationGateError extends Error {
  readonly detail: MigrationGateErrorDetail;

  constructor(detail: MigrationGateErrorDetail) {
    super(detail.message);
    this.name = 'JieyuMigrationGateError';
    this.detail = detail;
  }
}

export type MigrationGateOutcome = {
  path: 'gate-disabled' | 'fresh-install' | 'current' | 'upgraded';
  installedVersion?: number;
  targetVersion: number;
  classification?: UpgradeRangeClassification;
  snapshot?: TakeSnapshotResult;
  /** D2：additive 在没有已验证快照时继续的可见警告 | D2 visible warning */
  warning?: string;
  /** 清理掉的未验证快照槽位 | Unverified snapshot slots removed at startup */
  cleanedSnapshotSlots: string[];
};

export type MigrationGateParams = {
  dexie: Dexie;
  dbName: string;
  versions: readonly JieyuSchemaVersion[];
  guard: UpgradeGuard;
  factory: IDBFactory;
  policy: ResolvedMigrationPolicy;
  timeouts?: Partial<typeof JIEYU_MIGRATION_TIMEOUTS>;
  snapshotDbName?: string;
  estimate?: StorageEstimateFn;
  channelFactory?: ChannelFactory;
  locks?: LockManagerLike | null;
  /** 测试注入：替换快照实现 | Test hook: replace the snapshot implementation */
  takeSnapshot?: typeof takeVerifiedSnapshot;
};

function snapshotForDecision(result: TakeSnapshotResult): SnapshotOutcomeForDecision {
  if (result.status === 'verified') return { status: 'verified' };
  return { status: 'failed', reason: `${result.kind}: ${result.reason}` };
}

async function cleanupLeftovers(params: MigrationGateParams): Promise<string[]> {
  if (!params.policy.cleanupUnverifiedSnapshots) return [];
  const snapshotDbName = params.snapshotDbName ?? JIEYU_MIGRATION_SNAPSHOT_DB_NAME;
  try {
    // 不为清理而创建快照库 | do not create the snapshot DB just to clean it
    const info = await detectInstalledDatabase(params.factory, snapshotDbName);
    if (!info.exists) return [];
    return await cleanupUnverifiedSnapshots(params.factory, snapshotDbName);
  } catch {
    return [];
  }
}

/** 经过闸门打开主库 | Open the main DB through the gate */
export async function openThroughMigrationGate(
  params: MigrationGateParams,
): Promise<MigrationGateOutcome> {
  const { dexie, dbName, policy } = params;
  const timeouts = { ...JIEYU_MIGRATION_TIMEOUTS, ...params.timeouts };
  const targetVersion = latestSchemaVersion(params.versions);

  if (!policy.gate) {
    await dexie.open();
    return { path: 'gate-disabled', targetVersion, cleanedSnapshotSlots: [] };
  }

  const cleanedSnapshotSlots = await cleanupLeftovers(params);
  const installed = await detectInstalledDatabase(params.factory, dbName);
  const comparison = compareInstalledVersion(installed, targetVersion);

  if (comparison.kind === 'data-newer-than-app') {
    throw new JieyuMigrationGateError({
      reason: 'data-newer-than-app',
      dbName,
      installedVersion: comparison.installed,
      targetVersion,
      message: `Local data is at schema v${comparison.installed}, newer than this app (v${targetVersion}). Update the app; the database was not opened.`,
      offerRawExport: policy.rawRecoveryExport,
    });
  }
  if (comparison.kind === 'fresh-install' || comparison.kind === 'current') {
    await dexie.open();
    return {
      path: comparison.kind,
      ...(comparison.kind === 'current' ? { installedVersion: comparison.installed } : {}),
      targetVersion,
      cleanedSnapshotSlots,
    };
  }

  // 需要升级 | upgrade required
  const installedVersion = comparison.installed;
  const nativeFrom = installed.exists ? installed.nativeVersion : 0;
  const classification = classifyUpgradeRange(params.versions, installedVersion, targetVersion);

  const runUpgrade = async (): Promise<MigrationGateOutcome> => {
    if (policy.multiTabCoordination) {
      await broadcastUpgradeIntent(
        { dbName, fromVersion: installedVersion, toVersion: targetVersion },
        {
          graceMs: timeouts.broadcastGraceMs,
          ...(params.channelFactory ? { channelFactory: params.channelFactory } : {}),
        },
      );
    }

    let snapshot: TakeSnapshotResult | undefined;
    let snapshotOutcome: SnapshotOutcomeForDecision;
    if (policy.snapshotBeforeUpgrade) {
      snapshot = await (params.takeSnapshot ?? takeVerifiedSnapshot)({
        factory: params.factory,
        sourceDbName: dbName,
        ...(params.snapshotDbName !== undefined ? { snapshotDbName: params.snapshotDbName } : {}),
        ...(policy.quotaPrecheck
          ? params.estimate !== undefined
            ? { estimate: params.estimate }
            : {}
          : { estimate: null }),
      });
      snapshotOutcome = snapshotForDecision(snapshot);
    } else {
      snapshotOutcome = { status: 'skipped', reason: 'snapshotBeforeUpgrade is switched off' };
    }

    const decision = decideUpgrade({
      tier: classification.tier,
      snapshot: snapshotOutcome,
      policy,
    });
    if (decision.action === 'block') {
      throw new JieyuMigrationGateError({
        reason: 'migration-blocked',
        dbName,
        installedVersion,
        targetVersion,
        tier: classification.tier,
        message: `Upgrade v${installedVersion} → v${targetVersion} was blocked and the database stays at v${installedVersion}: ${decision.reason}. Export a raw recovery snapshot before trying again.`,
        offerRawExport: policy.rawRecoveryExport,
      });
    }

    await openWithBlockedHandling(
      params,
      nativeFrom,
      timeouts.upgradeOpenMs,
      installedVersion,
      targetVersion,
      classification.tier,
    );
    return {
      path: 'upgraded',
      installedVersion,
      targetVersion,
      classification,
      ...(snapshot ? { snapshot } : {}),
      ...(decision.action === 'proceed-with-warning' ? { warning: decision.warning } : {}),
      cleanedSnapshotSlots,
    };
  };

  if (!policy.multiTabCoordination) return runUpgrade();
  const locked = await withUpgradeLock(runUpgrade, {
    timeoutMs: timeouts.upgradeLockMs,
    ...(params.locks !== undefined ? { locks: params.locks } : {}),
  });
  if (!locked.acquired) {
    throw new JieyuMigrationGateError({
      reason: 'upgrade-lock-timeout',
      dbName,
      installedVersion,
      targetVersion,
      tier: classification.tier,
      message:
        'Another Jieyu tab is upgrading the local database. Close other Jieyu tabs and refresh.',
      offerRawExport: false,
    });
  }
  return locked.value;
}

async function openWithBlockedHandling(
  params: MigrationGateParams,
  nativeFrom: number,
  timeoutMs: number,
  installedVersion: number,
  targetVersion: number,
  tier: MigrationTier,
): Promise<void> {
  const { dexie, guard, policy, dbName } = params;
  let blockedBy: 'blocked' | 'timeout' | null = null;
  let upgradeStarted = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const abortUpgrade = (why: 'blocked' | 'timeout'): void => {
    if (upgradeStarted || blockedBy !== null) return;
    blockedBy = why;
    // 守卫先撤销放行：即使请求之后才被放行，upgradeneeded 也会被中止 | disarm first
    guard.disarm();
    dexie.close({ disableAutoOpen: true });
  };
  const onBlocked = (): void => {
    if (policy.abortUpgradeWhenBlocked) abortUpgrade('blocked');
  };

  guard.arm(nativeFrom, () => {
    upgradeStarted = true;
    if (timer !== null) clearTimeout(timer);
  });
  dexie.on('blocked', onBlocked);
  if (policy.abortUpgradeWhenBlocked) timer = setTimeout(() => abortUpgrade('timeout'), timeoutMs);
  try {
    await dexie.open();
  } catch (error) {
    if (blockedBy !== null) {
      throw new JieyuMigrationGateError({
        reason: 'upgrade-blocked-by-other-tabs',
        dbName,
        installedVersion,
        targetVersion,
        tier,
        message: `Upgrade v${installedVersion} → v${targetVersion} was aborted (${blockedBy === 'blocked' ? 'another tab kept the database open' : 'other connections did not close in time'}); the database stays at v${installedVersion}. Close other Jieyu tabs and refresh.`,
        offerRawExport: false,
      });
    }
    throw error;
  } finally {
    if (timer !== null) clearTimeout(timer);
    dexie.on('blocked').unsubscribe(onBlocked);
    guard.disarm();
  }
}
