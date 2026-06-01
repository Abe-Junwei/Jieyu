import { useCallback, useEffect, useRef, useState } from 'react';
import { createLogger } from '../../observability/logger';
import {
  applyCollaborationInboundChange,
  createConflictResolutionLogForTicket,
  type CloudSyncConflictReviewTicket,
} from '../../collaboration/cloud/collaborationInboundChangeApplier';
import { buildLocalConflictRecord } from '../../collaboration/cloud/collaborationConflictRecordBuilders';
import {
  applyCollaborationRemoteMutation,
  type CloudSyncRawActions,
} from '../../collaboration/cloud/CollaborationProjectRemoteMutationService';
import {
  asRecord,
  createEntityShadowKey,
  createLocalSessionId,
  extractConflictFields,
} from '../../collaboration/cloud/cloudSyncConflictHelpers';
import type {
  CollaborationProjectChangeRecord,
  ProjectChangeOperation,
  ProjectEntityType,
} from '../../collaboration/cloud/syncTypes';
import type { CollaborationRecord } from '../../collaboration/collaborationConflictRuntime';
import {
  mergeOperationLogs,
  persistCollaborationOperationLogs,
  type CollaborationOperationLog,
} from '../../collaboration/collaborationRulesRuntime';

const log = createLogger('useCollaborationConflictReview');

interface ApplyRemoteChangeOptions {
  skipLoadSnapshot?: boolean;
  skipConflictGovernance?: boolean;
}

export interface UseCollaborationConflictReviewParams {
  collaborationProjectId: string;
  unitsRef: { readonly current: ReadonlyArray<{ id: string }> };
  layersRef: { readonly current: ReadonlyArray<{ id: string; key?: string; layerType?: string }> };
  layerLinksRef: {
    readonly current: ReadonlyArray<{
      transcriptionLayerKey: string;
      hostTranscriptionLayerId?: string;
      layerId: string;
    }>;
  };
  rawActionsRef: { readonly current: CloudSyncRawActions };
  runWithDbMutex: <T>(fn: () => Promise<T>) => Promise<T>;
  loadSnapshot: () => Promise<void>;
}

export interface UseCollaborationConflictReviewResult {
  conflictReviewTickets: CloudSyncConflictReviewTicket[];
  conflictOperationLogs: CollaborationOperationLog[];
  applyRemoteChangeToLocal: (
    change: CollaborationProjectChangeRecord,
    options?: ApplyRemoteChangeOptions,
  ) => Promise<void>;
  applyRemoteConflictTicket: (ticketId: string) => Promise<boolean>;
  keepLocalConflictTicket: (ticketId: string) => boolean;
  postponeConflictTicket: (ticketId: string) => void;
  rememberLocalShadowMutation: (
    entityType: ProjectEntityType,
    entityId: string,
    opType: ProjectChangeOperation,
    payload: Record<string, unknown> | undefined,
  ) => void;
}

