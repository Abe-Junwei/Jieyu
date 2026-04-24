/**
 * 事务同步「编排」：在内存中合并副本并产出 digest / 状态标签。
 * **不**执行 IndexedDB 或其它持久化回滚；`rolled-back` / `rollbackAction` 仅描述合并结论，调用方勿当作已撤销写入。 |
 * In-memory merge orchestration only — `rolled-back` / `rollbackAction` are diagnostic labels, not DB rollbacks.
 */
import { createLogger } from '../observability/logger';
import { mergeReplicaBatch, type ReplicaBatchMergeResult } from './collaborationMultiReplicaRuntime';
import type { CrossDeviceReplica } from './collaborationCrossDeviceRuntime';

const collaborationTxLog = createLogger('collaborationTransactionSync');

export interface TransactionEntitySyncInput {
  entityId: string;
  replicas: CrossDeviceReplica[];
  quorum: number;
  driftBudgetMs?: number;
}

export interface TransactionSyncInput {
  transactionId: string;
  entities: TransactionEntitySyncInput[];
  maxChunkSize: number;
}

export interface TransactionChunkPlan {
  entityCount: number;
  chunkSize: number;
  chunkCount: number;
  lastChunkSize: number;
}

export interface TransactionEntityOutcome {
  entityId: string;
  result: ReplicaBatchMergeResult;
}

export interface TransactionAtomicityResult {
  allCommitted: boolean;
  committedCount: number;
  rolledBackCount: number;
  consensusRatio: number;
  blockingEntityIds: string[];
}

export interface TransactionSyncResult {
  transactionId: string;
  /** 合并是否全部无阻塞；`rolled-back` 不表示数据库已回滚 | Logical status only — not a Dexie transaction rollback */
  status: 'committed' | 'rolled-back';
  outcomes: TransactionEntityOutcome[];
  atomicity: TransactionAtomicityResult;
  /** 建议的后续处理标签，非已执行的存储回滚 | Advisory label for callers, not an executed storage rollback */
  rollbackAction: 'none' | 'soft-rollback' | 'hard-rollback';
  conflicts: string[];
  digest: string;
}

function reportCollaborationReplicaMergeLogicalFailure(input: {
  transactionId: string;
  digest: string;
  atomicity: TransactionAtomicityResult;
  conflicts: string[];
}): void {
  collaborationTxLog.warn(
    'Replica merge finished without full commit (diagnostic label only; no Dexie rollback was executed)',
    {
      transactionId: input.transactionId,
      digest: input.digest,
      blockingEntityIds: input.atomicity.blockingEntityIds,
      rolledBackCount: input.atomicity.rolledBackCount,
      conflicts: input.conflicts,
    },
  );
  void import('@sentry/react')
    .then((mod) => {
      if (typeof mod.captureMessage === 'function') {
        mod.captureMessage('Collaboration replica merge logical rolled-back (no Dexie rollback executed)', {
          level: 'warning',
          tags: { domain: 'collaboration', kind: 'replica_merge_incomplete' },
          extra: {
            transactionId: input.transactionId,
            digest: input.digest,
            blockingEntityIds: input.atomicity.blockingEntityIds,
          },
        });
      }
    })
    .catch(() => {
      /* Sentry optional at runtime */
    });
}

function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function planTransactionSyncChunks(entityCount: number, maxChunkSize: number): TransactionChunkPlan {
  const safeEntityCount = Math.max(0, Math.floor(entityCount));
  const safeChunkSize = Math.max(1, Math.floor(maxChunkSize));
  const chunkCount = Math.ceil(safeEntityCount / safeChunkSize);
  const lastChunkSize = safeEntityCount === 0
    ? 0
    : (safeEntityCount % safeChunkSize || safeChunkSize);

  return {
    entityCount: safeEntityCount,
    chunkSize: safeChunkSize,
    chunkCount,
    lastChunkSize,
  };
}

