import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CollaborationAssetRecord,
  CollaborationProjectChangeRecord,
  CollaborationProjectSnapshotRecord,
  ProjectChangeOperation,
  ProjectEntityType,
} from '../collaboration/cloud/syncTypes';
import {
  evaluateCollaborationProtocolGuard,
  SUPPORTED_COLLABORATION_PROTOCOL_VERSION,
  type CollaborationProtocolGuardEvaluation,
} from '../collaboration/cloud/collaborationProtocolGuard';
import {
  CollaborationSyncBridge,
  type CreateProjectSnapshotInput,
  type ListProjectAssetsInput,
  type ListProjectSnapshotsInput,
  type QueryProjectTimelineInput,
  type RegisterProjectAssetInput,
} from '../collaboration/cloud/CollaborationSyncBridge';
import { ProjectChangeCodec } from '../collaboration/cloud/ProjectChangeCodec';
import type { ChangeTimelineResult } from '../collaboration/cloud/CollaborationAuditLogService';
import {
  hydrateCollabClientStateFromIdb,
  loadProjectLastSeenRevision,
  loadProjectPendingOutboundChanges,
  saveProjectLastSeenRevision,
} from '../collaboration/cloud/CollaborationClientStateStore';
import { getSupabaseBrowserClient, getSupabaseUserId, hasSupabaseBrowserClientConfig } from '../collaboration/cloud/collaborationSupabaseFacade';

interface UseTranscriptionCollaborationBridgeParams {
  enabled: boolean;
  projectId: string;
  onApplyRemoteChange?: (change: CollaborationProjectChangeRecord) => Promise<void>;
}

interface CollaborationChangeInsertRow {
  project_id: string;
  actor_id: string;
  client_id: string;
  client_op_id: string;
  session_id?: string;
  protocol_version: number;
  project_revision: number;
  base_revision: number;
  entity_type: ProjectEntityType;
  entity_id: string;
  op_type: ProjectChangeOperation;
  payload?: unknown;
  payload_ref_path?: string;
  vector_clock?: Record<string, number>;
  source_kind: 'user' | 'sync' | 'migration';
  created_at: string;
}

export interface TranscriptionCollaborationMutationInput {
  entityType: ProjectEntityType;
  entityId: string;
  opType: ProjectChangeOperation;
  payload?: Record<string, unknown>;
  payloadRefPath?: string;
}

function requireBridgeInstance(bridge: CollaborationSyncBridge | null): CollaborationSyncBridge {
  if (!bridge) {
    throw new Error('Collaboration bridge is not ready yet');
  }
  return bridge;
}

const DEFAULT_PROTOCOL_GUARD: CollaborationProtocolGuardEvaluation = {
  cloudWritesDisabled: false,
  reasons: [],
  outboundProtocolVersion: SUPPORTED_COLLABORATION_PROTOCOL_VERSION,
};

function assertCloudWritesAllowed(writeGuard: CollaborationProtocolGuardEvaluation): void {
  if (!writeGuard.cloudWritesDisabled) return;
  const detail = writeGuard.reasons.length > 0 ? writeGuard.reasons.join('; ') : 'cloud-writes-disabled';
  throw new Error(`Collaboration cloud writes are disabled: ${detail}`);
}

function createClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `web-${crypto.randomUUID()}`;
  }
  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function toChangeInsertRow(
  record: ReturnType<ProjectChangeCodec['encode']>,
): CollaborationChangeInsertRow {
  return {
    project_id: record.projectId,
    actor_id: record.actorId,
    client_id: record.clientId,
    client_op_id: record.clientOpId,
    ...(record.sessionId ? { session_id: record.sessionId } : {}),
    protocol_version: record.protocolVersion,
    project_revision: record.projectRevision,
    base_revision: record.baseRevision,
    entity_type: record.entityType,
    entity_id: record.entityId,
    op_type: record.opType,
    ...(record.payload !== undefined ? { payload: record.payload } : {}),
    ...(record.payloadRefPath ? { payload_ref_path: record.payloadRefPath } : {}),
    ...(record.vectorClock ? { vector_clock: record.vectorClock } : {}),
    source_kind: record.sourceKind,
    created_at: record.createdAt,
  };
}

