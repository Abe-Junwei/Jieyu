import { useEffect, useRef } from 'react';
import { createLogger } from '../../observability/logger';
import { hydrateCollaborationProjectFromCloud } from '../../collaboration/cloud/collaborationCloudHydration';
import type { CollaborationProjectChangeRecord } from '../../collaboration/cloud/syncTypes';

const log = createLogger('useCollaborationProjectHydration');

export interface UseCollaborationProjectHydrationParams {
  phase: string;
  collaborationProjectId: string;
  isBridgeReady: boolean;
  units: ReadonlyArray<{ textId?: string }>;
  layers: ReadonlyArray<{ textId?: string }>;
  applyRemoteChangeToLocal: (
    change: CollaborationProjectChangeRecord,
    options?: { skipLoadSnapshot?: boolean; skipConflictGovernance?: boolean },
  ) => Promise<void>;
  getLatestKnownRevision: () => number;
  listProjectSnapshots: (options: {
    limit: number;
    offset: number;
  }) => Promise<Array<{ id: string; changeCursor: number }>>;
  queryProjectChangeTimeline: (options: {
    sinceRevision: number;
    limit: number;
    offset: number;
  }) => Promise<{ changes: CollaborationProjectChangeRecord[] }>;
  restoreProjectSnapshotById: (snapshotId: string) => Promise<{ payloadJson: string }>;
  runWithDbMutex: <T>(fn: () => Promise<T>) => Promise<T>;
  loadSnapshot: () => Promise<void>;
  markProjectRevisionSeen: (revision: number) => void;
}

/** Auto-hydrates local project state from cloud snapshot + timeline once per project. */
export function useCollaborationProjectHydration({
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
}: UseCollaborationProjectHydrationParams): void {
  const autoHydrationDoneProjectIdsRef = useRef<Set<string>>(new Set());
  const autoHydrationRunningProjectIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (phase !== 'ready') return;
    if (!collaborationProjectId) return;
    if (!isBridgeReady) return;
    if (autoHydrationDoneProjectIdsRef.current.has(collaborationProjectId)) return;
    if (autoHydrationRunningProjectIdRef.current === collaborationProjectId) return;

    const hasProjectLocalData =
      units.some((unit) => unit.textId === collaborationProjectId) ||
      layers.some((layer) => layer.textId === collaborationProjectId);

    let cancelled = false;
    autoHydrationRunningProjectIdRef.current = collaborationProjectId;

    const hydrateFromCloud = async () => {
      try {
        const result = await hydrateCollaborationProjectFromCloud({
          collaborationProjectId,
          hasProjectLocalData,
          getLatestKnownRevision,
          listProjectSnapshots,
          queryProjectChangeTimeline,
          restoreProjectSnapshotById,
          runWithDbMutex,
          loadSnapshot,
          applyRemoteChangeToLocal,
          markProjectRevisionSeen,
          isCancelled: () => cancelled,
        });
        if (result.hydrated && !cancelled) {
          autoHydrationDoneProjectIdsRef.current.add(collaborationProjectId);
        }
      } finally {
        if (autoHydrationRunningProjectIdRef.current === collaborationProjectId) {
          autoHydrationRunningProjectIdRef.current = null;
        }
      }
    };

    void hydrateFromCloud().catch((error) => {
      if (autoHydrationRunningProjectIdRef.current === collaborationProjectId) {
        autoHydrationRunningProjectIdRef.current = null;
      }
      log.warn('failed to hydrate from cloud snapshot/timeline', { err: error });
    });

    return () => {
      cancelled = true;
      if (autoHydrationRunningProjectIdRef.current === collaborationProjectId) {
        autoHydrationRunningProjectIdRef.current = null;
      }
    };
  }, [
    applyRemoteChangeToLocal,
    collaborationProjectId,
    getLatestKnownRevision,
    isBridgeReady,
    layers,
    listProjectSnapshots,
    loadSnapshot,
    markProjectRevisionSeen,
    phase,
    queryProjectChangeTimeline,
    restoreProjectSnapshotById,
    runWithDbMutex,
    units,
  ]);
}
