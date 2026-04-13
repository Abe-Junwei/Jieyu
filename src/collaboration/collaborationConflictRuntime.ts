export type CollaborationStage = 'async' | 'same-device-realtime' | 'cross-device';

export type ConflictScope = 'field' | 'entity' | 'session';

export type FieldValue = string | number | boolean | null;

export interface CollaborationRecord {
  entityId: string;
  sessionId: string;
  version: number;
  updatedAt: number;
  fields: Record<string, FieldValue>;
  deleted?: boolean;
}

export interface ConflictDescriptor {
  scope: ConflictScope;
  code: string;
  message: string;
  fieldKey?: string;
}

export interface ConflictDetectionResult {
  hasConflict: boolean;
  conflicts: ConflictDescriptor[];
}

export interface DetectConflictOptions {
  stage: CollaborationStage;
  sessionOverlapWindowMs?: number;
}

export type ConflictResolutionStrategy = 'last-write-wins' | 'manual-review';

export interface ResolveConflictResult {
  conflicts: ConflictDescriptor[];
  resolved: boolean;
  requiresManual: boolean;
  resolvedRecord: CollaborationRecord | null;
  consistencyDigest: string;
}

export interface ConsistencyCheckResult {
  consistent: boolean;
  mismatchCount: number;
  digest: string;
}

