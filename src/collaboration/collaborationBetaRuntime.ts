import { createConflictResolutionLog, type CollaborationRecord, type ConflictDescriptor, type FieldValue } from './collaborationConflictRuntime';
import { appendOperationLog, createReconnectValidationLog, openArbitrationTicket, toArbitrationOperationLogs, validateReconnectConsistency, type ArbitrationTicket, type CollaborationOperationLog } from './collaborationRulesRuntime';

export interface LayerObjectState {
  layerId: string;
  objectId: string;
  version: number;
  updatedAt: number;
  fields: Record<string, FieldValue>;
  lastActorId: string;
  lastSessionId: string;
}

export interface LayerEditOperation {
  layerId: string;
  objectId: string;
  actorId: string;
  sessionId: string;
  editedAt: number;
  baseVersion: number;
  patch: Record<string, FieldValue>;
}

export interface MultiLayerBatchApplyResult {
  objects: LayerObjectState[];
  unresolvedTickets: ArbitrationTicket[];
  operationLogs: CollaborationOperationLog[];
  appliedCount: number;
}

export type CollaborationOperationLogWriter = (logs: CollaborationOperationLog[]) => void | Promise<void>;

export interface MultiLayerBatchPersistResult extends MultiLayerBatchApplyResult {
  persistedLogCount: number;
}

export interface BatchProcessingPlan {
  chunkSize: number;
  chunkCount: number;
  estimatedP95Ms: number;
  maxChunkDurationMs: number;
  meetsFrameBudget: boolean;
}

export interface CollaboratorHint {
  actorId: string;
  layerId: string;
  objectCount: number;
  lastEditedAt: number;
  message: string;
}

