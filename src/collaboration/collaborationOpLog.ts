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

export function appendOperationLog(
  logs: CollaborationOperationLog[],
  incoming: CollaborationOperationLog,
): CollaborationOperationLog[] {
  const merged = [...logs, incoming];
  merged.sort((left, right) => {
    if (left.at !== right.at) {
      return left.at - right.at;
    }
    return left.logId.localeCompare(right.logId);
  });
  return merged;
}
