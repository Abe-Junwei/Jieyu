/**
 * 云端项目删除（全局墓碑，rev5 9.2）。
 * Cloud project deletion (global tombstone, rev5 9.2).
 *
 * - `deleteProjectFromCloud`：只有 owner 能调用 `delete_cloud_project`；成功后本机按墓碑处理。
 * - `applyCloudProjectTombstone`：任何客户端看到墓碑后执行：记下墓碑、出站队列作废
 *   （`cancelled_by_delete`，只记日志和数量）、通知其他标签页、执行本地清理任务。重复调用没有副作用。
 * Only the owner can call `delete_cloud_project`. Every client that sees the tombstone records it,
 * cancels its outbound queue (`cancelled_by_delete`), notifies other tabs and runs the cleanup job.
 */
import { loadProjectPendingOutboundChanges } from '../collaboration/cloud/CollaborationClientStateStore';
import { broadcastCollaborationLifecycle } from '../collaboration/cloud/collaborationLifecycleBroadcast';
import { markProjectCloudDeleted } from '../collaboration/cloud/collaborationLocalProjectRegistry';
import {
  getSupabaseBrowserClient,
  hasSupabaseBrowserClientConfig,
} from '../collaboration/cloud/collaborationSupabaseFacade';
import {
  classifyCollaborationServerRejection,
  type CollaborationServerRejection,
} from '../collaboration/cloud/collaborationServerRejection';
import { createLogger } from '../observability/logger';
import {
  enqueueProjectCleanupJob,
  runProjectCleanupJob,
  type ProjectCleanupDeps,
} from './projectLocalCleanupJobs';

const log = createLogger('projectCloudTombstone');

export interface CloudTombstoneResult {
  projectId: string;
  /** 被作废的出站修改条数（cancelled_by_delete）| Outbound changes cancelled by the delete */
  cancelledOutboundCount: number;
}

export async function applyCloudProjectTombstone(
  projectId: string,
  input: { deletedAt?: string | null } = {},
  deps: ProjectCleanupDeps = {},
): Promise<CloudTombstoneResult> {
  const id = projectId.trim();
  if (id.length === 0) throw new Error('applyCloudProjectTombstone requires a project id');
  const deletedAt =
    typeof input.deletedAt === 'string' && input.deletedAt.length > 0
      ? input.deletedAt
      : new Date().toISOString();
  const cancelledOutboundCount = loadProjectPendingOutboundChanges(id, deps.storage).length;
  try {
    markProjectCloudDeleted(id, deletedAt, deps.storage);
  } catch (error) {
    // 记录写不进去也继续清理：服务器已拒绝一切写入，墓碑优先 | Tombstone wins even without the record
    log.warn('failed to record cloud tombstone locally; continuing cleanup', {
      projectId: id,
      err: error,
    });
  }
  if (cancelledOutboundCount > 0) {
    log.info('outbound changes cancelled_by_delete', {
      projectId: id,
      count: cancelledOutboundCount,
    });
  }
  broadcastCollaborationLifecycle('project-deleted-cloud', id);
  enqueueProjectCleanupJob(id, 'cloud-deleted', deps.storage);
  await runProjectCleanupJob(id, deps);
  return { projectId: id, cancelledOutboundCount };
}

export class CloudProjectDeleteError extends Error {
  readonly rejection: CollaborationServerRejection | 'cloud-not-configured' | null;

  constructor(
    rejection: CollaborationServerRejection | 'cloud-not-configured' | null,
    message: string,
  ) {
    super(message);
    this.name = 'CloudProjectDeleteError';
    this.rejection = rejection;
  }
}

/**
 * owner 删除云端项目，然后按墓碑清理本机副本。
 * The owner deletes the cloud project; the local copy is then cleaned up as for any tombstone.
 */
export async function deleteProjectFromCloud(
  projectId: string,
  deps: ProjectCleanupDeps = {},
): Promise<CloudTombstoneResult> {
  const id = projectId.trim();
  if (!hasSupabaseBrowserClientConfig()) {
    throw new CloudProjectDeleteError('cloud-not-configured', 'Cloud sync is not configured');
  }
  const client = getSupabaseBrowserClient();
  const { data, error } = await client.rpc('delete_cloud_project', { p_project_id: id });
  if (error) {
    const message =
      typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : 'delete_cloud_project failed';
    throw new CloudProjectDeleteError(classifyCollaborationServerRejection(error), message);
  }
  return applyCloudProjectTombstone(
    id,
    { deletedAt: typeof data === 'string' ? data : null },
    deps,
  );
}
