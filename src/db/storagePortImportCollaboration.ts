import { getDb } from './engine';
import { StorageReadbackError } from './storageReadbackError';
import type { AuditLogDocType } from './types';
import type { CollaborationOperationLog } from '../collaboration/collaborationOpLog';

function collaborationAuditRow(log: CollaborationOperationLog): AuditLogDocType {
  return {
    id: `collab_${log.logId}`,
    collection: 'collaboration_conflicts',
    documentId: log.entityId,
    action: 'create',
    field: 'operation_log',
    oldValue: '',
    newValue: log.type,
    source: 'system',
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
  };
}

export async function putCollaborationOperationAuditLogs(
  logs: readonly CollaborationOperationLog[],
): Promise<void> {
  if (logs.length === 0) return;
  const rows = logs.map(collaborationAuditRow);
  const database = await getDb();
  await database.dexie.audit_logs.bulkPut(rows);
  for (const row of rows) {
    const stored = await database.dexie.audit_logs.get(row.id);
    if (!stored || stored.id !== row.id || stored.requestId !== row.requestId) {
      throw new StorageReadbackError('putCollaborationOperationAuditLogs');
    }
  }
}
