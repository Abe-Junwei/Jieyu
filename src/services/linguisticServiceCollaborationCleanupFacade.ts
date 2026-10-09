import {
  deleteAudioPreserveTimeline,
  removeUnitCascade,
  removeUnitsBatchCascade,
} from './LinguisticService.cleanup';
import { dispatchWorkspaceUnitUpdated } from '../utils/workspaceEvents';
import {
  planProjectRemoval,
  removeProjectFromDevice,
  type ProjectRemovalMode,
  type ProjectRemovalPlan,
  type RemoveProjectOptions,
} from './projectRemoval';
import { resumeProjectCleanupJobs } from './projectLocalCleanupJobs';
import { listLocallyRemovedCloudProjects } from '../collaboration/cloud/collaborationLocalProjectRegistry';
import { redownloadLocallyRemovedCloudProject } from '../collaboration/cloud/collaborationProjectRedownload';

/**
 * 删除项目：从未协作过的项目删除本机数据；协作过的只从本机移除（rev5 9.1、D6）。
 * 都经过持久化的清理任务（T24）。
 * Delete a project: never-collaborated projects are deleted locally; collaborated ones are only
 * removed from this device (rev5 9.1, D6). Both go through the persistent cleanup job (T24).
 */
export async function deleteProject(
  textId: string,
  options: RemoveProjectOptions = {},
): Promise<ProjectRemovalMode> {
  return removeProjectFromDevice(textId, options);
}

export function planDeleteProject(textId: string): ProjectRemovalPlan {
  return planProjectRemoval(textId);
}

export {
  listLocallyRemovedCloudProjects,
  redownloadLocallyRemovedCloudProject,
  resumeProjectCleanupJobs,
};

export async function deleteAudio(mediaId: string): Promise<void> {
  await deleteAudioPreserveTimeline(mediaId);
}

export async function removeUnit(unitId: string): Promise<void> {
  await removeUnitCascade(unitId);
  dispatchWorkspaceUnitUpdated({ unitId });
}

export async function removeUnitsBatch(unitIds: readonly string[]): Promise<void> {
  await removeUnitsBatchCascade(unitIds);
  for (const unitId of unitIds) {
    dispatchWorkspaceUnitUpdated({ unitId });
  }
}
