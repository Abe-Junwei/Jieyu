import { describe, expect, it } from 'vitest';

import type { CrossDeviceReplica } from './collaborationCrossDeviceRuntime';
import { evaluateReplicaQuorum, mergeReplicaBatch, planReplicaSyncChunks } from './collaborationMultiReplicaRuntime';

function buildReplica(overrides?: Partial<CrossDeviceReplica>): CrossDeviceReplica {
  return {
    entityId: 'segment:001',
    deviceId: 'device-a',
    sessionId: 'session-a',
    vectorClock: {
      'device-a': 2,
      'device-b': 1,
      'device-c': 0,
    },
    updatedAt: 1_710_000_001_000,
    fields: {
      text: 'hello',
      reviewed: false,
    },
    ...overrides,
  };
}

describe('collaboration multi-replica runtime', () => {
  it('[batch] plans replica chunks with deterministic tail size', () => {
    const plan = planReplicaSyncChunks(10, 3);
    expect(plan.chunkSize).toBe(3);
    expect(plan.chunkCount).toBe(4);
    expect(plan.lastChunkSize).toBe(1);
  });

  it('[batch] merges three compatible replicas and keeps rollback disabled', () => {
    const replicas: CrossDeviceReplica[] = [
      buildReplica({
        deviceId: 'device-a',
        vectorClock: { 'device-a': 2, 'device-b': 1, 'device-c': 1 },
        updatedAt: 2_000,
        fields: { text: 'hello', reviewed: false },
      }),
      buildReplica({
        deviceId: 'device-b',
        sessionId: 'session-b',
        vectorClock: { 'device-a': 2, 'device-b': 2, 'device-c': 1 },
        updatedAt: 2_500,
        fields: { text: 'hello', reviewed: true },
      }),
      buildReplica({
        deviceId: 'device-c',
        sessionId: 'session-c',
        vectorClock: { 'device-a': 2, 'device-b': 2, 'device-c': 2 },
        updatedAt: 3_000,
        fields: { text: 'hello', reviewed: true, confidence: 0.9 },
      }),
    ];

    const merged = mergeReplicaBatch({
      entityId: 'segment:001',
      replicas,
      quorum: 0.66,
      driftBudgetMs: 2_000,
    });

    expect(merged.resolved).not.toBeNull();
    expect(merged.requiresRollback).toBe(false);
    expect(merged.rollbackAction).toBe('none');
  });

  it('[quorum] requires rollback when quorum is not reached', () => {
    const replicas: CrossDeviceReplica[] = [
      buildReplica({ deviceId: 'device-a', updatedAt: 2_000 }),
      buildReplica({
        deviceId: 'device-b',
        sessionId: 'session-b',
        vectorClock: { 'device-a': 1, 'device-b': 4, 'device-c': 0 },
        updatedAt: 9_500,
        fields: { text: 'remote divergent', reviewed: false },
      }),
      buildReplica({
        deviceId: 'device-c',
        sessionId: 'session-c',
        vectorClock: { 'device-a': 1, 'device-b': 0, 'device-c': 4 },
        updatedAt: 9_600,
        fields: { text: 'remote divergent c', reviewed: false },
      }),
    ];

    const merged = mergeReplicaBatch({
      entityId: 'segment:001',
      replicas,
      quorum: 0.9,
      driftBudgetMs: 1_000,
    });

    expect(merged.requiresRollback).toBe(true);
    expect(merged.conflicts.includes('quorum-not-reached')).toBe(true);
  });

  it('[rollback] uses hard rollback on risky concurrent delete/update in batch', () => {
    const replicas: CrossDeviceReplica[] = [
      buildReplica({
        deviceId: 'device-a',
        deleted: true,
        vectorClock: { 'device-a': 4, 'device-b': 1, 'device-c': 0 },
        updatedAt: 4_000,
      }),
      buildReplica({
        deviceId: 'device-b',
        sessionId: 'session-b',
        deleted: false,
        vectorClock: { 'device-a': 1, 'device-b': 4, 'device-c': 0 },
        updatedAt: 4_100,
        fields: { text: 'resurrect', reviewed: false },
      }),
      buildReplica({
        deviceId: 'device-c',
        sessionId: 'session-c',
        vectorClock: { 'device-a': 2, 'device-b': 3, 'device-c': 3 },
        updatedAt: 4_200,
      }),
    ];

    const merged = mergeReplicaBatch({
      entityId: 'segment:001',
      replicas,
      quorum: 0.66,
      driftBudgetMs: 5_000,
    });

    expect(merged.requiresManualReview).toBe(true);
    expect(merged.requiresRollback).toBe(true);
    expect(merged.rollbackAction).toBe('hard-rollback');
  });

  it('[multi-replica] rejects mixed entity batch', () => {
    const merged = mergeReplicaBatch({
      entityId: 'segment:001',
      replicas: [
        buildReplica({ entityId: 'segment:001' }),
        buildReplica({ deviceId: 'device-b', sessionId: 'session-b', entityId: 'segment:009' }),
      ],
      quorum: 0.5,
    });

    expect(merged.resolved).toBeNull();
    expect(merged.requiresRollback).toBe(true);
    expect(merged.conflicts.includes('entity-id-mismatch')).toBe(true);
  });

  it('[multi-replica] computes quorum ratio consistently', () => {
    const result = evaluateReplicaQuorum(5, 3, 0.6);
    expect(result.satisfied).toBe(true);
    expect(result.ratio).toBe(0.6);
  });
});
