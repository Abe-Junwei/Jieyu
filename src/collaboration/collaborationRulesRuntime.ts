import { computeCollaborationDigest, evaluateResolutionConsistency, type CollaborationRecord, type ConflictDescriptor, type ConflictResolutionStrategy } from './collaborationConflictRuntime';
import {
  createCollaborationOperationLog,
  type CollaborationOperationLog,
} from './collaborationOpLog';

export {
  appendOperationLog,
  mergeOperationLogs,
  persistCollaborationOperationLogs,
  type CollaborationOperationLog,
  type CollaborationOperationType,
} from './collaborationOpLog';

export type ConflictPriority = 'critical' | 'high' | 'medium' | 'low';

export interface PrioritizedConflict {
  conflict: ConflictDescriptor;
  priority: ConflictPriority;
  rank: number;
  signature: string;
}

export interface ArbitrationDecision {
  accepted: boolean;
  selectedStrategy: ConflictResolutionStrategy;
  reason: string;
}

export interface OpenArbitrationTicketInput {
  entityId: string;
  operatorId: string;
  localSessionId: string;
  remoteSessionId: string;
  conflicts: ConflictDescriptor[];
  preferredStrategy: ConflictResolutionStrategy;
  at?: number;
  note?: string;
}

export interface ArbitrationTicket {
  ticketId: string;
  entityId: string;
  operatorId: string;
  localSessionId: string;
  remoteSessionId: string;
  createdAt: number;
  prioritizedConflicts: PrioritizedConflict[];
  decision: ArbitrationDecision;
  note?: string;
}


export interface ReconnectConsistencyResult {
  consistent: boolean;
  mismatchCount: number;
  hasStructuralDamage: boolean;
  digest: string;
  replicaDigests: string[];
}

const PRIORITY_RANK: Record<ConflictPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function conflictSignature(conflict: ConflictDescriptor): string {
  return `${conflict.scope}:${conflict.code}:${conflict.fieldKey ?? '*'}`;
}

function resolveConflictPriority(conflict: ConflictDescriptor): ConflictPriority {
  if (conflict.scope === 'entity' || conflict.code === 'entity-id-mismatch') {
    return 'critical';
  }
  if (conflict.scope === 'session') {
    return 'high';
  }
  if (conflict.scope === 'field') {
    return 'medium';
  }
  return 'low';
}

function isFieldValueValid(value: unknown): boolean {
  if (value === null) {
    return true;
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  return false;
}

function isRecordStructurallyValid(record: CollaborationRecord): boolean {
  if (!record || typeof record !== 'object') {
    return false;
  }
  if (typeof record.entityId !== 'string' || record.entityId.trim().length === 0) {
    return false;
  }
  if (typeof record.sessionId !== 'string' || record.sessionId.trim().length === 0) {
    return false;
  }
  if (!Number.isInteger(record.version) || record.version < 0) {
    return false;
  }
  if (!Number.isFinite(record.updatedAt) || record.updatedAt < 0) {
    return false;
  }
  if (!record.fields || typeof record.fields !== 'object' || Array.isArray(record.fields)) {
    return false;
  }

  for (const value of Object.values(record.fields)) {
    if (!isFieldValueValid(value)) {
      return false;
    }
  }

  return true;
}

export function prioritizeConflicts(conflicts: ConflictDescriptor[]): PrioritizedConflict[] {
  const prioritized = conflicts.map((conflict) => {
    const priority = resolveConflictPriority(conflict);
    const signature = conflictSignature(conflict);
    return {
      conflict,
      priority,
      rank: PRIORITY_RANK[priority],
      signature,
    } satisfies PrioritizedConflict;
  });

  prioritized.sort((left, right) => {
    if (left.rank !== right.rank) {
      return left.rank - right.rank;
    }
    return left.signature.localeCompare(right.signature);
  });

  return prioritized;
}

export function openArbitrationTicket(input: OpenArbitrationTicketInput): ArbitrationTicket {
  const createdAt = input.at ?? Date.now();
  const prioritizedConflicts = prioritizeConflicts(input.conflicts);
  const hasCritical = prioritizedConflicts.some((item) => item.priority === 'critical');

  const selectedStrategy: ConflictResolutionStrategy = hasCritical ? 'manual-review' : input.preferredStrategy;
  const accepted = selectedStrategy === input.preferredStrategy;
  const reason = accepted
    ? 'Preferred strategy accepted by collaboration rules.'
    : 'Critical conflicts detected; switched to manual-review.';

  const signature = prioritizedConflicts.map((item) => item.signature).join('|');
  const ticketId = `arb_${hashString(`${input.entityId}:${input.operatorId}:${createdAt}:${signature}:${selectedStrategy}`)}`;

  return {
    ticketId,
    entityId: input.entityId,
    operatorId: input.operatorId,
    localSessionId: input.localSessionId,
    remoteSessionId: input.remoteSessionId,
    createdAt,
    prioritizedConflicts,
    decision: {
      accepted,
      selectedStrategy,
      reason,
    },
    ...(input.note !== undefined ? { note: input.note } : {}),
  };
}

export function toArbitrationOperationLogs(ticket: ArbitrationTicket): CollaborationOperationLog[] {
  return [
    createCollaborationOperationLog({
      type: 'arbitration_requested',
      entityId: ticket.entityId,
      sessionId: ticket.localSessionId,
      at: ticket.createdAt,
      payloadSource: `${ticket.ticketId}:request:${ticket.prioritizedConflicts.length}`,
    }),
    createCollaborationOperationLog({
      type: 'arbitration_decided',
      entityId: ticket.entityId,
      sessionId: ticket.localSessionId,
      at: ticket.createdAt + 1,
      payloadSource: `${ticket.ticketId}:decision:${ticket.decision.selectedStrategy}:${ticket.decision.accepted}`,
    }),
  ];
}

export function validateReconnectConsistency(
  resolvedRecord: CollaborationRecord,
  replicaRecords: CollaborationRecord[],
): ReconnectConsistencyResult {
  const allRecords = [resolvedRecord, ...replicaRecords];
  if (!allRecords.every(isRecordStructurallyValid)) {
    return {
      consistent: false,
      mismatchCount: replicaRecords.length,
      hasStructuralDamage: true,
      digest: '',
      replicaDigests: [],
    };
  }

  const consistency = evaluateResolutionConsistency(resolvedRecord, replicaRecords);
  return {
    consistent: consistency.consistent,
    mismatchCount: consistency.mismatchCount,
    hasStructuralDamage: false,
    digest: consistency.digest,
    replicaDigests: replicaRecords.map((item) => computeCollaborationDigest(item)),
  };
}

export function createReconnectValidationLog(
  entityId: string,
  sessionId: string,
  result: ReconnectConsistencyResult,
  at = Date.now(),
): CollaborationOperationLog {
  return createCollaborationOperationLog({
    type: 'reconnect_validated',
    entityId,
    sessionId,
    at,
    payloadSource: `${result.digest}:${result.mismatchCount}:${result.hasStructuralDamage}:${result.replicaDigests.join('|')}`,
  });
}