const DEFAULT_SESSION_OVERLAP_WINDOW_MS = 5_000;

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`);
  return `{${entries.join(',')}}`;
}

function fnv1aHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function unionFieldKeys(local: CollaborationRecord, remote: CollaborationRecord): string[] {
  return [...new Set([...Object.keys(local.fields), ...Object.keys(remote.fields)])].sort();
}

function buildCanonicalRecord(record: CollaborationRecord): Record<string, unknown> {
  const sortedFields = Object.fromEntries(
    Object.entries(record.fields).sort(([left], [right]) => left.localeCompare(right)),
  );
  return {
    entityId: record.entityId,
    sessionId: record.sessionId,
    version: record.version,
    updatedAt: record.updatedAt,
    deleted: record.deleted === true,
    fields: sortedFields,
  };
}

function pickLatest(local: CollaborationRecord, remote: CollaborationRecord): CollaborationRecord {
  if (local.updatedAt !== remote.updatedAt) {
    return local.updatedAt > remote.updatedAt ? local : remote;
  }
  if (local.version !== remote.version) {
    return local.version > remote.version ? local : remote;
  }
  return local.sessionId.localeCompare(remote.sessionId) <= 0 ? local : remote;
}

function cloneRecord(record: CollaborationRecord): CollaborationRecord {
  return {
    entityId: record.entityId,
    sessionId: record.sessionId,
    version: record.version,
    updatedAt: record.updatedAt,
    fields: { ...record.fields },
    ...(record.deleted === true ? { deleted: true } : {}),
  };
}

function hasEntityDeleteConflict(local: CollaborationRecord, remote: CollaborationRecord): boolean {
  return local.deleted === true || remote.deleted === true;
}

export function computeCollaborationDigest(record: CollaborationRecord): string {
  return fnv1aHash(stableStringify(buildCanonicalRecord(record)));
}

export function detectCollaborationConflicts(
  local: CollaborationRecord,
  remote: CollaborationRecord,
  options: DetectConflictOptions,
): ConflictDetectionResult {
  const conflicts: ConflictDescriptor[] = [];

  if (local.entityId !== remote.entityId) {
    conflicts.push({
      scope: 'session',
      code: 'entity-id-mismatch',
      message: `Cannot merge different entities: ${local.entityId} vs ${remote.entityId}`,
    });
  }

  if (hasEntityDeleteConflict(local, remote)) {
    if (local.deleted === true && remote.deleted === true) {
      conflicts.push({
        scope: 'entity',
        code: 'double-delete',
        message: 'Both replicas marked entity as deleted.',
      });
    } else {
      conflicts.push({
        scope: 'entity',
        code: 'delete-update',
        message: 'One replica deleted the entity while the other still updates it.',
      });
    }
  }

  if (!(local.deleted === true || remote.deleted === true)) {
    for (const fieldKey of unionFieldKeys(local, remote)) {
      const leftValue = local.fields[fieldKey];
      const rightValue = remote.fields[fieldKey];
      if (!Object.is(leftValue, rightValue)) {
        conflicts.push({
          scope: 'field',
          code: 'field-value-diverged',
          fieldKey,
          message: `Field value diverged on ${fieldKey}.`,
        });
      }
    }
  }

  const overlapWindowMs = options.sessionOverlapWindowMs ?? DEFAULT_SESSION_OVERLAP_WINDOW_MS;
  const isRealtimeStage = options.stage === 'same-device-realtime' || options.stage === 'cross-device';
  if (
    isRealtimeStage
    && local.sessionId !== remote.sessionId
    && Math.abs(local.updatedAt - remote.updatedAt) <= overlapWindowMs
  ) {
    conflicts.push({
      scope: 'session',
      code: 'session-concurrency-overlap',
      message: 'Concurrent edits detected in overlapping session windows.',
    });
  }

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
  };
}

export function resolveCollaborationConflicts(
  local: CollaborationRecord,
  remote: CollaborationRecord,
  options: DetectConflictOptions,
  strategy: ConflictResolutionStrategy,
): ResolveConflictResult {
  const detection = detectCollaborationConflicts(local, remote, options);

  if (strategy === 'manual-review' && detection.hasConflict) {
    return {
      conflicts: detection.conflicts,
      resolved: false,
      requiresManual: true,
      resolvedRecord: null,
      consistencyDigest: '',
    };
  }

  const latest = pickLatest(local, remote);

  if (hasEntityDeleteConflict(local, remote)) {
    if (latest.deleted === true) {
      const deletedRecord: CollaborationRecord = {
        entityId: latest.entityId,
        sessionId: latest.sessionId,
        version: Math.max(local.version, remote.version) + 1,
        updatedAt: Math.max(local.updatedAt, remote.updatedAt),
        fields: {},
        deleted: true,
      };
      return {
        conflicts: detection.conflicts,
        resolved: true,
        requiresManual: false,
        resolvedRecord: deletedRecord,
        consistencyDigest: computeCollaborationDigest(deletedRecord),
      };
    }
  }

  const mergedFields: Record<string, FieldValue> = {};
  for (const key of unionFieldKeys(local, remote)) {
    const leftValue = local.fields[key];
    const rightValue = remote.fields[key];
    if (Object.is(leftValue, rightValue)) {
      if (leftValue !== undefined) mergedFields[key] = leftValue;
      continue;
    }
    const chosen = latest === local ? leftValue : rightValue;
    if (chosen !== undefined) {
      mergedFields[key] = chosen;
    }
  }

  const resolvedRecord: CollaborationRecord = {
    entityId: latest.entityId,
    sessionId: latest.sessionId,
    version: Math.max(local.version, remote.version) + 1,
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
    fields: mergedFields,
    ...(latest.deleted === true ? { deleted: true } : {}),
  };

  return {
    conflicts: detection.conflicts,
    resolved: true,
    requiresManual: false,
    resolvedRecord,
    consistencyDigest: computeCollaborationDigest(resolvedRecord),
  };
}

export function evaluateResolutionConsistency(
  resolvedRecord: CollaborationRecord,
  replicaRecords: CollaborationRecord[],
): ConsistencyCheckResult {
  const targetDigest = computeCollaborationDigest(resolvedRecord);
  let mismatchCount = 0;
  for (const replica of replicaRecords) {
    const digest = computeCollaborationDigest(replica);
    if (digest !== targetDigest) {
      mismatchCount += 1;
    }
  }
  return {
    consistent: mismatchCount === 0,
    mismatchCount,
    digest: targetDigest,
  };
}

export function duplicateResolvedRecord(record: CollaborationRecord): CollaborationRecord {
  return cloneRecord(record);
}
