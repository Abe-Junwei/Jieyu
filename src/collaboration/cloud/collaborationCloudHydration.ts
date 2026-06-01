import { createLogger } from '../../observability/logger';
import { LinguisticService } from '../../services/LinguisticService';
import {
  RECOVERY_TIMELINE_PAGE_SIZE,
  MAX_RECOVERY_TIMELINE_PAGES,
  isImportableDatabaseSnapshot,
} from './cloudSyncConflictHelpers';
import type { CollaborationProjectChangeRecord } from './syncTypes';

const log = createLogger('collaborationCloudHydration');

export interface CollaborationCloudHydrationDeps {
  collaborationProjectId: string;
  hasProjectLocalData: boolean;
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
  applyRemoteChangeToLocal: (
    change: CollaborationProjectChangeRecord,
    options?: { skipLoadSnapshot?: boolean; skipConflictGovernance?: boolean },
  ) => Promise<void>;
  markProjectRevisionSeen: (revision: number) => void;
  isCancelled: () => boolean;
}

export interface CollaborationCloudHydrationResult {
  latestRevision: number;
  hydrated: boolean;
}

/**
 * Snapshot-first + timeline replay hydration for a collaboration project.
 */
export async function hydrateCollaborationProjectFromCloud(
  deps: CollaborationCloudHydrationDeps,
): Promise<CollaborationCloudHydrationResult> {
  let latestRevision = deps.getLatestKnownRevision();

  if (deps.hasProjectLocalData && latestRevision <= 0) {
    const headSnapshots = await deps.listProjectSnapshots({ limit: 1, offset: 0 });
    const probe = await deps.queryProjectChangeTimeline({
      sinceRevision: 1,
      limit: 1,
      offset: 0,
    });
    const cloudHasData = headSnapshots.length > 0 || probe.changes.length > 0;
    if (!cloudHasData) {
      return { latestRevision, hydrated: true };
    }
  }

  if (!deps.hasProjectLocalData) {
    const latestSnapshots = await deps.listProjectSnapshots({ limit: 1, offset: 0 });
    const latestSnapshot = latestSnapshots[0];

    if (latestSnapshot) {
      try {
        const restored = await deps.restoreProjectSnapshotById(latestSnapshot.id);
        const parsedPayload = JSON.parse(restored.payloadJson) as unknown;
        if (isImportableDatabaseSnapshot(parsedPayload)) {
          await deps.runWithDbMutex(() =>
            LinguisticService.database
              .importFromJSON(restored.payloadJson, 'replace-all')
              .then(() => undefined),
          );
          if (deps.isCancelled()) {
            return { latestRevision, hydrated: false };
          }
          await deps.loadSnapshot();
          latestRevision = Math.max(latestRevision, latestSnapshot.changeCursor);
        }
      } catch (error) {
        log.warn('snapshot hydration skipped', { err: error });
      }
    }
  }

  const sinceRevision = Math.max(1, latestRevision + 1);
  const replayChanges: CollaborationProjectChangeRecord[] = [];
  let offset = 0;

  for (let page = 0; page < MAX_RECOVERY_TIMELINE_PAGES; page += 1) {
    const pageResult = await deps.queryProjectChangeTimeline({
      sinceRevision,
      limit: RECOVERY_TIMELINE_PAGE_SIZE,
      offset,
    });
    const pageChanges = pageResult.changes;
    if (pageChanges.length === 0) break;
    replayChanges.push(...pageChanges);
    if (pageChanges.length < RECOVERY_TIMELINE_PAGE_SIZE) break;
    offset += RECOVERY_TIMELINE_PAGE_SIZE;
  }

  const orderedReplayChanges = replayChanges
    .slice()
    .sort((a, b) => a.projectRevision - b.projectRevision);

  if (orderedReplayChanges.length > 0) {
    for (const change of orderedReplayChanges) {
      if (deps.isCancelled()) {
        return { latestRevision, hydrated: false };
      }
      await deps.applyRemoteChangeToLocal(change, {
        skipLoadSnapshot: true,
        skipConflictGovernance: true,
      });
      latestRevision = Math.max(latestRevision, change.projectRevision);
    }
    if (deps.isCancelled()) {
      return { latestRevision, hydrated: false };
    }
    await deps.loadSnapshot();
  }

  deps.markProjectRevisionSeen(latestRevision);
  return { latestRevision, hydrated: !deps.isCancelled() };
}
