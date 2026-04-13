import { describe, expect, it } from 'vitest';

import {
  assessClockDrift,
  compareVectorClock,
  createCrossDeviceRollbackPlan,
  duplicateCrossDeviceReplica,
  mergeCrossDeviceReplicas,
  validateCrossDeviceConsistency,
  type CrossDeviceReplica,
} from './collaborationCrossDeviceRuntime';

function buildReplica(overrides?: Partial<CrossDeviceReplica>): CrossDeviceReplica {
  return {
    entityId: 'segment:001',
    deviceId: 'device-a',
    sessionId: 'session-a',
    vectorClock: {
      'device-a': 2,
      'device-b': 1,
    },
    updatedAt: 1_710_000_001_000,
    fields: {
      text: 'hello',
      reviewed: false,
    },
    ...overrides,
  };
}

describe('collaboration cross-device runtime', () => {
  it('[vector] identifies concurrent vector clocks', () => {
    const relation = compareVectorClock(
      { 'device-a': 2, 'device-b': 1 },
      { 'device-a': 1, 'device-b': 2 },
    );
    expect(relation).toBe('concurrent');
  });

  it('[vector] merges dominated clock deterministically', () => {
    const local = buildReplica({
      vectorClock: { 'device-a': 3, 'device-b': 2 },
      updatedAt: 2_000,
      fields: { text: 'local' },
    });
    const remote = buildReplica({
      deviceId: 'device-b',
      sessionId: 'session-b',
      vectorClock: { 'device-a': 2, 'device-b': 2 },
      updatedAt: 1_900,
      fields: { text: 'remote', confidence: 0.9 },
    });

    const result = mergeCrossDeviceReplicas(local, remote);
    expect(result.relation).toBe('local-dominates');
    expect(result.requiresManualReview).toBe(false);
    expect(result.merged?.fields.text).toBe('local');
    expect(result.merged?.vectorClock['device-a']).toBe(3);
  });

  it('[drift] flags rollback when drift exceeds budget', () => {
    const local = buildReplica({ updatedAt: 10_000 });
    const remote = buildReplica({
      deviceId: 'device-b',
      sessionId: 'session-b',
      updatedAt: 2_000,
      vectorClock: { 'device-a': 2, 'device-b': 2 },
    });

    const drift = assessClockDrift(local, remote, 2_000);
    expect(drift.exceedsBudget).toBe(true);

    const merged = mergeCrossDeviceReplicas(local, remote, { driftBudgetMs: 2_000 });
    expect(merged.requiresRollback).toBe(true);
  });

  it('[rollback] creates hard rollback plan for risky concurrent delete/update', () => {
    const local = buildReplica({
      deleted: true,
      vectorClock: { 'device-a': 3, 'device-b': 1 },
      updatedAt: 3_000,
    });
    const remote = buildReplica({
      deviceId: 'device-b',
      sessionId: 'session-b',
      deleted: false,
      vectorClock: { 'device-a': 2, 'device-b': 2 },
      updatedAt: 8_000,
      fields: { text: 'remote edit' },
    });

    const merged = mergeCrossDeviceReplicas(local, remote, { driftBudgetMs: 2_000 });
    const rollback = createCrossDeviceRollbackPlan(merged, 9_001);
    expect(merged.requiresManualReview).toBe(true);
    expect(rollback.action).toBe('hard-rollback');
  });

  it('[rollback] still requires hard rollback for concurrent delete/update within drift budget', () => {
    const local = buildReplica({
      deleted: true,
      vectorClock: { 'device-a': 3, 'device-b': 1 },
      updatedAt: 3_000,
    });
    const remote = buildReplica({
      deviceId: 'device-b',
      sessionId: 'session-b',
      deleted: false,
      vectorClock: { 'device-a': 2, 'device-b': 2 },
      updatedAt: 3_500,
      fields: { text: 'remote edit' },
    });

    const merged = mergeCrossDeviceReplicas(local, remote, { driftBudgetMs: 5_000 });
    const rollback = createCrossDeviceRollbackPlan(merged, 9_002);
    expect(merged.requiresManualReview).toBe(true);
    expect(merged.requiresRollback).toBe(true);
    expect(rollback.action).toBe('hard-rollback');
  });

  it('[cross-device] validates consistency across replicas with different session/device ids', () => {
    const resolved = buildReplica();
    const replica = duplicateCrossDeviceReplica({
      ...resolved,
      deviceId: 'device-b',
      sessionId: 'session-b',
    });

    const consistency = validateCrossDeviceConsistency(resolved, [replica]);
    expect(consistency.consistent).toBe(true);
    expect(consistency.mismatchCount).toBe(0);
  });

  it('[cross-device] rejects merge when entity ids mismatch', () => {
    const local = buildReplica();
    const remote = buildReplica({ entityId: 'segment:009' });

    const merged = mergeCrossDeviceReplicas(local, remote);
    expect(merged.merged).toBeNull();
    expect(merged.requiresRollback).toBe(true);
    expect(merged.conflicts.includes('entity-id-mismatch')).toBe(true);
  });
});
