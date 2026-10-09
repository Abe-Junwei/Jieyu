/**
 * 迁移框架开关（rev5 10.0 第 4a 批：各项可以单独关闭；冻结点之后阻止策略不能关闭）。
 * Migration framework switches (rev5 batch 4a: each piece can be switched off individually;
 * after the freeze point the blocking policy cannot be switched off — see `resolveMigrationPolicy`).
 */
export type JieyuMigrationFeatures = {
  /** 打开主库前做版本检测并经过迁移闸门 | Detect versions and run the migration gate before opening */
  gate: boolean;
  /** 升级前写两槽位快照 | Take a two-slot snapshot before upgrading */
  snapshotBeforeUpgrade: boolean;
  /** 快照前按“两份同时存在”做配额预检 | Quota precheck assuming two snapshots coexist */
  quotaPrecheck: boolean;
  /** 启动时清理没有“已验证”标记的快照残留 | Clean up unverified snapshot leftovers at startup */
  cleanupUnverifiedSnapshots: boolean;
  /** Web Locks + BroadcastChannel 协调其他标签页 | Coordinate other tabs via Web Locks + BroadcastChannel */
  multiTabCoordination: boolean;
  /** 所有连接处理 versionchange：关闭并提示刷新 | Handle versionchange: close and ask to refresh */
  versionChangeHandler: boolean;
  /** D2：rewriting 迁移在快照未通过验证时阻止（阻止策略）| D2 blocking policy */
  blockRewritingWithoutVerifiedSnapshot: boolean;
  /** T54：收到 blocked 或超时就中止升级（阻止策略）| T54 blocking policy */
  abortUpgradeWhenBlocked: boolean;
  /** 被阻止时提供原始恢复导出 | Offer the raw recovery export when blocked */
  rawRecoveryExport: boolean;
};

export const JIEYU_MIGRATION_FEATURES: Readonly<JieyuMigrationFeatures> = {
  gate: true,
  snapshotBeforeUpgrade: true,
  quotaPrecheck: true,
  cleanupUnverifiedSnapshots: true,
  multiTabCoordination: true,
  versionChangeHandler: true,
  blockRewritingWithoutVerifiedSnapshot: true,
  abortUpgradeWhenBlocked: true,
  rawRecoveryExport: true,
};

/**
 * 多标签页协调的等待上限（rev5 第 12 节“待冻结”参数，先取保守值）。
 * Multi-tab coordination timeouts (rev5 §12 "to be frozen"; conservative defaults).
 */
export interface JieyuMigrationTimeouts {
  upgradeLockMs: number;
  broadcastGraceMs: number;
  upgradeOpenMs: number;
}

export const JIEYU_MIGRATION_TIMEOUTS: Readonly<JieyuMigrationTimeouts> = {
  /** 等待 `jieyu-db-upgrade` 独占锁 | Waiting for the exclusive upgrade lock */
  upgradeLockMs: 10_000,
  /** 广播“暂停写入”后给其他标签页关闭连接的时间 | Grace period after broadcasting pause */
  broadcastGraceMs: 300,
  /** 升级打开请求的总等待上限（超时即中止）| Max wait for the upgrading open request */
  upgradeOpenMs: 8_000,
};
