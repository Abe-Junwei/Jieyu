import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CollaborationAssetRecord,
  CollaborationProjectChangeRecord,
  CollaborationProjectSnapshotRecord,
  ProjectChangeOperation,
  ProjectEntityType,
} from '../../collaboration/cloud/syncTypes';
import {
  evaluateCollaborationProtocolGuard,
  resolveCollaborationClientAppVersion,
  SUPPORTED_COLLABORATION_PROTOCOL_VERSION,
  type CollaborationProtocolGuardEvaluation,
} from '../../collaboration/cloud/collaborationProtocolGuard';
import {
  CollaborationSyncBridge,
  type CreateProjectSnapshotInput,
  type ListProjectAssetsInput,
  type ListProjectSnapshotsInput,
  type QueryProjectTimelineInput,
  type RegisterProjectAssetInput,
} from '../../collaboration/cloud/CollaborationSyncBridge';
import { ProjectChangeCodec } from '../../collaboration/cloud/ProjectChangeCodec';
import type { ChangeTimelineResult } from '../../collaboration/cloud/CollaborationAuditLogService';
import {
  hydrateCollabClientStateFromIdb,
  loadProjectLastSeenRevision,
  loadProjectPendingOutboundChanges,
  saveProjectLastSeenRevision,
} from '../../collaboration/cloud/CollaborationClientStateStore';
import {
  getSupabaseBrowserClient,
  getSupabaseUserId,
  hasSupabaseBrowserClientConfig,
} from '../../collaboration/cloud/collaborationSupabaseFacade';
import { getCollaborationClientId } from '../../collaboration/cloud/collaborationClientIdentity';
import {
  isProjectSyncBlockedLocally,
  markProjectCollaborationBound,
  markProjectOutboundRecorded,
} from '../../collaboration/cloud/collaborationLocalProjectRegistry';
import {
  broadcastCollaborationLifecycle,
  subscribeCollaborationLifecycle,
} from '../../collaboration/cloud/collaborationLifecycleBroadcast';
import {
  classifyCollaborationServerRejection,
  isOutdatedClientRejection,
} from '../../collaboration/cloud/collaborationServerRejection';
import { applyCloudProjectTombstone } from '../../services/projectCloudTombstone';
import {
  assertCollaborationAllowed,
  isMultiDocumentProject,
  refreshMultiDocumentGate,
} from '../../services/annotationDocumentCollaborationGate';
import { createLogger } from '../../observability/logger';

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
  client_app_version: string;
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

interface LoadProtocolGuardFromCloudResult {
  guard: CollaborationProtocolGuardEvaluation;
  /** 云端有这个项目行（即存在协作绑定，D6）| The cloud project row exists (a binding, D6) */
  projectExists: boolean;
  /** 墓碑时间（9.2）| Tombstone time (9.2) */
  deletedAt: string | null;
  error: unknown | null;
}

export interface TranscriptionCollaborationMutationInput {
  entityType: ProjectEntityType;
  entityId: string;
  opType: ProjectChangeOperation;
  payload?: Record<string, unknown>;
  payloadRefPath?: string;
}

const log = createLogger('useTranscriptionCollaborationBridge');

function requireBridgeInstance(bridge: CollaborationSyncBridge | null): CollaborationSyncBridge {
  if (!bridge) {
    throw new Error('Collaboration bridge is not ready yet');
  }
  return bridge;
}

function canUseLocalEmptyReadFallback(enabled: boolean, projectId: string): boolean {
  return !enabled || !projectId || !hasSupabaseBrowserClientConfig();
}

const DEFAULT_PROTOCOL_GUARD: CollaborationProtocolGuardEvaluation = {
  cloudWritesDisabled: false,
  reasons: [],
  outboundProtocolVersion: SUPPORTED_COLLABORATION_PROTOCOL_VERSION,
};

async function loadProtocolGuardFromCloud(
  projectId: string,
): Promise<LoadProtocolGuardFromCloudResult> {
  const client = getSupabaseBrowserClient();
  const { data: projectRow, error } = await client
    .from('projects')
    .select('protocol_version, app_min_version, deleted_at')
    .eq('id', projectId)
    .maybeSingle();

  const deletedAt =
    projectRow && typeof projectRow.deleted_at === 'string' && projectRow.deleted_at.length > 0
      ? projectRow.deleted_at
      : null;
  const guard = evaluateCollaborationProtocolGuard(
    projectRow
      ? {
          protocolVersion: projectRow.protocol_version,
          appMinVersion: projectRow.app_min_version,
          deletedAt,
        }
      : null,
  );
  return { guard, projectExists: Boolean(projectRow), deletedAt, error };
}

