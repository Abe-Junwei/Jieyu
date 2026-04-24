import { createLogger } from '../observability/logger';
import { normalizeLocale, type Locale } from '../i18n';
import { getCollaborationSyncSurfaceMessages } from '../i18n/messages';
import { dispatchAppGlobalToast } from '../utils/appGlobalToast';
import { type FieldValue } from './collaborationConflictRuntime';

const crossDeviceLog = createLogger('collaborationCrossDevice');

export type VectorClock = Record<string, number>;

export interface CrossDeviceReplica {
  entityId: string;
  deviceId: string;
  sessionId: string;
  vectorClock: VectorClock;
  updatedAt: number;
  fields: Record<string, FieldValue>;
  deleted?: boolean;
}

export type VectorClockRelation = 'local-dominates' | 'remote-dominates' | 'equal' | 'concurrent';

export interface ClockDriftAssessment {
  driftMs: number;
  exceedsBudget: boolean;
  budgetMs: number;
}

export interface CrossDeviceMergeResult {
  merged: CrossDeviceReplica | null;
  relation: VectorClockRelation;
  conflicts: string[];
  requiresManualReview: boolean;
  requiresRollback: boolean;
  digest: string;
}

export interface CrossDeviceRollbackPlan {
  action: 'none' | 'soft-rollback' | 'hard-rollback';
  reason: string;
  checkpointId: string;
}

export interface CrossDeviceConsistencyResult {
  consistent: boolean;
  mismatchCount: number;
  digest: string;
}

export interface MergeCrossDeviceOptions {
  driftBudgetMs?: number;
  /** 用于合并提示文案；不传则从 `document.documentElement.lang` 推断 */
  surfaceLocale?: Locale;
}

function resolveCollaborationSurfaceLocale(options: MergeCrossDeviceOptions | undefined): Locale {
  if (options?.surfaceLocale) {
    return options.surfaceLocale;
  }
  if (typeof document !== 'undefined' && document.documentElement?.lang) {
    return normalizeLocale(document.documentElement.lang) ?? 'en-US';
  }
  return 'en-US';
}

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

function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function canonicalReplica(replica: CrossDeviceReplica): Record<string, unknown> {
  return {
    entityId: replica.entityId,
    vectorClock: Object.fromEntries(Object.entries(replica.vectorClock).sort(([a], [b]) => a.localeCompare(b))),
    updatedAt: replica.updatedAt,
    deleted: replica.deleted === true,
    fields: Object.fromEntries(Object.entries(replica.fields).sort(([a], [b]) => a.localeCompare(b))),
  };
}

function unionClockKeys(left: VectorClock, right: VectorClock): string[] {
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
}

function mergeVectorClock(local: VectorClock, remote: VectorClock): VectorClock {
  const merged: VectorClock = {};
  for (const key of unionClockKeys(local, remote)) {
    merged[key] = Math.max(local[key] ?? 0, remote[key] ?? 0);
  }
  return merged;
}

function cloneReplica(replica: CrossDeviceReplica): CrossDeviceReplica {
  return {
    entityId: replica.entityId,
    deviceId: replica.deviceId,
    sessionId: replica.sessionId,
    vectorClock: { ...replica.vectorClock },
    updatedAt: replica.updatedAt,
    fields: { ...replica.fields },
    ...(replica.deleted === true ? { deleted: true } : {}),
  };
}

function chooseWinner(local: CrossDeviceReplica, remote: CrossDeviceReplica, relation: VectorClockRelation): CrossDeviceReplica {
  if (relation === 'local-dominates') return local;
  if (relation === 'remote-dominates') return remote;
  if (relation === 'equal') {
    if (local.updatedAt !== remote.updatedAt) {
      return local.updatedAt >= remote.updatedAt ? local : remote;
    }
    return local.deviceId.localeCompare(remote.deviceId) <= 0 ? local : remote;
  }
  if (local.updatedAt !== remote.updatedAt) {
    return local.updatedAt >= remote.updatedAt ? local : remote;
  }
  return local.deviceId.localeCompare(remote.deviceId) <= 0 ? local : remote;
}

export function compareVectorClock(local: VectorClock, remote: VectorClock): VectorClockRelation {
  let localGreater = false;
  let remoteGreater = false;

  for (const key of unionClockKeys(local, remote)) {
    const left = local[key] ?? 0;
    const right = remote[key] ?? 0;
    if (left > right) localGreater = true;
    if (right > left) remoteGreater = true;
  }

  if (!localGreater && !remoteGreater) return 'equal';
  if (localGreater && !remoteGreater) return 'local-dominates';
  if (!localGreater && remoteGreater) return 'remote-dominates';
  return 'concurrent';
}

export function assessClockDrift(
  local: CrossDeviceReplica,
  remote: CrossDeviceReplica,
  budgetMs = 3_000,
): ClockDriftAssessment {
  const driftMs = Math.abs(local.updatedAt - remote.updatedAt);
  return {
    driftMs,
    exceedsBudget: driftMs > budgetMs,
    budgetMs,
  };
}

export function computeCrossDeviceDigest(replica: CrossDeviceReplica): string {
  return hashString(stableStringify(canonicalReplica(replica)));
}