export function useTranscriptionCollaborationBridge({
  enabled,
  projectId,
  onApplyRemoteChange,
}: UseTranscriptionCollaborationBridgeParams) {
  const normalizedProjectId = useMemo(() => projectId.trim(), [projectId]);
  const bridgeRef = useRef<CollaborationSyncBridge | null>(null);
  const codecRef = useRef<ProjectChangeCodec | null>(null);
  const clientIdRef = useRef<string>(createClientId());
  const latestRevisionRef = useRef<number>(0);
  const writeGuardRef = useRef<CollaborationProtocolGuardEvaluation>(DEFAULT_PROTOCOL_GUARD);
  const [isBridgeReady, setIsBridgeReady] = useState(false);
  const [protocolGuard, setProtocolGuard] = useState<CollaborationProtocolGuardEvaluation>(DEFAULT_PROTOCOL_GUARD);
  const [outboundPendingCount, setOutboundPendingCount] = useState(0);
  /** 云端从禁写切到允许写时递增，用于重启桥接以灌入持久化 pending | Bump when cloud flips disabled→enabled writes */
  const [writeGateEpoch, setWriteGateEpoch] = useState(0);

  const commitLatestRevision = useCallback((revision: number): void => {
    if (!Number.isFinite(revision)) return;
    const normalizedRevision = Math.max(0, Math.floor(revision));
    if (normalizedRevision <= latestRevisionRef.current) return;
    latestRevisionRef.current = normalizedRevision;
    if (normalizedProjectId) {
      saveProjectLastSeenRevision(normalizedProjectId, normalizedRevision);
    }
  }, [normalizedProjectId]);

  useEffect(() => {
    let disposed = false;

    const stopBridge = async () => {
      const current = bridgeRef.current;
      bridgeRef.current = null;
      codecRef.current = null;
      latestRevisionRef.current = 0;
      writeGuardRef.current = DEFAULT_PROTOCOL_GUARD;
      setProtocolGuard(DEFAULT_PROTOCOL_GUARD);
      setOutboundPendingCount(0);
      setIsBridgeReady(false);
      if (current) {
        await current.stop();
      }
    };

    if (!enabled || !normalizedProjectId || !hasSupabaseBrowserClientConfig()) {
      void stopBridge();
      return () => {
        disposed = true;
      };
    }

    const startBridge = async () => {
      await stopBridge();
      await hydrateCollabClientStateFromIdb();

      const actorId = await getSupabaseUserId();
      if (!actorId) {
        console.warn('[TranscriptionCollaborationBridge] skip bridge bootstrap without authenticated user');
        return;
      }
      if (disposed) return;

      const storedRevision = loadProjectLastSeenRevision(normalizedProjectId);
      latestRevisionRef.current = Math.max(0, storedRevision);

      const client = getSupabaseBrowserClient();
      const { data: projectRow, error: projectError } = await client
        .from('projects')
        .select('protocol_version, app_min_version')
        .eq('id', normalizedProjectId)
        .maybeSingle();

      if (projectError) {
        console.warn('[TranscriptionCollaborationBridge] failed to load project protocol guard:', projectError);
      }

      const guard = evaluateCollaborationProtocolGuard(
        projectRow
          ? {
            protocolVersion: projectRow.protocol_version,
            appMinVersion: projectRow.app_min_version,
          }
          : null,
      );
      writeGuardRef.current = guard;
      if (!disposed) {
        setProtocolGuard(guard);
      }

      const codec = new ProjectChangeCodec({
        protocolVersion: guard.outboundProtocolVersion,
        actorId,
        clientId: clientIdRef.current,
      });

      const bridge = new CollaborationSyncBridge({
        projectId: normalizedProjectId,
        initialOutboundPending: guard.cloudWritesDisabled
          ? []
          : loadProjectPendingOutboundChanges(normalizedProjectId),
        onOutboundPendingSizeChanged: (count) => {
          if (!disposed) {
            setOutboundPendingCount(count);
          }
        },
        onApplyRemoteChange: async (change) => {
          commitLatestRevision(change.projectRevision);
          if (change.clientId === clientIdRef.current) {
            return;
          }
          if (onApplyRemoteChange) {
            await onApplyRemoteChange(change);
          }
        },
        onSendLocalChanges: async (changes) => {
          if (changes.length === 0) return;
          if (writeGuardRef.current.cloudWritesDisabled) {
            const detail = writeGuardRef.current.reasons.length > 0
              ? writeGuardRef.current.reasons.join('; ')
              : 'cloud-writes-disabled';
            console.warn(
              '[TranscriptionCollaborationBridge] suppressed project_changes insert (protocol guard):',
              writeGuardRef.current.reasons,
            );
            throw new Error(`Collaboration cloud writes are disabled: ${detail}`);
          }
          const rows = changes.map(toChangeInsertRow);
          const { error } = await client.from('project_changes').insert(rows);
          if (error) throw error;
        },
        onError: (error, context) => {
          console.warn('[CollaborationSyncBridge] runtime error:', context, error);
        },
      });

      await bridge.start();
      if (disposed) {
        await bridge.stop();
        return;
      }

      bridgeRef.current = bridge;
      codecRef.current = codec;
      setIsBridgeReady(true);
    };

    void startBridge().catch((error: unknown) => {
      console.warn('[TranscriptionCollaborationBridge] failed to start bridge:', error);
    });

    return () => {
      disposed = true;
      void stopBridge();
    };
  }, [commitLatestRevision, enabled, normalizedProjectId, onApplyRemoteChange, writeGateEpoch]);

  useEffect(() => {
    if (!enabled || !normalizedProjectId || !hasSupabaseBrowserClientConfig()) return;
    if (typeof window === 'undefined') return;

    let cancelled = false;

    const refreshGuardFromCloud = async () => {
      try {
        const client = getSupabaseBrowserClient();
        const { data: projectRow, error } = await client
          .from('projects')
          .select('protocol_version, app_min_version')
          .eq('id', normalizedProjectId)
          .maybeSingle();
        if (cancelled || error) return;

        const next = evaluateCollaborationProtocolGuard(
          projectRow
            ? {
              protocolVersion: projectRow.protocol_version,
              appMinVersion: projectRow.app_min_version,
            }
            : null,
        );
        const prev = writeGuardRef.current;
        writeGuardRef.current = next;
        if (!cancelled) {
          setProtocolGuard(next);
        }
        if (!cancelled && prev.cloudWritesDisabled && !next.cloudWritesDisabled) {
          setWriteGateEpoch((n) => n + 1);
        }
      } catch {
        // 轮询失败不阻断协同 | Ignore transient polling failures
      }
    };

    const intervalId = window.setInterval(() => {
      void refreshGuardFromCloud();
    }, 90_000);

    const onVisible = () => {
      if (!cancelled && document.visibilityState === 'visible') {
        void refreshGuardFromCloud();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    void refreshGuardFromCloud();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, normalizedProjectId]);

  const enqueueMutation = useCallback((input: TranscriptionCollaborationMutationInput): void => {
    if (!normalizedProjectId) return;
    const codec = codecRef.current;
    const bridge = bridgeRef.current;
    if (!codec || !bridge) return;
    if (writeGuardRef.current.cloudWritesDisabled) {
      console.warn(
        '[TranscriptionCollaborationBridge] suppressed local collaboration mutation (protocol guard):',
        writeGuardRef.current.reasons,
      );
      return;
    }

    const record = codec.encode({
      projectId: normalizedProjectId,
      entityType: input.entityType,
      entityId: input.entityId,
      opType: input.opType,
      ...(input.payload !== undefined ? { payload: input.payload } : {}),
      ...(input.payloadRefPath ? { payloadRefPath: input.payloadRefPath } : {}),
      baseRevision: latestRevisionRef.current,
      sourceKind: 'user',
    });

    bridge.enqueueLocalChange(record);
  }, [normalizedProjectId]);

  const markProjectRevisionSeen = useCallback((revision: number): void => {
    commitLatestRevision(revision);
  }, [commitLatestRevision]);

  const getLatestKnownRevision = useCallback((): number => {
    return latestRevisionRef.current;
  }, []);

  const registerProjectAsset = useCallback(async (
    input: RegisterProjectAssetInput,
  ): Promise<CollaborationAssetRecord> => {
    assertCloudWritesAllowed(writeGuardRef.current);
    const uid = await getSupabaseUserId();
    if (!uid) {
      throw new Error('Collaboration asset registration requires an authenticated Supabase user');
    }
    return requireBridgeInstance(bridgeRef.current).registerProjectAsset({
      ...input,
      uploadedBy: uid,
    });
  }, []);

  const listProjectAssets = useCallback(async (
    input: ListProjectAssetsInput = {},
  ): Promise<CollaborationAssetRecord[]> => {
    return requireBridgeInstance(bridgeRef.current).listProjectAssets(input);
  }, []);

  const removeProjectAsset = useCallback(async (assetId: string): Promise<void> => {
    assertCloudWritesAllowed(writeGuardRef.current);
    await requireBridgeInstance(bridgeRef.current).removeProjectAsset(assetId);
  }, []);

  const getProjectAssetSignedUrl = useCallback(async (
    asset: Pick<CollaborationAssetRecord, 'storageBucket' | 'storagePath'>,
    expiresInSeconds = 30 * 60,
  ): Promise<string> => {
    return requireBridgeInstance(bridgeRef.current).getProjectAssetSignedUrl(asset, expiresInSeconds);
  }, []);

  const createProjectSnapshot = useCallback(async (
    input: CreateProjectSnapshotInput,
  ): Promise<CollaborationProjectSnapshotRecord> => {
    assertCloudWritesAllowed(writeGuardRef.current);
    const uid = await getSupabaseUserId();
    if (!uid) {
      throw new Error('Collaboration snapshot creation requires an authenticated Supabase user');
    }
    return requireBridgeInstance(bridgeRef.current).createProjectSnapshot({
      ...input,
      createdBy: uid,
    });
  }, []);

  const listProjectSnapshots = useCallback(async (
    input: ListProjectSnapshotsInput = {},
  ): Promise<CollaborationProjectSnapshotRecord[]> => {
    return requireBridgeInstance(bridgeRef.current).listProjectSnapshots(input);
  }, []);

  const restoreProjectSnapshotById = useCallback(async (
    snapshotId: string,
  ): Promise<{ record: CollaborationProjectSnapshotRecord; payloadJson: string }> => {
    return requireBridgeInstance(bridgeRef.current).restoreProjectSnapshotById(snapshotId);
  }, []);

  const queryProjectChangeTimeline = useCallback(async (
    input: QueryProjectTimelineInput = {},
  ): Promise<ChangeTimelineResult> => {
    return requireBridgeInstance(bridgeRef.current).queryProjectChangeTimeline(input);
  }, []);

  const queryProjectEntityHistory = useCallback(async (
    entityId: string,
    limit = 50,
    entityType?: ProjectEntityType,
  ): Promise<CollaborationProjectChangeRecord[]> => {
    return requireBridgeInstance(bridgeRef.current).queryProjectEntityHistory(entityId, limit, entityType);
  }, []);

  return {
    isBridgeReady,
    collaborationProtocolGuard: protocolGuard,
    collaborationOutboundPendingCount: outboundPendingCount,
    enqueueMutation,
    markProjectRevisionSeen,
    getLatestKnownRevision,
    registerProjectAsset,
    listProjectAssets,
    removeProjectAsset,
    getProjectAssetSignedUrl,
    createProjectSnapshot,
    listProjectSnapshots,
    restoreProjectSnapshotById,
    queryProjectChangeTimeline,
    queryProjectEntityHistory,
  };
}