/** 服务器拒绝后进入只读（9.3）| Read-only after a server rejection (9.3) */
function serverRejectedGuard(
  reason: string,
  outboundProtocolVersion: number,
): CollaborationProtocolGuardEvaluation {
  return { cloudWritesDisabled: true, reasons: [reason], outboundProtocolVersion };
}

/** 本机协作记录写失败不阻断协同，只记日志 | Registry write failures never block sync */
function recordLocally(action: () => void, label: string): void {
  try {
    action();
  } catch (error) {
    log.warn(`collaboration local registry update failed: ${label}`, { err: error });
  }
}

function assertCloudWritesAllowed(writeGuard: CollaborationProtocolGuardEvaluation): void {
  if (!writeGuard.cloudWritesDisabled) return;
  const detail =
    writeGuard.reasons.length > 0 ? writeGuard.reasons.join('; ') : 'cloud-writes-disabled';
  throw new Error(`Collaboration cloud writes are disabled: ${detail}`);
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
    client_app_version: resolveCollaborationClientAppVersion(),
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
  // 每个安装实例一个 clientId（9.4）| One clientId per installation (9.4)
  const clientIdRef = useRef<string>(getCollaborationClientId());
  const latestRevisionRef = useRef<number>(0);
  const writeGuardRef = useRef<CollaborationProtocolGuardEvaluation>(DEFAULT_PROTOCOL_GUARD);
  const [isBridgeReady, setIsBridgeReady] = useState(false);
  const [protocolGuard, setProtocolGuard] =
    useState<CollaborationProtocolGuardEvaluation>(DEFAULT_PROTOCOL_GUARD);
  const [outboundPendingCount, setOutboundPendingCount] = useState(0);
  /** 云端从禁写切到允许写时递增，用于重启桥接以灌入持久化 pending | Bump when cloud flips disabled→enabled writes */
  const [writeGateEpoch, setWriteGateEpoch] = useState(0);
  /** 已处理过墓碑的项目，避免重复清理 | Projects whose tombstone was already handled */
  const tombstoneHandledRef = useRef<Set<string>>(new Set());

  /**
   * 服务器拒绝或墓碑之后的守卫在本页面内保持不变，直到刷新或切换项目（9.3）。
   * After a server rejection or a tombstone the guard stays until reload or project switch (9.3).
   */
  const stickyGuardRef = useRef<CollaborationProtocolGuardEvaluation | null>(null);
  const stickyProjectIdRef = useRef<string>(normalizedProjectId);
  if (stickyProjectIdRef.current !== normalizedProjectId) {
    stickyProjectIdRef.current = normalizedProjectId;
    stickyGuardRef.current = null;
  }

  const applyProtocolGuard = useCallback((next: CollaborationProtocolGuardEvaluation): void => {
    const effective = stickyGuardRef.current ?? next;
    writeGuardRef.current = effective;
    setProtocolGuard(effective);
  }, []);

  const applyStickyProtocolGuard = useCallback(
    (next: CollaborationProtocolGuardEvaluation): void => {
      stickyGuardRef.current = next;
      applyProtocolGuard(next);
    },
    [applyProtocolGuard],
  );

  const resetBridgeRuntimeState = useCallback(() => {
    bridgeRef.current = null;
    codecRef.current = null;
    latestRevisionRef.current = 0;
    applyProtocolGuard(DEFAULT_PROTOCOL_GUARD);
    setOutboundPendingCount(0);
    setIsBridgeReady(false);
  }, [applyProtocolGuard]);

  const stopBridgeRuntime = useCallback(async () => {
    const current = bridgeRef.current;
    resetBridgeRuntimeState();
    if (current) {
      await current.stop();
    }
  }, [resetBridgeRuntimeState]);

  const commitLatestRevision = useCallback(
    (revision: number): void => {
      if (!Number.isFinite(revision)) return;
      const normalizedRevision = Math.max(0, Math.floor(revision));
      if (normalizedRevision <= latestRevisionRef.current) return;
      latestRevisionRef.current = normalizedRevision;
      if (normalizedProjectId) {
        saveProjectLastSeenRevision(normalizedProjectId, normalizedRevision);
      }
    },
    [normalizedProjectId],
  );

  /**
   * 看到墓碑：停止桥接（不再落盘待发队列），然后作废出站队列并清理本机副本（9.2）。
   * Tombstone seen: stop the bridge first, then cancel outbound and clean up the local copy (9.2).
   */
  const handleCloudTombstone = useCallback(
    (projectIdToHandle: string, deletedAt: string | null): void => {
      if (tombstoneHandledRef.current.has(projectIdToHandle)) return;
      tombstoneHandledRef.current.add(projectIdToHandle);
      applyStickyProtocolGuard(
        evaluateCollaborationProtocolGuard({
          protocolVersion: SUPPORTED_COLLABORATION_PROTOCOL_VERSION,
          appMinVersion: '0.0.0',
          deletedAt: deletedAt ?? new Date().toISOString(),
        }),
      );
      // 不在桥接的发送回调里等待 stop | Never await stop inside the bridge's send callback
      setTimeout(() => {
        void stopBridgeRuntime()
          .then(() => applyCloudProjectTombstone(projectIdToHandle, { deletedAt }))
          .catch((error: unknown) => {
            log.warn('failed to apply cloud tombstone locally', { err: error });
          });
      }, 0);
    },
    [applyStickyProtocolGuard, stopBridgeRuntime],
  );

  /** 写入被服务器拒绝时的处理（9.2、9.3）| Handle a server-side write rejection (9.2, 9.3) */
  const handleServerWriteRejection = useCallback(
    (error: unknown): void => {
      const rejection = classifyCollaborationServerRejection(error);
      if (rejection === 'project-deleted') {
        handleCloudTombstone(normalizedProjectId, null);
        return;
      }
      if (isOutdatedClientRejection(rejection)) {
        applyStickyProtocolGuard(
          serverRejectedGuard(
            `server-rejected-${rejection}`,
            writeGuardRef.current.outboundProtocolVersion,
          ),
        );
        broadcastCollaborationLifecycle('protocol-changed', normalizedProjectId);
      }
    },
    [applyStickyProtocolGuard, handleCloudTombstone, normalizedProjectId],
  );

  useEffect(() => {
    let disposed = false;

    if (
      !enabled ||
      !normalizedProjectId ||
      !hasSupabaseBrowserClientConfig() ||
      // 已从本机移除或云端已删除的项目不再自动同步（9.1、9.2）| No auto-sync for removed / tombstoned projects
      isProjectSyncBlockedLocally(normalizedProjectId)
    ) {
      void stopBridgeRuntime();
      return () => {
        disposed = true;
      };
    }

    const startBridge = async () => {
      await stopBridgeRuntime();
      await hydrateCollabClientStateFromIdb();

      const actorId = await getSupabaseUserId();
      if (!actorId) {
        log.warn('skip bridge bootstrap without authenticated user');
        return;
      }
      if (disposed) return;
      // 第 5 批反向门：多份文稿的项目不开启协作 | Batch 5 reverse gate: no collaboration with several documents
      if (await refreshMultiDocumentGate(normalizedProjectId)) {
        log.warn('skip bridge bootstrap: project has several annotation documents');
        return;
      }
      if (disposed) return;

      latestRevisionRef.current = Math.max(0, loadProjectLastSeenRevision(normalizedProjectId));

      const {
        guard,
        projectExists,
        deletedAt,
        error: projectGuardError,
      } = await loadProtocolGuardFromCloud(normalizedProjectId);
      if (projectGuardError) {
        log.warn('failed to load project protocol guard', { err: projectGuardError });
      }
      if (disposed) return;
      if (projectExists) {
        recordLocally(() => markProjectCollaborationBound(normalizedProjectId), 'bound');
      }
      if (guard.projectDeleted === true) {
        handleCloudTombstone(normalizedProjectId, deletedAt);
        return;
      }
      applyProtocolGuard(guard);

      const codec = new ProjectChangeCodec({
        protocolVersion: guard.outboundProtocolVersion,
        actorId,
        clientId: clientIdRef.current,
      });

      const client = getSupabaseBrowserClient();
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
          if (change.clientId === clientIdRef.current) {
            commitLatestRevision(change.projectRevision);
            return;
          }
          if (onApplyRemoteChange) {
            await onApplyRemoteChange(change);
          }
          commitLatestRevision(change.projectRevision);
        },
        onSendLocalChanges: async (changes) => {
          if (changes.length === 0) return;
          // 每次推送前重新读取项目行（9.3）| Re-read the project row before every push (9.3)
          const fresh = await loadProtocolGuardFromCloud(normalizedProjectId);
          if (!fresh.error) {
            if (fresh.guard.projectDeleted === true) {
              handleCloudTombstone(normalizedProjectId, fresh.deletedAt);
              throw new Error('Collaboration project was deleted in the cloud');
            }
            applyProtocolGuard(fresh.guard);
          }
          if (writeGuardRef.current.cloudWritesDisabled) {
            const detail =
              writeGuardRef.current.reasons.length > 0
                ? writeGuardRef.current.reasons.join('; ')
                : 'cloud-writes-disabled';
            log.warn('suppressed project_changes insert (protocol guard)', {
              reasons: writeGuardRef.current.reasons,
            });
            throw new Error(`Collaboration cloud writes are disabled: ${detail}`);
          }
          const rows = changes.map(toChangeInsertRow);
          const { error } = await client.from('project_changes').insert(rows);
          if (error) {
            handleServerWriteRejection(error);
            throw error;
          }
        },
        onError: (error, context) => {
          log.warn('CollaborationSyncBridge runtime error', { context, err: error });
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
      log.warn('failed to start bridge', { err: error });
    });

    return () => {
      disposed = true;
      void stopBridgeRuntime();
    };
  }, [
    applyProtocolGuard,
    commitLatestRevision,
    enabled,
    handleCloudTombstone,
    handleServerWriteRejection,
    normalizedProjectId,
    onApplyRemoteChange,
    stopBridgeRuntime,
    writeGateEpoch,
  ]);

  useEffect(() => {
    if (!enabled || !normalizedProjectId || !hasSupabaseBrowserClientConfig()) return;
    if (typeof window === 'undefined') return;

    let cancelled = false;

    const refreshGuardFromCloud = async () => {
      try {
        const {
          guard: next,
          deletedAt,
          error,
        } = await loadProtocolGuardFromCloud(normalizedProjectId);
        if (cancelled || error) return;
        if (next.projectDeleted === true) {
          handleCloudTombstone(normalizedProjectId, deletedAt);
          return;
        }
        const prev = writeGuardRef.current;
        applyProtocolGuard(next);
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
    // 标签页获得焦点时也重新检查（9.3）| Re-check on window focus too (9.3)
    const onFocus = () => {
      if (!cancelled) void refreshGuardFromCloud();
    };
    window.addEventListener('focus', onFocus);
    // 其他标签页的通知：本机移除、云端删除、协议变化（9.3）| Notices from other tabs (9.3)
    const unsubscribe = subscribeCollaborationLifecycle((message) => {
      if (cancelled || message.projectId !== normalizedProjectId) return;
      if (message.type === 'protocol-changed') {
        void refreshGuardFromCloud();
        return;
      }
      // 重新走启动判断：本机记录会让桥接保持停止 | Re-run start-up; the local record keeps it stopped
      void stopBridgeRuntime();
      setWriteGateEpoch((n) => n + 1);
    });
    void refreshGuardFromCloud();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      unsubscribe();
    };
  }, [applyProtocolGuard, enabled, handleCloudTombstone, normalizedProjectId, stopBridgeRuntime]);

  const enqueueMutation = useCallback(
    (input: TranscriptionCollaborationMutationInput): void => {
      if (!normalizedProjectId) return;
      const codec = codecRef.current;
      const bridge = bridgeRef.current;
      if (!codec || !bridge) return;
      if (writeGuardRef.current.cloudWritesDisabled) {
        log.warn('suppressed local collaboration mutation (protocol guard)', {
          reasons: writeGuardRef.current.reasons,
        });
        return;
      }
      // 运行中新建了第二份文稿：不再上传 | A second document was created while running: no upload
      if (isMultiDocumentProject(normalizedProjectId)) {
        log.warn('suppressed local collaboration mutation (several annotation documents)');
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

      // 先记下“有过出站记录”，再入队（D6）| Record outbound history before queueing (D6)
      recordLocally(() => markProjectOutboundRecorded(normalizedProjectId), 'outbound');
      bridge.enqueueLocalChange(record);
    },
    [normalizedProjectId],
  );

  const markProjectRevisionSeen = useCallback(
    (revision: number): void => {
      commitLatestRevision(revision);
    },
    [commitLatestRevision],
  );

  const getLatestKnownRevision = useCallback((): number => {
    return latestRevisionRef.current;
  }, []);

  const registerProjectAsset = useCallback(
    async (input: RegisterProjectAssetInput): Promise<CollaborationAssetRecord> => {
      assertCloudWritesAllowed(writeGuardRef.current);
      assertCollaborationAllowed(normalizedProjectId);
      const uid = await getSupabaseUserId();
      if (!uid) {
        throw new Error('Collaboration asset registration requires an authenticated Supabase user');
      }
      return requireBridgeInstance(bridgeRef.current).registerProjectAsset({
        ...input,
        uploadedBy: uid,
      });
    },
    [normalizedProjectId],
  );

  const listProjectAssets = useCallback(
    async (input: ListProjectAssetsInput = {}): Promise<CollaborationAssetRecord[]> => {
      if (!bridgeRef.current && canUseLocalEmptyReadFallback(enabled, normalizedProjectId)) {
        return [];
      }
      return requireBridgeInstance(bridgeRef.current).listProjectAssets(input);
    },
    [enabled, normalizedProjectId],
  );

  const removeProjectAsset = useCallback(async (assetId: string): Promise<void> => {
    assertCloudWritesAllowed(writeGuardRef.current);
    await requireBridgeInstance(bridgeRef.current).removeProjectAsset(assetId);
  }, []);

  const getProjectAssetSignedUrl = useCallback(
    async (
      asset: Pick<CollaborationAssetRecord, 'storageBucket' | 'storagePath'>,
      expiresInSeconds = 30 * 60,
    ): Promise<string> => {
      return requireBridgeInstance(bridgeRef.current).getProjectAssetSignedUrl(
        asset,
        expiresInSeconds,
      );
    },
    [],
  );

  const createProjectSnapshot = useCallback(
    async (input: CreateProjectSnapshotInput): Promise<CollaborationProjectSnapshotRecord> => {
      assertCloudWritesAllowed(writeGuardRef.current);
      assertCollaborationAllowed(normalizedProjectId);
      const uid = await getSupabaseUserId();
      if (!uid) {
        throw new Error('Collaboration snapshot creation requires an authenticated Supabase user');
      }
      return requireBridgeInstance(bridgeRef.current).createProjectSnapshot({
        ...input,
        createdBy: uid,
      });
    },
    [normalizedProjectId],
  );

  const listProjectSnapshots = useCallback(
    async (
      input: ListProjectSnapshotsInput = {},
    ): Promise<CollaborationProjectSnapshotRecord[]> => {
      if (!bridgeRef.current && canUseLocalEmptyReadFallback(enabled, normalizedProjectId)) {
        return [];
      }
      return requireBridgeInstance(bridgeRef.current).listProjectSnapshots(input);
    },
    [enabled, normalizedProjectId],
  );

  const restoreProjectSnapshotById = useCallback(
    async (
      snapshotId: string,
    ): Promise<{ record: CollaborationProjectSnapshotRecord; payloadJson: string }> => {
      return requireBridgeInstance(bridgeRef.current).restoreProjectSnapshotById(snapshotId);
    },
    [],
  );

  const queryProjectChangeTimeline = useCallback(
    async (input: QueryProjectTimelineInput = {}): Promise<ChangeTimelineResult> => {
      if (!bridgeRef.current && canUseLocalEmptyReadFallback(enabled, normalizedProjectId)) {
        return { changes: [], total: 0 };
      }
      return requireBridgeInstance(bridgeRef.current).queryProjectChangeTimeline(input);
    },
    [enabled, normalizedProjectId],
  );

  const queryProjectEntityHistory = useCallback(
    async (
      entityId: string,
      limit = 50,
      entityType?: ProjectEntityType,
    ): Promise<CollaborationProjectChangeRecord[]> => {
      return requireBridgeInstance(bridgeRef.current).queryProjectEntityHistory(
        entityId,
        limit,
        entityType,
      );
    },
    [],
  );

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
