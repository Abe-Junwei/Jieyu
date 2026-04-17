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
}

export interface CreateCollaborationOperationLogInput {
  type: CollaborationOperationType;
  entityId: string;
  sessionId: string;
  at?: number;
  payloadSource: string;
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