export interface ContinuousEditingStabilityResult {
  stable: boolean;
  brokenObjectCount: number;
  structuralDamageCount: number;
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

function toObjectKey(layerId: string, objectId: string): string {
  return `${layerId}::${objectId}`;
}

function cloneState(state: LayerObjectState): LayerObjectState {
  return {
    layerId: state.layerId,
    objectId: state.objectId,
    version: state.version,
    updatedAt: state.updatedAt,
    fields: { ...state.fields },
    lastActorId: state.lastActorId,
    lastSessionId: state.lastSessionId,
  };
}

function emptyState(operation: LayerEditOperation): LayerObjectState {
  return {
    layerId: operation.layerId,
    objectId: operation.objectId,
    version: 0,
    updatedAt: 0,
    fields: {},
    lastActorId: operation.actorId,
    lastSessionId: operation.sessionId,
  };
}

function toCollaborationRecord(state: LayerObjectState): CollaborationRecord {
  return {
    entityId: `${state.layerId}:${state.objectId}`,
    sessionId: state.lastSessionId,
    version: state.version,
    updatedAt: state.updatedAt,
    fields: { ...state.fields },
  };
}

function detectOperationConflicts(current: LayerObjectState, operation: LayerEditOperation): ConflictDescriptor[] {
  const conflicts: ConflictDescriptor[] = [];

  if (operation.baseVersion < current.version) {
    conflicts.push({
      scope: 'session',
      code: 'stale-base-version',
      message: 'Incoming operation baseVersion is older than current object version.',
    });
  }

  if (operation.editedAt < current.updatedAt) {
    conflicts.push({
      scope: 'session',
      code: 'stale-edit-timestamp',
      message: 'Incoming operation timestamp is older than the latest object timestamp.',
    });
  }

  const overlapWindowMs = 2_000;
  if (
    current.lastSessionId !== operation.sessionId
    && Math.abs(operation.editedAt - current.updatedAt) <= overlapWindowMs
  ) {
    conflicts.push({
      scope: 'session',
      code: 'layer-concurrency-overlap',
      message: 'Concurrent layer edits detected in overlap window.',
    });
  }

  return conflicts;
}

export function applyMultiLayerBatchEdits(
  baseObjects: LayerObjectState[],
  operations: LayerEditOperation[],
): MultiLayerBatchApplyResult {
  const objectMap = new Map<string, LayerObjectState>();
  for (const item of baseObjects) {
    objectMap.set(toObjectKey(item.layerId, item.objectId), cloneState(item));
  }

  const sortedOperations = [...operations].sort((left, right) => {
    if (left.editedAt !== right.editedAt) {
      return left.editedAt - right.editedAt;
    }
    if (left.layerId !== right.layerId) {
      return left.layerId.localeCompare(right.layerId);
    }
    if (left.objectId !== right.objectId) {
      return left.objectId.localeCompare(right.objectId);
    }
    return left.actorId.localeCompare(right.actorId);
  });

  const unresolvedTickets: ArbitrationTicket[] = [];
  let operationLogs: CollaborationOperationLog[] = [];
  let appliedCount = 0;

  for (const operation of sortedOperations) {
    const key = toObjectKey(operation.layerId, operation.objectId);
    const current = objectMap.get(key) ?? emptyState(operation);
    const conflicts = detectOperationConflicts(current, operation);
    let resolvedConflictStrategy: 'last-write-wins' | 'manual-review' | null = null;
    let resolvedTicketId: string | undefined;

    if (conflicts.length > 0) {
      const ticket = openArbitrationTicket({
        entityId: `${operation.layerId}:${operation.objectId}`,
        operatorId: operation.actorId,
        localSessionId: operation.sessionId,
        remoteSessionId: current.lastSessionId,
        conflicts,
        preferredStrategy: 'last-write-wins',
        at: operation.editedAt,
      });

      for (const log of toArbitrationOperationLogs(ticket)) {
        operationLogs = appendOperationLog(operationLogs, log);
      }

      if (ticket.decision.selectedStrategy === 'manual-review') {
        unresolvedTickets.push(ticket);
        continue;
      }

      resolvedConflictStrategy = ticket.decision.selectedStrategy;
      resolvedTicketId = ticket.ticketId;
    }

    const nextState: LayerObjectState = {
      layerId: current.layerId,
      objectId: current.objectId,
      version: Math.max(current.version, operation.baseVersion) + 1,
      updatedAt: Math.max(current.updatedAt, operation.editedAt),
      fields: {
        ...current.fields,
        ...operation.patch,
      },
      lastActorId: operation.actorId,
      lastSessionId: operation.sessionId,
    };

    objectMap.set(key, nextState);
    appliedCount += 1;

    if (conflicts.length > 0 && resolvedConflictStrategy !== null) {
      operationLogs = appendOperationLog(
        operationLogs,
        createConflictResolutionLog(
          toCollaborationRecord(nextState),
          resolvedConflictStrategy,
          conflicts,
          nextState.updatedAt,
          resolvedTicketId,
        ),
      );
    }
  }

  const objects = [...objectMap.values()].sort((left, right) => {
    if (left.layerId !== right.layerId) {
      return left.layerId.localeCompare(right.layerId);
    }
    return left.objectId.localeCompare(right.objectId);
  });

  return {
    objects,
    unresolvedTickets,
    operationLogs,
    appliedCount,
  };
}

function dedupeOperationLogs(logs: CollaborationOperationLog[]): CollaborationOperationLog[] {
  const seen = new Set<string>();
  const deduped: CollaborationOperationLog[] = [];
  for (const log of logs) {
    if (seen.has(log.logId)) {
      continue;
    }
    seen.add(log.logId);
    deduped.push(log);
  }
  return deduped;
}

export async function applyMultiLayerBatchEditsWithWriter(
  baseObjects: LayerObjectState[],
  operations: LayerEditOperation[],
  writeOperationLogs: CollaborationOperationLogWriter,
): Promise<MultiLayerBatchPersistResult> {
  const result = applyMultiLayerBatchEdits(baseObjects, operations);
  const operationLogs = dedupeOperationLogs(result.operationLogs);
  if (operationLogs.length > 0) {
    await writeOperationLogs(operationLogs);
  }
  return {
    ...result,
    operationLogs,
    persistedLogCount: operationLogs.length,
  };
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index] ?? 0;
}

export function planBatchProcessing(
  totalOperations: number,
  sampleDurationsMs: number[],
  targetFrameBudgetMs = 16,
): BatchProcessingPlan {
  const p95 = percentile(sampleDurationsMs, 0.95);
  const safeDuration = Math.max(p95, 0.1);
  const chunkSize = Math.max(1, Math.floor(targetFrameBudgetMs / safeDuration));
  const chunkCount = Math.ceil(Math.max(totalOperations, 0) / chunkSize);
  const maxChunkDurationMs = Number((chunkSize * safeDuration).toFixed(3));

  return {
    chunkSize,
    chunkCount,
    estimatedP95Ms: Number(p95.toFixed(3)),
    maxChunkDurationMs,
    meetsFrameBudget: maxChunkDurationMs <= targetFrameBudgetMs,
  };
}

