/**
 * 协同写操作包装 Hook | Cloud-sync write action wrappers
 *
 * 将远端回放逻辑与出站 enqueue 封装在独立 Hook 中，
 * 保持 useTranscriptionData 为薄组合层。
 * Keeps useTranscriptionData as a thin composition layer.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { featureFlags } from '../../ai/config/featureFlags';
import { isCollaborationCloudSurfaceActive } from '../../collaboration/cloud/collaborationCloudFeatureGate';
import { useTranscriptionCollaborationBridge } from './useTranscriptionCollaborationBridge';
import { createCloudSyncedWriteActions } from './createCloudSyncedWriteActions';
import { useCloudSyncAutoSnapshot } from '../cloudSync/useCloudSyncAutoSnapshot';
import { useCollaborationConflictReview } from './useCollaborationConflictReview';
import { useCollaborationPresence } from './useCollaborationPresence';
import { useCollaborationProjectHydration } from './useCollaborationProjectHydration';
import { LinguisticService } from '../../services/LinguisticService';
import {
  listAccessibleCloudProjects as fetchAccessibleCloudProjects,
  listCloudProjectMembers as fetchCloudProjectMembers,
} from '../../collaboration/cloud/CollaborationDirectoryService';
import type { CloudSyncConflictReviewTicket } from '../../collaboration/cloud/collaborationInboundChangeApplier';
import type { CloudSyncRawActions } from '../../collaboration/cloud/CollaborationProjectRemoteMutationService';
import type {
  CollaborationProjectSnapshotRecord,
  ProjectEntityType,
} from '../../collaboration/cloud/syncTypes';
import type { UnitSelfCertainty } from '../../utils/unitSelfCertainty';
import type { LayerCreateInput } from './transcriptionTypes';
import type { PerLayerRowFieldPatch } from './useTranscriptionUnitActions';
import {
  deriveCollaborationSyncBadge,
  type CollaborationCloudDirectoryMember,
  type CollaborationCloudDirectoryProject,
} from '../../collaboration/cloud/collaborationSyncDerived';

export type { CloudSyncConflictReviewTicket };

interface CloudSyncWrappedActions {
  saveUnitText: (unitId: string, value: string, layerId?: string) => Promise<void>;
  saveUnitSelfCertainty: (
    unitIds: Iterable<string>,
    value: UnitSelfCertainty | undefined,
  ) => Promise<void>;
  saveUnitLayerFields: (unitIds: Iterable<string>, patch: PerLayerRowFieldPatch) => Promise<void>;
  saveUnitTiming: (unitId: string, startTime: number, endTime: number) => Promise<void>;
  saveUnitLayerText: (unitId: string, value: string, layerId: string) => Promise<void>;
  createUnitFromSelection: (
    start: number,
    end: number,
    options?: { speakerId?: string; focusedLayerId?: string },
  ) => Promise<void>;
  deleteUnit: (unitId: string) => Promise<void>;
  deleteSelectedUnits: (ids: Set<string>) => Promise<void>;
  createLayer: (
    layerType: 'transcription' | 'translation',
    input: LayerCreateInput,
    modality?: 'text' | 'audio' | 'mixed',
  ) => Promise<boolean>;
  deleteLayer: (targetLayerId?: string, options?: { keepUnits?: boolean }) => Promise<void>;
  toggleLayerLink: (transcriptionLayerKey: string, layerId: string) => Promise<void>;
}

export interface UseTranscriptionCloudSyncActionsParams {
  phase: string;
  units: ReadonlyArray<{ id: string; textId?: string }>;
  layers: ReadonlyArray<{ id: string; textId?: string; key?: string; layerType?: string }>;
  unitsRef: { readonly current: ReadonlyArray<{ id: string }> };
  layersRef: { readonly current: ReadonlyArray<{ id: string; key?: string; layerType?: string }> };
  layerLinksRef: {
    readonly current: ReadonlyArray<{
      transcriptionLayerKey: string;
      hostTranscriptionLayerId?: string;
      layerId: string;
    }>;
  };
  rawActions: CloudSyncRawActions;
  wrappedActions: CloudSyncWrappedActions;
  runWithDbMutex: <T>(fn: () => Promise<T>) => Promise<T>;
  loadSnapshot: () => Promise<void>;
  presenceDisplayName?: string;
  presenceFocus?: {
    entityType?: ProjectEntityType;
    entityId?: string;
  };
}

export function useTranscriptionCloudSyncActions({
  phase,
  units,
  layers,
  unitsRef,
  layersRef,
  layerLinksRef,
  rawActions,
  wrappedActions,
  runWithDbMutex,
  loadSnapshot,
  presenceDisplayName,
  presenceFocus,
}: UseTranscriptionCloudSyncActionsParams) {
  const rawActionsRef = useRef(rawActions);
  rawActionsRef.current = rawActions;
  const wrappedActionsRef = useRef(wrappedActions);
  wrappedActionsRef.current = wrappedActions;

  const collaborationProjectId = useMemo(
    () => (units[0]?.textId ?? layers[0]?.textId ?? '').trim(),
    [layers, units],
  );

  const collaborationSupabaseConfigured = useMemo(() => isCollaborationCloudSurfaceActive(), []);

  const [collaborationBrowserOnline, setCollaborationBrowserOnline] = useState(
    typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
      ? navigator.onLine
      : true,
  );

  useEffect(() => {
    const onOnline = () => setCollaborationBrowserOnline(true);
    const onOffline = () => setCollaborationBrowserOnline(false);
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const {
    conflictReviewTickets,
    conflictOperationLogs,
    applyRemoteChangeToLocal,
    applyRemoteConflictTicket,
    keepLocalConflictTicket,
    postponeConflictTicket,
    rememberLocalShadowMutation,
  } = useCollaborationConflictReview({
    collaborationProjectId,
    unitsRef,
    layersRef,
    layerLinksRef,
    rawActionsRef,
    runWithDbMutex,
    loadSnapshot,
  });

  const {
    isBridgeReady,
    collaborationProtocolGuard,
    collaborationOutboundPendingCount,
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
  } = useTranscriptionCollaborationBridge({
    enabled: phase === 'ready' && featureFlags.collaborationCloudEnabled,
    projectId: collaborationProjectId,
    onApplyRemoteChange: applyRemoteChangeToLocal,
  });

  const { presenceMembers, presenceCurrentUserId } = useCollaborationPresence({
    phase,
    collaborationProjectId,
    isBridgeReady,
    ...(presenceDisplayName !== undefined ? { presenceDisplayName } : {}),
    ...(presenceFocus !== undefined ? { presenceFocus } : {}),
  });

  useCollaborationProjectHydration({
    phase,
    collaborationProjectId,
    isBridgeReady,
    units,
    layers,
    applyRemoteChangeToLocal,
    getLatestKnownRevision,
    listProjectSnapshots,
    queryProjectChangeTimeline,
    restoreProjectSnapshotById,
    runWithDbMutex,
    loadSnapshot,
    markProjectRevisionSeen,
  });

  const collaborationSyncBadge = useMemo(
    () =>
      deriveCollaborationSyncBadge({
        supabaseConfigured: collaborationSupabaseConfigured,
        collaborationProjectId,
        isBridgeReady,
        protocolWritesDisabled: collaborationProtocolGuard.cloudWritesDisabled,
        conflictTicketCount: conflictReviewTickets.length,
        pendingOutboundCount: collaborationOutboundPendingCount,
        browserOnline: collaborationBrowserOnline,
      }),
    [
      collaborationSupabaseConfigured,
      collaborationProjectId,
      isBridgeReady,
      collaborationProtocolGuard.cloudWritesDisabled,
      conflictReviewTickets.length,
      collaborationOutboundPendingCount,
      collaborationBrowserOnline,
    ],
  );

  const listAccessibleCloudProjects = useCallback(async (): Promise<
    CollaborationCloudDirectoryProject[]
  > => {
    if (!featureFlags.collaborationCloudEnabled) return [];
    return fetchAccessibleCloudProjects();
  }, []);

  const listCloudProjectMembers = useCallback(
    async (projectId: string): Promise<CollaborationCloudDirectoryMember[]> => {
      if (!featureFlags.collaborationCloudEnabled) return [];
      return fetchCloudProjectMembers(projectId);
    },
    [],
  );

  const restoreProjectSnapshotToLocalById = useCallback(
    async (snapshotId: string): Promise<CollaborationProjectSnapshotRecord> => {
      const restored = await restoreProjectSnapshotById(snapshotId);
      await runWithDbMutex(() =>
        LinguisticService.database
          .importFromJSON(restored.payloadJson, 'replace-all')
          .then(() => undefined),
      );
      await loadSnapshot();
      return restored.record;
    },
    [loadSnapshot, restoreProjectSnapshotById, runWithDbMutex],
  );

  useCloudSyncAutoSnapshot({
    phase,
    collaborationProjectId,
    isBridgeReady,
    cloudWritesDisabled: collaborationProtocolGuard.cloudWritesDisabled,
    runWithDbMutex,
    listProjectSnapshots,
    createProjectSnapshot,
    getLatestKnownRevision,
  });

  const cloudSyncedWriteActions = createCloudSyncedWriteActions({
    wrappedActionsRef,
    enqueueMutation,
    rememberLocalShadowMutation,
    unitsRef,
    layersRef,
    layerLinksRef,
  });

  return {
    collaborationProtocolGuard,
    collaborationSyncBadge,
    listAccessibleCloudProjects,
    listCloudProjectMembers,
    saveUnitText: cloudSyncedWriteActions.saveUnitText,
    saveUnitSelfCertainty: cloudSyncedWriteActions.saveUnitSelfCertainty,
    saveUnitLayerFields: cloudSyncedWriteActions.saveUnitLayerFields,
    saveUnitTiming: cloudSyncedWriteActions.saveUnitTiming,
    saveUnitLayerText: cloudSyncedWriteActions.saveUnitLayerText,
    createUnitFromSelection: cloudSyncedWriteActions.createUnitFromSelection,
    deleteUnit: cloudSyncedWriteActions.deleteUnit,
    deleteSelectedUnits: cloudSyncedWriteActions.deleteSelectedUnits,
    createLayer: cloudSyncedWriteActions.createLayer,
    deleteLayer: cloudSyncedWriteActions.deleteLayer,
    toggleLayerLink: cloudSyncedWriteActions.toggleLayerLink,
    registerProjectAsset,
    listProjectAssets,
    removeProjectAsset,
    getProjectAssetSignedUrl,
    createProjectSnapshot,
    listProjectSnapshots,
    restoreProjectSnapshotById,
    restoreProjectSnapshotToLocalById,
    queryProjectChangeTimeline,
    queryProjectEntityHistory,
    presenceMembers,
    presenceCurrentUserId,
    conflictReviewTickets,
    conflictOperationLogs,
    applyRemoteConflictTicket,
    keepLocalConflictTicket,
    postponeConflictTicket,
  };
}