export function evaluateTransactionAtomicity(
  outcomes: TransactionEntityOutcome[],
): TransactionAtomicityResult {
  const blockingEntityIds = outcomes
    .filter((item) => item.result.requiresRollback || item.result.requiresManualReview || item.result.resolved === null)
    .map((item) => item.entityId);
  const committedCount = outcomes.length - blockingEntityIds.length;
  const rolledBackCount = blockingEntityIds.length;
  const consensusRatio = outcomes.length === 0
    ? 0
    : outcomes.reduce((sum, item) => sum + item.result.consensusRatio, 0) / outcomes.length;

  return {
    allCommitted: blockingEntityIds.length === 0,
    committedCount,
    rolledBackCount,
    consensusRatio,
    blockingEntityIds,
  };
}

/**
 * 合并未全部达成仲裁时的**建议**清理档位；不执行任何存储回滚（CRITICAL-4）。 |
 * Advisory cleanup tier when merge did not fully commit — does not run storage rollback.
 */
export function createBestEffortCleanupPlan(
  atomicity: TransactionAtomicityResult,
): 'none' | 'soft-rollback' | 'hard-rollback' {
  if (atomicity.allCommitted) {
    return 'none';
  }
  if (atomicity.rolledBackCount >= 1) {
    return 'hard-rollback';
  }
  return 'soft-rollback';
}

/** @deprecated Use {@link createBestEffortCleanupPlan} — legacy name; still not a DB rollback. */
export const createTransactionalRollbackPlan = createBestEffortCleanupPlan;

export function executeTransactionalReplicaSync(input: TransactionSyncInput): TransactionSyncResult {
  const outcomes: TransactionEntityOutcome[] = [];
  const conflicts = new Set<string>();
  const seenEntityIds = new Set<string>();

  for (const entity of input.entities) {
    if (seenEntityIds.has(entity.entityId)) {
      conflicts.add('duplicate-entity-id');
      outcomes.push({
        entityId: entity.entityId,
        result: {
          resolved: null,
          participantCount: entity.replicas.length,
          successfulMerges: 0,
          consensusRatio: 0,
          conflicts: ['duplicate-entity-id'],
          requiresManualReview: true,
          requiresRollback: true,
          rollbackAction: 'hard-rollback',
          digest: '',
        },
      });
      continue;
    }
    seenEntityIds.add(entity.entityId);

    const result = mergeReplicaBatch({
      entityId: entity.entityId,
      replicas: entity.replicas,
      quorum: entity.quorum,
      ...(entity.driftBudgetMs !== undefined ? { driftBudgetMs: entity.driftBudgetMs } : {}),
    });

    for (const conflict of result.conflicts) {
      conflicts.add(conflict);
    }

    outcomes.push({
      entityId: entity.entityId,
      result,
    });
  }

  const atomicity = evaluateTransactionAtomicity(outcomes);
  const rollbackAction = createBestEffortCleanupPlan(atomicity);
  const status: 'committed' | 'rolled-back' = atomicity.allCommitted ? 'committed' : 'rolled-back';

  const digest = hashString(JSON.stringify({
    transactionId: input.transactionId,
    status,
    outcomes: outcomes.map((item) => ({
      entityId: item.entityId,
      digest: item.result.digest,
      consensusRatio: item.result.consensusRatio,
      rollbackAction: item.result.rollbackAction,
    })),
    atomicity,
    conflicts: [...conflicts].sort(),
  }));

  const result: TransactionSyncResult = {
    transactionId: input.transactionId,
    status,
    outcomes,
    atomicity,
    rollbackAction,
    conflicts: [...conflicts],
    digest,
  };

  if (status === 'rolled-back') {
    reportCollaborationReplicaMergeLogicalFailure({
      transactionId: input.transactionId,
      digest,
      atomicity,
      conflicts: result.conflicts,
    });
  }

  return result;
}