export function buildCollaboratorHints(
  operations: LayerEditOperation[],
  now = Date.now(),
): CollaboratorHint[] {
  const grouped = new Map<string, { objectIds: Set<string>; lastEditedAt: number; actorId: string; layerId: string }>();

  for (const operation of operations) {
    const key = `${operation.actorId}::${operation.layerId}`;
    const bucket = grouped.get(key) ?? {
      objectIds: new Set<string>(),
      lastEditedAt: operation.editedAt,
      actorId: operation.actorId,
      layerId: operation.layerId,
    };

    bucket.objectIds.add(operation.objectId);
    bucket.lastEditedAt = Math.max(bucket.lastEditedAt, operation.editedAt);
    grouped.set(key, bucket);
  }

  const hints = [...grouped.values()].map((item) => {
    const deltaSeconds = Math.max(0, Math.floor((now - item.lastEditedAt) / 1_000));
    const objectCount = item.objectIds.size;
    return {
      actorId: item.actorId,
      layerId: item.layerId,
      objectCount,
      lastEditedAt: item.lastEditedAt,
      message: `${item.actorId} edited ${objectCount} object(s) on ${item.layerId}, ${deltaSeconds}s ago.`,
    } satisfies CollaboratorHint;
  });

  hints.sort((left, right) => right.lastEditedAt - left.lastEditedAt);
  return hints;
}

function isRecordArrayValid(records: CollaborationRecord[]): boolean {
  const seenEntityIds = new Set<string>();
  for (const record of records) {
    if (!record || typeof record !== 'object') {
      return false;
    }
    if (typeof record.entityId !== 'string' || typeof record.sessionId !== 'string') {
      return false;
    }
    if (seenEntityIds.has(record.entityId)) {
      return false;
    }
    seenEntityIds.add(record.entityId);
  }
  return true;
}

function normalizeReplicaForStability(
  baseline: CollaborationRecord,
  replica: CollaborationRecord,
): CollaborationRecord {
  if (replica.sessionId === baseline.sessionId) {
    return replica;
  }
  return {
    ...replica,
    sessionId: baseline.sessionId,
  };
}

export function evaluateContinuousEditingStability(
  baselineRecords: CollaborationRecord[],
  replicaSnapshots: CollaborationRecord[][],
): ContinuousEditingStabilityResult {
  let brokenObjectCount = 0;
  let structuralDamageCount = 0;

  for (const snapshot of replicaSnapshots) {
    if (!isRecordArrayValid(snapshot)) {
      structuralDamageCount += 1;
      continue;
    }

    const snapshotByEntity = new Map(snapshot.map((item) => [item.entityId, item]));

    for (const baseline of baselineRecords) {
      const replica = snapshotByEntity.get(baseline.entityId);
      if (!replica) {
        brokenObjectCount += 1;
        continue;
      }

      const consistency = validateReconnectConsistency(
        baseline,
        [normalizeReplicaForStability(baseline, replica)],
      );
      if (consistency.hasStructuralDamage) {
        structuralDamageCount += 1;
      }
      if (!consistency.consistent) {
        brokenObjectCount += 1;
      }
    }
  }

  const stable = brokenObjectCount === 0 && structuralDamageCount === 0;
  const digestSource = JSON.stringify({
    baseline: baselineRecords.length,
    snapshots: replicaSnapshots.length,
    brokenObjectCount,
    structuralDamageCount,
  });

  return {
    stable,
    brokenObjectCount,
    structuralDamageCount,
    digest: hashString(digestSource),
  };
}

export function createStabilityValidationLog(
  entityId: string,
  sessionId: string,
  result: ContinuousEditingStabilityResult,
  at = Date.now(),
): CollaborationOperationLog {
  return createReconnectValidationLog(
    entityId,
    sessionId,
    {
      consistent: result.stable,
      mismatchCount: result.brokenObjectCount,
      hasStructuralDamage: result.structuralDamageCount > 0,
      digest: result.digest,
      replicaDigests: [result.digest],
    },
    at,
  );
}