export function useCollaborationConflictReview({
  collaborationProjectId,
  unitsRef,
  layersRef,
  layerLinksRef,
  rawActionsRef,
  runWithDbMutex,
  loadSnapshot,
}: UseCollaborationConflictReviewParams): UseCollaborationConflictReviewResult {
  const [conflictReviewTickets, setConflictReviewTickets] = useState<
    CloudSyncConflictReviewTicket[]
  >([]);
  const [conflictOperationLogs, setConflictOperationLogs] = useState<CollaborationOperationLog[]>(
    [],
  );
  const localSessionIdRef = useRef<string>(createLocalSessionId());
  const localShadowRecordsRef = useRef<Map<string, CollaborationRecord>>(new Map());
  const conflictReviewTicketsRef = useRef<CloudSyncConflictReviewTicket[]>([]);

  useEffect(() => {
    conflictReviewTicketsRef.current = conflictReviewTickets;
  }, [conflictReviewTickets]);

  useEffect(() => {
    setConflictReviewTickets([]);
    setConflictOperationLogs([]);
    localShadowRecordsRef.current.clear();
  }, [collaborationProjectId]);

  const appendConflictLogs = useCallback((logs: CollaborationOperationLog[]): void => {
    if (logs.length === 0) return;
    setConflictOperationLogs((prev) => mergeOperationLogs([...prev, ...logs]).slice(-200));
    void persistCollaborationOperationLogs(logs).catch((error) => {
      log.warn('failed to persist conflict operation logs', { err: error });
    });
  }, []);

  const resolveConflictSnapshotDeps = useCallback(
    () => ({
      units: unitsRef.current as ReadonlyArray<Record<string, unknown> & { id: string }>,
      layers: layersRef.current as ReadonlyArray<
        Record<string, unknown> & { id: string; key?: string; layerType?: string }
      >,
      layerLinks: layerLinksRef.current,
      localSessionId: localSessionIdRef.current,
      getLocalShadow: (shadowKey: string) => localShadowRecordsRef.current.get(shadowKey),
    }),
    [layerLinksRef, layersRef, unitsRef],
  );

  const resolveLocalConflictRecord = useCallback(
    (change: CollaborationProjectChangeRecord, remoteRecord: CollaborationRecord) =>
      buildLocalConflictRecord(change, remoteRecord, resolveConflictSnapshotDeps()),
    [resolveConflictSnapshotDeps],
  );

  const applyRemoteMutation = useCallback(
    async (
      change: CollaborationProjectChangeRecord,
      options?: ApplyRemoteChangeOptions,
    ): Promise<boolean> =>
      applyCollaborationRemoteMutation(change, options, {
        runWithDbMutex,
        rawActions: rawActionsRef.current,
        layers: layersRef.current,
        layerLinks: layerLinksRef.current,
        loadSnapshot,
      }),
    [layerLinksRef, layersRef, loadSnapshot, rawActionsRef, runWithDbMutex],
  );

  const applyRemoteChangeToLocal = useCallback(
    async (
      change: CollaborationProjectChangeRecord,
      options?: ApplyRemoteChangeOptions,
    ): Promise<void> => {
      await applyCollaborationInboundChange(change, options, {
        applyRemoteMutation,
        resolveLocalConflictRecord,
        appendConflictLogs,
        enqueueConflictReviewTicket: (ticket) => {
          setConflictReviewTickets((prev) => {
            if (prev.some((item) => item.ticketId === ticket.ticketId)) return prev;
            return [ticket, ...prev].slice(0, 100);
          });
        },
        deleteLocalShadow: (shadowKey) => {
          localShadowRecordsRef.current.delete(shadowKey);
        },
      });
    },
    [appendConflictLogs, applyRemoteMutation, resolveLocalConflictRecord],
  );

  const applyRemoteConflictTicket = useCallback(
    async (ticketId: string): Promise<boolean> => {
      const ticket = conflictReviewTicketsRef.current.find((item) => item.ticketId === ticketId);
      if (!ticket) return false;

      await applyRemoteChangeToLocal(ticket.remoteChange, {
        skipConflictGovernance: true,
      });

      appendConflictLogs([createConflictResolutionLogForTicket(ticket, 'manual-apply-remote')]);

      setConflictReviewTickets((prev) => prev.filter((item) => item.ticketId !== ticketId));
      localShadowRecordsRef.current.delete(
        createEntityShadowKey(ticket.entityType, ticket.entityId),
      );
      return true;
    },
    [appendConflictLogs, applyRemoteChangeToLocal],
  );

  const keepLocalConflictTicket = useCallback(
    (ticketId: string): boolean => {
      const ticket = conflictReviewTicketsRef.current.find((item) => item.ticketId === ticketId);
      if (!ticket) return false;

      appendConflictLogs([createConflictResolutionLogForTicket(ticket, 'manual-keep-local')]);

      setConflictReviewTickets((prev) => prev.filter((item) => item.ticketId !== ticketId));
      return true;
    },
    [appendConflictLogs],
  );

  const postponeConflictTicket = useCallback((ticketId: string): void => {
    setConflictReviewTickets((prev) => {
      const index = prev.findIndex((item) => item.ticketId === ticketId);
      if (index < 0) return prev;
      if (index === 0) return prev;
      const next = [...prev];
      const [target] = next.splice(index, 1);
      if (!target) return prev;
      return [target, ...next];
    });
  }, []);

  const rememberLocalShadowMutation = useCallback(
    (
      entityType: ProjectEntityType,
      entityId: string,
      opType: ProjectChangeOperation,
      payload: Record<string, unknown> | undefined,
    ): void => {
      const shadowKey = createEntityShadowKey(entityType, entityId);
      const previous = localShadowRecordsRef.current.get(shadowKey);

      const next: CollaborationRecord = {
        entityId,
        sessionId: localSessionIdRef.current,
        version: (previous?.version ?? 0) + 1,
        updatedAt: Date.now(),
        fields: {
          ...(previous?.fields ?? {}),
          ...extractConflictFields({
            entityType,
            entityId,
            opType,
            payload: asRecord(payload),
          }),
        },
        ...(opType === 'delete_entity' ? { deleted: true } : {}),
      };

      localShadowRecordsRef.current.set(shadowKey, next);
    },
    [],
  );

  return {
    conflictReviewTickets,
    conflictOperationLogs,
    applyRemoteChangeToLocal,
    applyRemoteConflictTicket,
    keepLocalConflictTicket,
    postponeConflictTicket,
    rememberLocalShadowMutation,
  };
}
