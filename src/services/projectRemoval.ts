/**
 * 删除项目 / 仅从本机移除（rev5 9.1、D6，T26 本地部分）。
 * Delete a project / remove it from this device only (rev5 9.1, D6; T26 local part).
 *
 * - 从未协作过的项目（D6）：删除本机数据，和原来一样。
 * - 协作过、或判定不了的项目：只从本机移除。本机写一条“已移除”记录（永远不发给服务器），
 *   然后执行同一个清理任务。云端和其他协作者不受影响；之后可以手动重新下载。
 * - 有未同步的出站修改时先抛 `ProjectHasUnsyncedChangesError`，由界面让用户选择：
 *   取消（等同步完成后再移除）或放弃这些修改。
 * Never-collaborated projects are deleted locally as before. Collaborated (or undecidable) projects
 * are only removed from this device: a local "removed" record is written (never sent) and the same
 * cleanup job runs. Unsynced outbound changes raise `ProjectHasUnsyncedChangesError` first.
 */
import { loadProjectPendingOutboundChanges } from '../collaboration/cloud/CollaborationClientStateStore';
import { broadcastCollaborationLifecycle } from '../collaboration/cloud/collaborationLifecycleBroadcast';
import { markProjectRemovedLocally } from '../collaboration/cloud/collaborationLocalProjectRegistry';
import {
  assessProjectCollaborationHistory,
  type ProjectCollaborationAssessment,
} from '../collaboration/cloud/projectCollaborationHistory';
import {
  enqueueProjectCleanupJob,
  runProjectCleanupJob,
  type ProjectCleanupDeps,
} from './projectLocalCleanupJobs';

export type ProjectRemovalMode = 'delete' | 'remove-local';

export interface ProjectRemovalPlan {
  projectId: string;
  mode: ProjectRemovalMode;
  pendingOutboundCount: number;
  collaboration: ProjectCollaborationAssessment;
}

export class ProjectHasUnsyncedChangesError extends Error {
  readonly pendingOutboundCount: number;

  constructor(projectId: string, pendingOutboundCount: number) {
    super(`Project ${projectId} has ${pendingOutboundCount} unsynced outbound change(s)`);
    this.name = 'ProjectHasUnsyncedChangesError';
    this.pendingOutboundCount = pendingOutboundCount;
  }
}

export interface RemoveProjectOptions {
  /** 用户已确认放弃未同步的修改 | The user chose to discard unsynced changes */
  discardUnsyncedChanges?: boolean;
  /** 用于“已从本机移除”列表 | Shown in the removed list */
  projectName?: string;
}

/** 删除前的判断：删除还是仅从本机移除，有几条未同步修改 | What removal will do */
export function planProjectRemoval(projectId: string, storage?: Storage): ProjectRemovalPlan {
  const id = projectId.trim();
  const collaboration = assessProjectCollaborationHistory(id, storage ? { storage } : {});
  return {
    projectId: id,
    mode: collaboration.verdict === 'never-collaborated' ? 'delete' : 'remove-local',
    pendingOutboundCount: loadProjectPendingOutboundChanges(id, storage).length,
    collaboration,
  };
}

/**
 * 删除项目或仅从本机移除。返回实际采用的方式。
 * Delete the project or remove it from this device; returns the mode used.
 */
export async function removeProjectFromDevice(
  projectId: string,
  options: RemoveProjectOptions = {},
  deps: ProjectCleanupDeps = {},
): Promise<ProjectRemovalMode> {
  const plan = planProjectRemoval(projectId, deps.storage);
  if (plan.projectId.length === 0) throw new Error('removeProjectFromDevice requires a project id');
  if (plan.pendingOutboundCount > 0 && options.discardUnsyncedChanges !== true) {
    throw new ProjectHasUnsyncedChangesError(plan.projectId, plan.pendingOutboundCount);
  }
  if (plan.mode === 'remove-local') {
    // 记录写不进去就不删：否则重新登录时会被自动拉回来 | No record, no removal (it would be pulled back)
    markProjectRemovedLocally(
      plan.projectId,
      options.projectName !== undefined ? { projectName: options.projectName } : {},
      deps.storage,
    );
    broadcastCollaborationLifecycle('project-removed-locally', plan.projectId);
  }
  enqueueProjectCleanupJob(plan.projectId, plan.mode, deps.storage);
  await runProjectCleanupJob(plan.projectId, deps);
  return plan.mode;
}
