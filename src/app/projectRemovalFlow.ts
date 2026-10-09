/**
 * 删除项目 / 仅从本机移除的交互流程（rev5 9.1）。页面只提供确认框，判断和执行都在这里。
 * The delete / remove-from-this-device flow (rev5 9.1). Pages provide the prompts only.
 */
import { CloudProjectRedownloadError } from '../collaboration/cloud/collaborationProjectRedownload';
import { LinguisticService } from '../services/LinguisticService';
import {
  ProjectHasUnsyncedChangesError,
  type ProjectRemovalMode,
  type RemoveProjectOptions,
} from '../services/projectRemoval';
import type { ITranscriptionAppServiceGateway } from './TranscriptionAppService';

export interface ProjectRemovalPrompts {
  /** 协作过的项目：确认“只从本机移除” | Collaborated project: confirm local-only removal */
  confirmRemoveLocally: () => boolean;
  /** 有未同步修改：确认放弃 | Unsynced changes: confirm discarding them */
  confirmDiscardUnsynced: (count: number) => boolean;
}

export type ProjectRemovalOutcome = ProjectRemovalMode | 'cancelled';

async function readProjectName(textId: string): Promise<string | undefined> {
  try {
    const text = await LinguisticService.timeline.getTextById(textId);
    const title = (text?.title ?? {}) as Record<string, string | undefined>;
    const name = Object.values(title).find(
      (value) => typeof value === 'string' && value.trim().length > 0,
    );
    return name?.trim();
  } catch {
    return undefined;
  }
}

export async function runProjectRemovalWithPrompts(
  service: Pick<ITranscriptionAppServiceGateway, 'deleteProject' | 'planDeleteProject'>,
  textId: string,
  prompts: ProjectRemovalPrompts,
): Promise<ProjectRemovalOutcome> {
  const plan = service.planDeleteProject(textId);
  if (plan.mode === 'remove-local' && !prompts.confirmRemoveLocally()) return 'cancelled';
  const options: RemoveProjectOptions = {};
  if (plan.mode === 'remove-local') {
    const projectName = await readProjectName(textId);
    if (projectName !== undefined) options.projectName = projectName;
  }
  if (plan.pendingOutboundCount > 0) {
    if (!prompts.confirmDiscardUnsynced(plan.pendingOutboundCount)) return 'cancelled';
    options.discardUnsyncedChanges = true;
  }
  try {
    return await service.deleteProject(textId, options);
  } catch (error) {
    // 确认期间又产生了待发修改 | New pending changes appeared while the prompts were open
    if (
      error instanceof ProjectHasUnsyncedChangesError &&
      options.discardUnsyncedChanges !== true
    ) {
      if (!prompts.confirmDiscardUnsynced(error.pendingOutboundCount)) return 'cancelled';
      return service.deleteProject(textId, { ...options, discardUnsyncedChanges: true });
    }
    throw error;
  }
}

export interface RemovedCloudProjectEntry {
  projectId: string;
  removedAt: string;
  projectName?: string;
}

/** 已从本机移除、云端仍在的项目 | Projects removed here whose cloud copy still exists */
export function listRemovedCloudProjects(): RemovedCloudProjectEntry[] {
  return LinguisticService.cleanup.listLocallyRemovedCloudProjects();
}

export type RedownloadOutcome =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'cloud-not-configured'
        | 'project-not-found'
        | 'project-deleted'
        | 'no-snapshot'
        | 'other';
      message: string;
    };

/** 手动重新下载（永不自动）| Manual re-download (never automatic) */
export async function redownloadRemovedCloudProject(projectId: string): Promise<RedownloadOutcome> {
  try {
    await LinguisticService.cleanup.redownloadLocallyRemovedCloudProject(projectId);
    return { ok: true };
  } catch (error) {
    const reason = error instanceof CloudProjectRedownloadError ? error.reason : ('other' as const);
    return { ok: false, reason, message: error instanceof Error ? error.message : String(error) };
  }
}
