/**
 * D6 判定：项目是否“从未协作过”（rev5 D6、9.4，T27）。第 3 批的覆盖、整库还原都靠它。
 * D6 decision: has a project never been collaborated on (rev5 D6, 9.4; T27). Batch 3 uses it for
 * overwrite and whole-database restore.
 *
 * “从未协作”= 没有协作绑定，并且从来没有出站记录。证据来自：
 * - 本机协作记录（绑定、第一次出站）
 * - 协同客户端状态（看到过云端 revision、或者有待发的出站修改）
 * 任何一处读不到，就判定不了，按“协作过”处理。
 * "Never collaborated" = no collaboration binding and never any outbound record. Evidence comes
 * from the local collaboration registry and the sync client state; any unreadable source means
 * the answer is unknown, which counts as collaborated.
 */
import {
  loadProjectLastSeenRevision,
  loadProjectPendingOutboundChanges,
  probeCollabClientStateReadable,
} from './CollaborationClientStateStore';
import { readCollaborationLocalRegistry } from './collaborationLocalProjectRegistry';

export type ProjectCollaborationVerdict = 'never-collaborated' | 'collaborated' | 'unknown';

export interface ProjectCollaborationAssessment {
  verdict: ProjectCollaborationVerdict;
  /** 机器可读的证据 | Machine-readable evidence */
  evidence: string[];
}

export interface ProjectCollaborationHistorySources {
  storage?: Storage;
}

function getDefaultStorage(): Storage | undefined {
  if (typeof window === 'undefined' || window.localStorage === undefined) return undefined;
  return window.localStorage;
}

/** 给出判定和证据 | Return the verdict and its evidence */
export function assessProjectCollaborationHistory(
  projectId: string,
  sources: ProjectCollaborationHistorySources = {},
): ProjectCollaborationAssessment {
  const id = projectId.trim();
  if (id.length === 0) return { verdict: 'unknown', evidence: ['empty-project-id'] };
  const storage = sources.storage ?? getDefaultStorage();
  // 运行环境根本没有 localStorage（非浏览器）：协同状态和记录都无处存放，不可能协作过。
  // 浏览器里 localStorage 读失败仍按“判定不了”处理。
  // No localStorage API at all (non-browser runtime): no sync state can exist here. A browser whose
  // storage throws is still "unknown".
  if (storage === undefined)
    return { verdict: 'never-collaborated', evidence: ['no-local-storage-api'] };

  const registry = readCollaborationLocalRegistry(storage);
  if (!registry.ok) return { verdict: 'unknown', evidence: [`registry-${registry.reason}`] };

  const evidence: string[] = [];
  const record = registry.records[id];
  if (record?.boundAt !== undefined) evidence.push('collaboration-binding');
  if (record?.firstOutboundAt !== undefined) evidence.push('outbound-history');
  if (record?.removedLocallyAt !== undefined) evidence.push('removed-locally');
  if (record?.cloudDeletedAt !== undefined) evidence.push('cloud-tombstone');

  if (!probeCollabClientStateReadable(storage)) {
    return { verdict: 'unknown', evidence: [...evidence, 'client-state-unreadable'] };
  }
  if (loadProjectLastSeenRevision(id, storage) > 0) evidence.push('cloud-revision-seen');
  if (loadProjectPendingOutboundChanges(id, storage).length > 0) evidence.push('pending-outbound');

  return { verdict: evidence.length > 0 ? 'collaborated' : 'never-collaborated', evidence };
}

/**
 * 只有能确认“从未协作”时才返回 true；判定不了按协作过处理（D6）。
 * True only when "never collaborated" is certain; unknown counts as collaborated (D6).
 */
export function isProjectNeverCollaborated(
  projectId: string,
  sources: ProjectCollaborationHistorySources = {},
): boolean {
  return assessProjectCollaborationHistory(projectId, sources).verdict === 'never-collaborated';
}

/**
 * 从一组项目 id 里筛出“协作过或判定不了”的（D6；P4）。
 * From a set of project ids, keep those that collaborated or are undecidable (D6; P4).
 */
export function listCollaboratedIds(
  ids: readonly string[],
  sources: ProjectCollaborationHistorySources = {},
): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0))].filter(
    (id) => !isProjectNeverCollaborated(id, sources),
  );
}
