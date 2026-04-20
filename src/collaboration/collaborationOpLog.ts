import { getDb } from '../db';

export type CollaborationOperationType =
  | 'arbitration_requested'
  | 'arbitration_decided'
  | 'reconnect_validated'
  | 'conflict_resolved';

export interface CollaborationOperationLog {
  logId: string;
  type: CollaborationOperationType;
  entityId: string;
  sessionId: string;
  at: number;
  payloadDigest: string;
  // 审计扩展字段（仅 conflict_resolved 填充） | Audit fields (populated only for conflict_resolved)
  strategy?: string;
  conflictCodes?: string[];
  decisionId?: string;
  /** 与观测侧关联的轻量 trace id（resolveCollaborationConflicts 生成） | Trace id for observability correlation */
  traceId?: string;
}

export interface CreateCollaborationOperationLogInput {
  type: CollaborationOperationType;
  entityId: string;
  sessionId: string;
  at?: number;
  payloadSource: string;
  // 审计扩展 | Audit extensions
  strategy?: string;
  conflictCodes?: string[];
  decisionId?: string;
  traceId?: string;
}

function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function isMissingIndexedDbApiError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const detail = `${error.name}:${error.message}`;
  return detail.includes('MissingAPIError') || detail.includes('IndexedDB API missing');
}

export function createCollaborationOperationLog(
  input: CreateCollaborationOperationLogInput,
): CollaborationOperationLog {
  const at = input.at ?? Date.now();
  const payloadDigest = hashString(`${input.type}:${input.entityId}:${input.sessionId}:${input.payloadSource}`);

  return {
    logId: `log_${hashString(`${input.entityId}:${input.sessionId}:${at}:${input.type}:${input.payloadSource}`)}`,
    type: input.type,
    entityId: input.entityId,
    sessionId: input.sessionId,
    at,
    payloadDigest,
    ...(input.strategy !== undefined ? { strategy: input.strategy } : {}),
    ...(input.conflictCodes !== undefined ? { conflictCodes: input.conflictCodes } : {}),
    ...(input.decisionId !== undefined ? { decisionId: input.decisionId } : {}),
    ...(input.traceId !== undefined ? { traceId: input.traceId } : {}),
  };
}

export function mergeOperationLogs(logs: CollaborationOperationLog[]): CollaborationOperationLog[] {
  const deduped = new Map<string, CollaborationOperationLog>();
  for (const log of logs) {
    deduped.set(log.logId, log);
  }
  const merged = [...deduped.values()];
  merged.sort((left, right) => {
    if (left.at !== right.at) {
      return left.at - right.at;
    }
    return left.logId.localeCompare(right.logId);
  });
  return merged;
}

export function appendOperationLog(
  logs: CollaborationOperationLog[],
  incoming: CollaborationOperationLog,
): CollaborationOperationLog[] {
  return mergeOperationLogs([...logs, incoming]);
}

/**
 * 持久化协同冲突操作日志到审计仓 | Persist collaboration operation logs into audit storage
 */
export async function persistCollaborationOperationLogs(logs: CollaborationOperationLog[]): Promise<void> {
  const merged = mergeOperationLogs(logs);
  if (merged.length === 0) return;

  try {
    const db = await getDb();
    await db.dexie.audit_logs.bulkPut(merged.map((log) => ({
      id: `collab_${log.logId}`,
      collection: 'collaboration_conflicts',
      documentId: log.entityId,
      action: 'create' as const,
      field: 'operation_log',
      oldValue: '',
      newValue: log.type,
      source: 'system' as const,
      timestamp: new Date(log.at).toISOString(),
      requestId: log.logId,
      metadataJson: JSON.stringify({
        type: log.type,
        entityId: log.entityId,
        sessionId: log.sessionId,
        payloadDigest: log.payloadDigest,
        ...(log.strategy !== undefined ? { strategy: log.strategy } : {}),
        ...(log.conflictCodes !== undefined ? { conflictCodes: log.conflictCodes } : {}),
        ...(log.decisionId !== undefined ? { decisionId: log.decisionId } : {}),
        ...(log.traceId !== undefined ? { traceId: log.traceId } : {}),
      }),
    })));
  } catch (error) {
    if (isMissingIndexedDbApiError(error)) return;
    throw error;
  }
}