export function mergeCrossDeviceReplicas(
  local: CrossDeviceReplica,
  remote: CrossDeviceReplica,
  options?: MergeCrossDeviceOptions,
): CrossDeviceMergeResult {
  if (local.entityId !== remote.entityId) {
    return {
      merged: null,
      relation: 'concurrent',
      conflicts: ['entity-id-mismatch'],
      requiresManualReview: true,
      requiresRollback: true,
      digest: '',
    };
  }

  const relation = compareVectorClock(local.vectorClock, remote.vectorClock);
  const drift = assessClockDrift(local, remote, options?.driftBudgetMs ?? 3_000);
  const conflicts: string[] = [];

  if (relation === 'concurrent') {
    conflicts.push('concurrent-vector-clock');
  }
  if (drift.exceedsBudget) {
    conflicts.push('clock-drift-exceeded');
  }
  if ((local.deleted === true) !== (remote.deleted === true)) {
    conflicts.push('delete-update');
  }

  const winner = chooseWinner(local, remote, relation);
  const loser = winner === local ? remote : local;
  const mergedFields: Record<string, FieldValue> = { ...winner.fields };
  for (const [key, value] of Object.entries(loser.fields)) {
    if (!(key in mergedFields)) {
      mergedFields[key] = value;
    }
  }

  const supersededFieldKeys: string[] = [];
  let concurrentFieldLoserDiscarded = 0;
  for (const key of Object.keys(loser.fields)) {
    if (key in winner.fields) {
      if (stableStringify(winner.fields[key]) !== stableStringify(loser.fields[key])) {
        concurrentFieldLoserDiscarded += 1;
        supersededFieldKeys.push(key);
        crossDeviceLog.warn('mergeCrossDeviceReplicas: same-key field value differs; kept winner, discarded loser', {
          entityId: local.entityId,
          key,
          winnerDeviceId: winner.deviceId,
          loserDeviceId: loser.deviceId,
        });
      }
    }
  }
  if (concurrentFieldLoserDiscarded > 0) {
    crossDeviceLog.info('mergeCrossDeviceReplicas: concurrent merge audit', {
      entityId: local.entityId,
      supersededFieldCount: concurrentFieldLoserDiscarded,
      supersededFieldKeys: supersededFieldKeys.slice(0, 48),
      winnerDeviceId: winner.deviceId,
      loserDeviceId: loser.deviceId,
    });
    const locale = resolveCollaborationSurfaceLocale(options);
    const m = getCollaborationSyncSurfaceMessages(locale);
    dispatchAppGlobalToast({
      message: m.mergeLoserFieldsSuperseded(concurrentFieldLoserDiscarded),
      variant: 'warning',
      autoDismissMs: 9_000,
    });
    if (import.meta.env.PROD) {
      void import('@sentry/react')
        .then((Sentry) => {
          Sentry.captureMessage('mergeCrossDeviceReplicas: concurrent field(s) superseded', {
            level: 'info',
            tags: { jieyu_module: 'collaborationCrossDevice' },
            extra: {
              entityId: local.entityId,
              supersededFieldCount: concurrentFieldLoserDiscarded,
              supersededFieldKeys: supersededFieldKeys.slice(0, 40).join(', '),
              winnerDeviceId: winner.deviceId,
              loserDeviceId: loser.deviceId,
            },
          });
        })
        .catch(() => { /* Sentry 未安装或 DSN 关闭 | Sentry absent */ });
    }
  }

  const merged: CrossDeviceReplica = {
    entityId: local.entityId,
    deviceId: winner.deviceId,
    sessionId: winner.sessionId,
    vectorClock: mergeVectorClock(local.vectorClock, remote.vectorClock),
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
    fields: mergedFields,
    ...((winner.deleted === true || loser.deleted === true) ? { deleted: true } : {}),
  };

  const hasDeleteUpdateConflict = conflicts.includes('delete-update');
  const hasConcurrentClockConflict = conflicts.includes('concurrent-vector-clock');
  const requiresManualReview = hasDeleteUpdateConflict || hasConcurrentClockConflict;
  const requiresRollback = requiresManualReview || drift.exceedsBudget || conflicts.includes('entity-id-mismatch');

  return {
    merged,
    relation,
    conflicts,
    requiresManualReview,
    requiresRollback,
    digest: computeCrossDeviceDigest(merged),
  };
}

function normalizeReplicaForConsistency(base: CrossDeviceReplica, replica: CrossDeviceReplica): CrossDeviceReplica {
  return {
    ...replica,
    deviceId: base.deviceId,
    sessionId: base.sessionId,
  };
}

export function validateCrossDeviceConsistency(
  resolved: CrossDeviceReplica,
  replicas: CrossDeviceReplica[],
): CrossDeviceConsistencyResult {
  const digest = computeCrossDeviceDigest(resolved);
  let mismatchCount = 0;
  for (const replica of replicas) {
    const normalized = normalizeReplicaForConsistency(resolved, replica);
    const replicaDigest = computeCrossDeviceDigest(normalized);
    if (replicaDigest !== digest) {
      mismatchCount += 1;
    }
  }
  return {
    consistent: mismatchCount === 0,
    mismatchCount,
    digest,
  };
}

export function createCrossDeviceRollbackPlan(
  mergeResult: CrossDeviceMergeResult,
  at = Date.now(),
): CrossDeviceRollbackPlan {
  if (!mergeResult.requiresRollback) {
    return {
      action: 'none',
      reason: 'No rollback needed.',
      checkpointId: `cp_${hashString(`${at}:none`)}`,
    };
  }

  if (mergeResult.requiresManualReview) {
    return {
      action: 'hard-rollback',
      reason: 'Manual review required for high-risk concurrent delete/update conflict.',
      checkpointId: `cp_${hashString(`${at}:hard:${mergeResult.digest}`)}`,
    };
  }

  return {
    action: 'soft-rollback',
    reason: 'Clock drift exceeded budget; fallback to latest stable checkpoint.',
    checkpointId: `cp_${hashString(`${at}:soft:${mergeResult.digest}`)}`,
  };
}

export function duplicateCrossDeviceReplica(replica: CrossDeviceReplica): CrossDeviceReplica {
  return cloneReplica(replica);
}
