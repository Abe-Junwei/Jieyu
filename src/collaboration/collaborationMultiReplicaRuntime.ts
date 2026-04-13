import {
  createCrossDeviceRollbackPlan,
  mergeCrossDeviceReplicas,
  type CrossDeviceMergeResult,
  type CrossDeviceReplica,
} from './collaborationCrossDeviceRuntime';

export interface ReplicaSyncChunkPlan {
  chunkSize: number;
  chunkCount: number;
  lastChunkSize: number;
}

export interface ReplicaQuorumResult {
  participantCount: number;
  acknowledgedCount: number;
  quorum: number;
  satisfied: boolean;
  ratio: number;
}

export interface ReplicaBatchMergeInput {
  entityId: string;
  replicas: CrossDeviceReplica[];
  quorum: number;
  driftBudgetMs?: number;
}

export interface ReplicaBatchMergeResult {
  resolved: CrossDeviceReplica | null;
  participantCount: number;
  successfulMerges: number;
  consensusRatio: number;
  conflicts: string[];
  requiresManualReview: boolean;
  requiresRollback: boolean;
  rollbackAction: 'none' | 'soft-rollback' | 'hard-rollback';
  digest: string;
}

function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function clampQuorum(quorum: number): number {
  if (!Number.isFinite(quorum)) return 1;
  return Math.max(0, Math.min(1, quorum));
}

function dedupeReplicas(replicas: CrossDeviceReplica[]): CrossDeviceReplica[] {
  const byDevice = new Map<string, CrossDeviceReplica>();
  for (const replica of replicas) {
    const current = byDevice.get(replica.deviceId);
    if (!current || replica.updatedAt >= current.updatedAt) {
      byDevice.set(replica.deviceId, {
        ...replica,
        vectorClock: { ...replica.vectorClock },
        fields: { ...replica.fields },
      });
    }
  }

  return [...byDevice.values()].sort((left, right) => {
    if (left.updatedAt !== right.updatedAt) {
      return left.updatedAt - right.updatedAt;
    }
    return left.deviceId.localeCompare(right.deviceId);
  });
}

function toMergeSeed(entityId: string): CrossDeviceMergeResult {
  return {
    merged: null,
    relation: 'concurrent',
    conflicts: ['seed-not-initialized'],
    requiresManualReview: true,
    requiresRollback: true,
    digest: hashString(entityId),
  };
}

export function planReplicaSyncChunks(replicaCount: number, maxChunkSize: number): ReplicaSyncChunkPlan {
  const safeReplicaCount = Math.max(0, Math.floor(replicaCount));
  const safeChunkSize = Math.max(1, Math.floor(maxChunkSize));
  const chunkCount = Math.ceil(safeReplicaCount / safeChunkSize);
  const lastChunkSize = safeReplicaCount === 0
    ? 0
    : (safeReplicaCount % safeChunkSize || safeChunkSize);

  return {
    chunkSize: safeChunkSize,
    chunkCount,
    lastChunkSize,
  };
}

export function evaluateReplicaQuorum(
  participantCount: number,
  acknowledgedCount: number,
  quorum: number,
): ReplicaQuorumResult {
  const safeParticipants = Math.max(0, Math.floor(participantCount));
  const safeAcknowledged = Math.max(0, Math.min(safeParticipants, Math.floor(acknowledgedCount)));
  const safeQuorum = clampQuorum(quorum);
  const ratio = safeParticipants === 0 ? 0 : safeAcknowledged / safeParticipants;

  return {
    participantCount: safeParticipants,
    acknowledgedCount: safeAcknowledged,
    quorum: safeQuorum,
    satisfied: ratio >= safeQuorum,
    ratio,
  };
}

export function createBatchRollbackPlan(
  mergeResult: CrossDeviceMergeResult,
  at = Date.now(),
): 'none' | 'soft-rollback' | 'hard-rollback' {
  return createCrossDeviceRollbackPlan(mergeResult, at).action;
}

export function mergeReplicaBatch(input: ReplicaBatchMergeInput): ReplicaBatchMergeResult {
  const normalized = dedupeReplicas(input.replicas);
  const participantCount = normalized.length;
  const conflicts = new Set<string>();

  if (participantCount === 0) {
    conflicts.add('empty-replica-batch');
    return {
      resolved: null,
      participantCount,
      successfulMerges: 0,
      consensusRatio: 0,
      conflicts: [...conflicts],
      requiresManualReview: true,
      requiresRollback: true,
      rollbackAction: 'hard-rollback',
      digest: '',
    };
  }

  if (normalized.some((replica) => replica.entityId !== input.entityId)) {
    conflicts.add('entity-id-mismatch');
    return {
      resolved: null,
      participantCount,
      successfulMerges: 0,
      consensusRatio: 0,
      conflicts: [...conflicts],
      requiresManualReview: true,
      requiresRollback: true,
      rollbackAction: 'hard-rollback',
      digest: '',
    };
  }

  let successfulMerges = 0;
  let mergeState = toMergeSeed(input.entityId);

  for (let index = 0; index < normalized.length; index += 1) {
    const current = normalized[index];
    if (!current) continue;

    if (!mergeState.merged) {
      mergeState = {
        merged: {
          ...current,
          vectorClock: { ...current.vectorClock },
          fields: { ...current.fields },
        },
        relation: 'equal',
        conflicts: [],
        requiresManualReview: false,
        requiresRollback: false,
        digest: hashString(`${current.entityId}:${current.deviceId}:${current.updatedAt}`),
      };
      continue;
    }

    const merged = mergeCrossDeviceReplicas(
      mergeState.merged,
      current,
      ...(input.driftBudgetMs !== undefined ? [{ driftBudgetMs: input.driftBudgetMs }] : []),
    );
    successfulMerges += 1;

    for (const conflict of merged.conflicts) {
      conflicts.add(conflict);
    }

    mergeState = {
      merged: merged.merged,
      relation: merged.relation,
      conflicts: merged.conflicts,
      requiresManualReview: mergeState.requiresManualReview || merged.requiresManualReview,
      requiresRollback: mergeState.requiresRollback || merged.requiresRollback,
      digest: merged.digest,
    };

    if (!merged.merged) {
      break;
    }
  }

  const resolved = mergeState.merged;
  const requiresManualReview = mergeState.requiresManualReview;

  const acknowledgedCount = resolved
    ? normalized.filter((replica) => {
      const merged = mergeCrossDeviceReplicas(
        resolved,
        replica,
        ...(input.driftBudgetMs !== undefined ? [{ driftBudgetMs: input.driftBudgetMs }] : []),
      );
      return !merged.requiresRollback && !merged.requiresManualReview;
    }).length
    : 0;

  const quorum = evaluateReplicaQuorum(participantCount, acknowledgedCount, input.quorum);
  if (!quorum.satisfied) {
    conflicts.add('quorum-not-reached');
  }

  const requiresRollback = mergeState.requiresRollback || !quorum.satisfied || !resolved;
  const digest = resolved
    ? hashString(`${mergeState.digest}:${participantCount}:${successfulMerges}:${quorum.ratio.toFixed(4)}`)
    : '';

  const rollbackAction = createBatchRollbackPlan(
    {
      merged: resolved,
      relation: mergeState.relation,
      conflicts: [...conflicts],
      requiresManualReview,
      requiresRollback,
      digest,
    },
    Date.now(),
  );

  return {
    resolved,
    participantCount,
    successfulMerges,
    consensusRatio: quorum.ratio,
    conflicts: [...conflicts],
    requiresManualReview,
    requiresRollback,
    rollbackAction,
    digest,
  };
}
