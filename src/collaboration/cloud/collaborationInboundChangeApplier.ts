import { generateTraceId } from '../../observability/aiTrace';
import {
  createConflictResolutionLog,
  detectCollaborationConflicts,
  resolveCollaborationConflicts,
  type CollaborationRecord,
  type ConflictDescriptor,
} from '../../collaboration/collaborationConflictRuntime';
import {
  openArbitrationTicket,
  prioritizeConflicts,
  toArbitrationOperationLogs,
  type ArbitrationTicket,
  type CollaborationOperationLog,
} from '../../collaboration/collaborationRulesRuntime';
import {
  asString,
  createEntityShadowKey,
} from '../../collaboration/cloud/cloudSyncConflictHelpers';
import { buildRemoteConflictRecord } from '../../collaboration/cloud/collaborationConflictRecordBuilders';
import type {
  CollaborationProjectChangeRecord,
  ProjectEntityType,
} from '../../collaboration/cloud/syncTypes';

export interface ApplyRemoteChangeOptions {
  skipLoadSnapshot?: boolean;
  skipConflictGovernance?: boolean;
}

export interface CloudSyncConflictReviewTicket {
  ticketId: string;
  entityType: ProjectEntityType;
  entityId: string;
  createdAt: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
  conflictCodes: string[];
  remoteChange: CollaborationProjectChangeRecord;
  localRecord: CollaborationRecord;
  remoteRecord: CollaborationRecord;
  conflicts: ConflictDescriptor[];
  arbitration: ArbitrationTicket;
}

export interface CollaborationInboundChangeApplierDeps {
  applyRemoteMutation: (
    change: CollaborationProjectChangeRecord,
    options?: ApplyRemoteChangeOptions,
  ) => Promise<boolean>;
  resolveLocalConflictRecord: (
    change: CollaborationProjectChangeRecord,
    remoteRecord: CollaborationRecord,
  ) => CollaborationRecord;
  appendConflictLogs: (logs: CollaborationOperationLog[]) => void;
  enqueueConflictReviewTicket: (ticket: CloudSyncConflictReviewTicket) => void;
  deleteLocalShadow: (shadowKey: string) => void;
}

/**
 * Applies an inbound collaboration change with optional conflict governance.
 * React-free; hook wires setState via callbacks.
 */
export async function applyCollaborationInboundChange(
  change: CollaborationProjectChangeRecord,
  options: ApplyRemoteChangeOptions | undefined,
  deps: CollaborationInboundChangeApplierDeps,
): Promise<void> {
  const shadowKey = createEntityShadowKey(change.entityType, change.entityId);
  let resolvedLog: CollaborationOperationLog | null = null;

  if (options?.skipConflictGovernance !== true) {
    const remoteRecord = buildRemoteConflictRecord(change);
    const localRecord = deps.resolveLocalConflictRecord(change, remoteRecord);
    const detection = detectCollaborationConflicts(localRecord, remoteRecord, {
      stage: 'cross-device',
    });

    if (detection.hasConflict) {
      const prioritized = prioritizeConflicts(detection.conflicts);
      const hasHighRisk = prioritized.some(
        (item) => item.priority === 'critical' || item.priority === 'high',
      );
      const arbitration = openArbitrationTicket({
        entityId: change.entityId,
        operatorId: asString(change.actorId) ?? 'remote-operator',
        localSessionId: localRecord.sessionId,
        remoteSessionId: remoteRecord.sessionId,
        conflicts: detection.conflicts,
        preferredStrategy: hasHighRisk ? 'manual-review' : 'last-write-wins',
        note: `inbound:${change.opType}`,
      });
      deps.appendConflictLogs(toArbitrationOperationLogs(arbitration));

      if (arbitration.decision.selectedStrategy === 'manual-review') {
        const reviewTicket: CloudSyncConflictReviewTicket = {
          ticketId: arbitration.ticketId,
          entityType: change.entityType,
          entityId: change.entityId,
          createdAt: arbitration.createdAt,
          priority: prioritized[0]?.priority ?? 'medium',
          conflictCodes: detection.conflicts.map(
            (item) => `${item.scope}:${item.code}:${item.fieldKey ?? '*'}`,
          ),
          remoteChange: change,
          localRecord,
          remoteRecord,
          conflicts: detection.conflicts,
          arbitration,
        };
        deps.enqueueConflictReviewTicket(reviewTicket);
        return;
      }

      const resolution = resolveCollaborationConflicts(
        localRecord,
        remoteRecord,
        { stage: 'cross-device' },
        arbitration.decision.selectedStrategy,
      );
      if (resolution.resolved) {
        resolvedLog = createConflictResolutionLog(
          resolution.resolvedRecord ?? remoteRecord,
          arbitration.decision.selectedStrategy,
          detection.conflicts,
          Date.now(),
          arbitration.ticketId,
          resolution.resolutionTraceId,
        );
      }
    }
  }

  const mutated = await deps.applyRemoteMutation(change, options);

  if (resolvedLog) {
    deps.appendConflictLogs([resolvedLog]);
  }

  if (mutated) {
    deps.deleteLocalShadow(shadowKey);
  }
}

export function createConflictResolutionLogForTicket(
  ticket: CloudSyncConflictReviewTicket,
  strategy: 'manual-apply-remote' | 'manual-keep-local',
): CollaborationOperationLog {
  const traceSuffix = strategy === 'manual-apply-remote' ? 'apply-remote' : 'keep-local';
  const record = strategy === 'manual-apply-remote' ? ticket.remoteRecord : ticket.localRecord;
  return createConflictResolutionLog(
    record,
    strategy,
    ticket.conflicts,
    Date.now(),
    `${ticket.ticketId}:${traceSuffix}`,
    generateTraceId(),
  );
}
