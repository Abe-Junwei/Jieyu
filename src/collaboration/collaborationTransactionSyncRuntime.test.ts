import { describe, expect, it } from 'vitest';

import type { CrossDeviceReplica } from './collaborationCrossDeviceRuntime';
import {
  evaluateTransactionAtomicity,
  executeTransactionalReplicaSync,
  planTransactionSyncChunks,
} from './collaborationTransactionSyncRuntime';

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

describe('collaboration transaction sync runtime', () => {
  it('[txn] plans transaction chunks with deterministic tail size', () => {
    const plan = planTransactionSyncChunks(9, 4);
    expect(plan.chunkSize).toBe(4);
    expect(plan.chunkCount).toBe(3);
    expect(plan.lastChunkSize).toBe(1);
  });

  it('[txn] commits when all entities satisfy quorum and consistency', () => {
    const result = executeTransactionalReplicaSync({
      transactionId: 'tx-commit',
      maxChunkSize: 2,
      entities: [
        {
          entityId: 'segment:001',
          quorum: 0.66,
          replicas: [
            buildReplica({ entityId: 'segment:001', deviceId: 'device-a', updatedAt: 2_000 }),
            buildReplica({ entityId: 'segment:001', deviceId: 'device-b', sessionId: 'session-b', updatedAt: 2_100 }),
            buildReplica({ entityId: 'segment:001', deviceId: 'device-c', sessionId: 'session-c', updatedAt: 2_200 }),
          ],
        },
        {
          entityId: 'segment:002',
          quorum: 0.66,
          replicas: [
            buildReplica({ entityId: 'segment:002', deviceId: 'device-a', updatedAt: 3_000 }),
            buildReplica({ entityId: 'segment:002', deviceId: 'device-b', sessionId: 'session-b', updatedAt: 3_100 }),
            buildReplica({ entityId: 'segment:002', deviceId: 'device-c', sessionId: 'session-c', updatedAt: 3_200 }),
          ],
        },
      ],
    });

    expect(result.status).toBe('committed');
    expect(result.rollbackAction).toBe('none');
    expect(result.atomicity.allCommitted).toBe(true);
  });

  it('[atomic] rolls back full transaction when one entity fails quorum', () => {
    const result = executeTransactionalReplicaSync({
      transactionId: 'tx-rollback',
      maxChunkSize: 2,
      entities: [
        {
          entityId: 'segment:001',
          quorum: 0.66,
          replicas: [
            buildReplica({ entityId: 'segment:001', deviceId: 'device-a', updatedAt: 2_000 }),
            buildReplica({ entityId: 'segment:001', deviceId: 'device-b', sessionId: 'session-b', updatedAt: 2_100 }),
            buildReplica({ entityId: 'segment:001', deviceId: 'device-c', sessionId: 'session-c', updatedAt: 2_200 }),
          ],
        },
        {
          entityId: 'segment:002',
          quorum: 0.95,
          driftBudgetMs: 1_000,
          replicas: [
            buildReplica({ entityId: 'segment:002', deviceId: 'device-a', updatedAt: 2_000 }),
            buildReplica({
              entityId: 'segment:002',
              deviceId: 'device-b',
              sessionId: 'session-b',
              updatedAt: 9_000,
              vectorClock: { 'device-a': 1, 'device-b': 4, 'device-c': 0 },
              fields: { text: 'diverged b', reviewed: false },
            }),
            buildReplica({
              entityId: 'segment:002',
              deviceId: 'device-c',
              sessionId: 'session-c',
              updatedAt: 9_100,
              vectorClock: { 'device-a': 1, 'device-b': 0, 'device-c': 4 },
              fields: { text: 'diverged c', reviewed: false },
            }),
          ],
        },
      ],
    });

    expect(result.status).toBe('rolled-back');
    expect(result.rollbackAction).toBe('hard-rollback');
    expect(result.atomicity.allCommitted).toBe(false);
    expect(result.atomicity.blockingEntityIds.includes('segment:002')).toBe(true);
  });

  it('[rollback] enforces hard rollback for duplicate entity id inside transaction', () => {
    const result = executeTransactionalReplicaSync({
      transactionId: 'tx-duplicate',
      maxChunkSize: 2,
      entities: [
        {
          entityId: 'segment:001',
          quorum: 0.66,
          replicas: [buildReplica({ entityId: 'segment:001' })],
        },
        {
          entityId: 'segment:001',
          quorum: 0.66,
          replicas: [buildReplica({ entityId: 'segment:001', deviceId: 'device-b', sessionId: 'session-b' })],
        },
      ],
    });

    expect(result.status).toBe('rolled-back');
    expect(result.conflicts.includes('duplicate-entity-id')).toBe(true);
    expect(result.rollbackAction).toBe('hard-rollback');
  });

  it('[cross-entity] aggregates entity outcomes and computes atomicity ratio', () => {
    const outcome = evaluateTransactionAtomicity([
      {
        entityId: 'segment:001',
        result: {
          resolved: buildReplica({ entityId: 'segment:001' }),
          participantCount: 3,
          successfulMerges: 2,
          consensusRatio: 1,
          conflicts: [],
          requiresManualReview: false,
          requiresRollback: false,
          rollbackAction: 'none',
          digest: 'd1',
        },
      },
      {
        entityId: 'segment:002',
        result: {
          resolved: null,
          participantCount: 3,
          successfulMerges: 0,
          consensusRatio: 0,
          conflicts: ['quorum-not-reached'],
          requiresManualReview: true,
          requiresRollback: true,
          rollbackAction: 'hard-rollback',
          digest: 'd2',
        },
      },
    ]);

    expect(outcome.allCommitted).toBe(false);
    expect(outcome.committedCount).toBe(1);
    expect(outcome.rolledBackCount).toBe(1);
    expect(outcome.consensusRatio).toBe(0.5);
    expect(outcome.blockingEntityIds).toEqual(['segment:002']);
  });
});
