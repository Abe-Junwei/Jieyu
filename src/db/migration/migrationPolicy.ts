/**
 * 迁移策略（rev5 8.2 / D2 / D14）| Migration policy (rev5 8.2 / D2 / D14)
 *
 * - 开关可以单独关闭（`JIEYU_MIGRATION_FEATURES`）。
 * - 冻结点之后，阻止策略不能关闭：闸门、D2 的 rewriting 阻止、blocked 中止强制为开。
 * - D2：rewriting 只有在升级前快照成功并通过验证时才执行；additive 快照失败时继续，但要警告。
 *
 * Switches are individually configurable; once frozen the blocking policy is forced on.
 */
import { JIEYU_DATA_FROZEN } from '../../config/dataFreeze';
import {
  JIEYU_MIGRATION_FEATURES,
  type JieyuMigrationFeatures,
} from '../../config/migrationFeatures';
import type { MigrationTier } from './schemaVersions';

export type ResolvedMigrationPolicy = JieyuMigrationFeatures & {
  frozen: boolean;
  /** 冻结后被强制打开的开关 | Switches forced on because the data is frozen */
  forcedOn: Array<keyof JieyuMigrationFeatures>;
};

/** 冻结后不能关闭的开关 | Switches that cannot be turned off after the freeze point */
export const MIGRATION_BLOCKING_POLICY_KEYS = [
  'gate',
  'blockRewritingWithoutVerifiedSnapshot',
  'abortUpgradeWhenBlocked',
] as const satisfies ReadonlyArray<keyof JieyuMigrationFeatures>;

export function resolveMigrationPolicy(
  overrides: Partial<JieyuMigrationFeatures> = {},
  frozen: boolean = JIEYU_DATA_FROZEN,
  base: Readonly<JieyuMigrationFeatures> = JIEYU_MIGRATION_FEATURES,
): ResolvedMigrationPolicy {
  const merged: JieyuMigrationFeatures = { ...base, ...overrides };
  const forcedOn: Array<keyof JieyuMigrationFeatures> = [];
  if (frozen) {
    for (const key of MIGRATION_BLOCKING_POLICY_KEYS) {
      if (!merged[key]) {
        merged[key] = true;
        forcedOn.push(key);
      }
    }
  }
  return { ...merged, frozen, forcedOn };
}

export type SnapshotOutcomeForDecision =
  | { status: 'verified' }
  | { status: 'failed'; reason: string }
  | { status: 'skipped'; reason: string };

export type UpgradeDecision =
  | { action: 'proceed' }
  | { action: 'proceed-with-warning'; warning: string }
  | { action: 'block'; reason: string };

/** D2 判定 | D2 decision */
export function decideUpgrade(input: {
  tier: MigrationTier;
  snapshot: SnapshotOutcomeForDecision;
  policy: Pick<ResolvedMigrationPolicy, 'blockRewritingWithoutVerifiedSnapshot'>;
}): UpgradeDecision {
  if (input.snapshot.status === 'verified') return { action: 'proceed' };
  const why = input.snapshot.reason;
  if (input.tier === 'rewriting' && input.policy.blockRewritingWithoutVerifiedSnapshot) {
    return {
      action: 'block',
      reason: `rewriting migration blocked: pre-migration snapshot ${input.snapshot.status} (${why})`,
    };
  }
  return {
    action: 'proceed-with-warning',
    warning: `${input.tier} migration continued without a verified snapshot (${input.snapshot.status}: ${why})`,
  };
}
