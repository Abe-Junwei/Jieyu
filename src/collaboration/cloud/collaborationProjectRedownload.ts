/**
 * 手动重新下载“已从本机移除”的云端项目（rev5 9.1，T26）。
 * Manually re-download a cloud project that was removed from this device (rev5 9.1; T26).
 *
 * 先检查云端墓碑；再取最新快照写回本机（与协作水合同一个入口），记下快照对应的 revision，
 * 最后才清掉“已移除”标记。之后打开项目时，桥接照常补齐快照之后的修改。
 * Checks the tombstone first, imports the latest snapshot (same entry as hydration), records its
 * revision and only then clears the removed mark; opening the project replays later changes.
 */
import { importProjectScopedFromJSON } from '../../services/linguisticServiceDatabaseIo';
import { saveProjectLastSeenRevision } from './CollaborationClientStateStore';
import { CollaborationSnapshotService } from './CollaborationSnapshotService';
import {
  getSupabaseBrowserClient,
  hasSupabaseBrowserClientConfig,
} from './collaborationSupabaseFacade';
import {
  clearProjectRemovedLocally,
  markProjectCloudDeleted,
} from './collaborationLocalProjectRegistry';

export type RedownloadFailureReason =
  | 'cloud-not-configured'
  | 'project-not-found'
  | 'project-deleted'
  | 'no-snapshot';

export class CloudProjectRedownloadError extends Error {
  readonly reason: RedownloadFailureReason;

  constructor(reason: RedownloadFailureReason) {
    super(`Cloud project re-download failed: ${reason}`);
    this.name = 'CloudProjectRedownloadError';
    this.reason = reason;
  }
}

export async function redownloadLocallyRemovedCloudProject(projectId: string): Promise<void> {
  const id = projectId.trim();
  if (!hasSupabaseBrowserClientConfig())
    throw new CloudProjectRedownloadError('cloud-not-configured');
  const client = getSupabaseBrowserClient();
  const { data: row, error } = await client
    .from('projects')
    .select('id, deleted_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new CloudProjectRedownloadError('project-not-found');
  const deletedAt = (row as { deleted_at?: unknown }).deleted_at;
  if (typeof deletedAt === 'string' && deletedAt.length > 0) {
    markProjectCloudDeleted(id, deletedAt);
    throw new CloudProjectRedownloadError('project-deleted');
  }

  const snapshots = new CollaborationSnapshotService();
  const [latest] = await snapshots.listSnapshots({ projectId: id, limit: 1 });
  if (!latest) throw new CloudProjectRedownloadError('no-snapshot');
  const { payloadJson } = await snapshots.downloadSnapshotById(latest.id);
  await importProjectScopedFromJSON(payloadJson, id);
  saveProjectLastSeenRevision(id, latest.changeCursor);
  clearProjectRemovedLocally(id);
}
