import type { CoordinationNotification } from '../coordination/coordinationLite';

function nowIso(): string {
  return new Date().toISOString();
}

function newAuditLogId(): string {
  return `audit_${nowIso()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function buildCoordinationAuditLog(params: {
  assistantId: string;
  taskSessionId: string;
  notification: CoordinationNotification;
  policy: { canRunInParallel: boolean; reason: 'readonly-parallel' | 'write-serialized' | 'verification-parallel' };
  quarantinedCount: number;
}) {
  return {
    id: newAuditLogId(),
    collection: 'ai_messages' as const,
    documentId: params.assistantId,
    action: 'update' as const,
    field: 'ai_coordination_lite' as const,
    oldValue: `step:${params.notification.taskId}`,
    newValue: params.notification.status,
    source: 'ai' as const,
    timestamp: nowIso(),
    requestId: params.notification.taskId,
    metadataJson: JSON.stringify({
      schemaVersion: 1,
      phase: 'coordination_lite',
      taskSessionId: params.taskSessionId,
      notification: params.notification,
      parallelPolicy: params.policy,
      quarantinedCount: params.quarantinedCount,
    }),
  };
}
