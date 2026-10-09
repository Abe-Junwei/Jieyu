/** 4a：开关与 D2 判定 | 4a: switches and the D2 decision */
import { describe, expect, it } from 'vitest';
import {
  decideUpgrade,
  MIGRATION_BLOCKING_POLICY_KEYS,
  resolveMigrationPolicy,
} from './migrationPolicy';

const allOff = {
  gate: false,
  snapshotBeforeUpgrade: false,
  quotaPrecheck: false,
  cleanupUnverifiedSnapshots: false,
  multiTabCoordination: false,
  versionChangeHandler: false,
  blockRewritingWithoutVerifiedSnapshot: false,
  abortUpgradeWhenBlocked: false,
  rawRecoveryExport: false,
};

describe('migration policy', () => {
  it('before the freeze point every switch can be turned off individually', () => {
    const policy = resolveMigrationPolicy(allOff, false);
    expect(policy.forcedOn).toEqual([]);
    for (const [key, value] of Object.entries(allOff)) {
      expect(policy[key as keyof typeof allOff], key).toBe(value);
    }
  });

  it('after the freeze point the blocking policy cannot be turned off', () => {
    const policy = resolveMigrationPolicy(allOff, true);
    for (const key of MIGRATION_BLOCKING_POLICY_KEYS) expect(policy[key], key).toBe(true);
    expect([...policy.forcedOn].sort()).toEqual([...MIGRATION_BLOCKING_POLICY_KEYS].sort());
    // 非阻止类开关仍然可以关闭 | non-blocking switches stay configurable
    expect(policy.snapshotBeforeUpgrade).toBe(false);
    expect(policy.multiTabCoordination).toBe(false);
  });

  it('all switches default to on', () => {
    const policy = resolveMigrationPolicy({}, false);
    expect(Object.values(allOff).length).toBeGreaterThan(0);
    for (const key of Object.keys(allOff))
      expect(policy[key as keyof typeof allOff], key).toBe(true);
  });

  it('D2: a verified snapshot lets any tier proceed', () => {
    const policy = resolveMigrationPolicy({}, false);
    expect(decideUpgrade({ tier: 'rewriting', snapshot: { status: 'verified' }, policy })).toEqual({
      action: 'proceed',
    });
  });

  it('D2: additive continues with a visible warning when the snapshot failed', () => {
    const policy = resolveMigrationPolicy({}, false);
    const decision = decideUpgrade({
      tier: 'additive',
      snapshot: { status: 'failed', reason: 'QuotaExceededError' },
      policy,
    });
    expect(decision.action).toBe('proceed-with-warning');
  });

  it('D2: rewriting is blocked when the snapshot failed or was skipped', () => {
    const policy = resolveMigrationPolicy({}, false);
    expect(
      decideUpgrade({ tier: 'rewriting', snapshot: { status: 'failed', reason: 'x' }, policy })
        .action,
    ).toBe('block');
    expect(
      decideUpgrade({
        tier: 'rewriting',
        snapshot: { status: 'skipped', reason: 'disabled' },
        policy,
      }).action,
    ).toBe('block');
  });

  it('switching the D2 block off before freeze downgrades it to a warning; frozen forces it back', () => {
    const relaxed = resolveMigrationPolicy({ blockRewritingWithoutVerifiedSnapshot: false }, false);
    expect(
      decideUpgrade({
        tier: 'rewriting',
        snapshot: { status: 'failed', reason: 'x' },
        policy: relaxed,
      }).action,
    ).toBe('proceed-with-warning');
    const frozen = resolveMigrationPolicy({ blockRewritingWithoutVerifiedSnapshot: false }, true);
    expect(
      decideUpgrade({
        tier: 'rewriting',
        snapshot: { status: 'failed', reason: 'x' },
        policy: frozen,
      }).action,
    ).toBe('block');
  });
});
