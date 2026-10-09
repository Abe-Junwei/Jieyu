/**
 * 持久化、可重试的本机项目清理任务（rev5 9.1、9.2、N6 跨库部分，T24）。
 * Persistent, retryable local project cleanup jobs (rev5 9.1, 9.2, N6 cross-store part; T24).
 *
 * 删除项目、仅从本机移除、看到云端墓碑，三种情况都先把任务写进 localStorage，再一步步执行；
 * 每一步都可以重复执行。页面在中途关闭时，下次启动由 `resumeProjectCleanupJobs` 接着做完。
 * Deleting a project, removing it from this device and seeing a cloud tombstone all persist a job
 * first and then run idempotent steps; a job interrupted by closing the page is finished on the next
 * start by `resumeProjectCleanupJobs`.
 *
 * 覆盖的存储 | Stores covered:
 * - 主库 `jieyu`：`purgeProjectRows(…, 'delete-project')`（2B-F）
 * - 协同客户端状态（游标、待发队列）
 * - 项目记忆库 `jieyu-project-memory`
 * - 轨道显示状态 `jieyu:track-entity-state:v1`（按媒体 id）
 * 不覆盖：语音会话、行为日志（私人日志，8.1 规定保留）；声学缓存（派生、按容量自动淘汰）。
 * Not covered: voice sessions and the behaviour log (private logs kept per 8.1); the acoustic cache
 * (derived, size-bounded eviction).
 */
import { clearProjectCollabClientState } from '../collaboration/cloud/CollaborationClientStateStore';
import { getDb } from '../db';
import { createLogger } from '../observability/logger';
import { deleteProjectCascade } from './LinguisticService.cleanup';
import { projectMemoryStore } from './ProjectMemoryStore';
import { loadTrackEntityStateMap, saveTrackEntityStateMap } from './TrackEntityStore';

const log = createLogger('projectLocalCleanupJobs');

export const PROJECT_CLEANUP_JOBS_STORAGE_KEY = 'jieyu:project-cleanup-jobs:v1';

/** delete：从未协作的项目；remove-local：仅从本机移除；cloud-deleted：云端墓碑 */
export type ProjectCleanupReason = 'delete' | 'remove-local' | 'cloud-deleted';

export interface ProjectCleanupJob {
  projectId: string;
  reason: ProjectCleanupReason;
  queuedAt: string;
  attempts: number;
  /** 清理主库前先记下媒体 id，供按媒体 id 存放的状态使用 | Media ids captured before the main purge */
  mediaIds?: string[];
  lastError?: string;
}

export interface ProjectCleanupDeps {
  storage?: Storage;
  listProjectMediaIds?: (projectId: string) => Promise<string[]>;
  purgeMainDb?: (projectId: string) => Promise<void>;
  deleteProjectMemory?: (projectId: string) => Promise<void>;
}

function getDefaultStorage(): Storage | undefined {
  if (typeof window === 'undefined' || window.localStorage === undefined) return undefined;
  return window.localStorage;
}

/** 没有 localStorage 的运行环境里，任务只存在内存中（无法跨启动续做）| No-storage fallback */
let memoryJobs: Record<string, ProjectCleanupJob> = {};

function loadJobs(storage: Storage | undefined): Record<string, ProjectCleanupJob> {
  if (storage === undefined) return { ...memoryJobs };
  try {
    const raw = storage.getItem(PROJECT_CLEANUP_JOBS_STORAGE_KEY);
    if (raw === null || raw.length === 0) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const jobs: Record<string, ProjectCleanupJob> = {};
    for (const [projectId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value === null || typeof value !== 'object') continue;
      const job = value as Partial<ProjectCleanupJob>;
      if (
        job.reason !== 'delete' &&
        job.reason !== 'remove-local' &&
        job.reason !== 'cloud-deleted'
      ) {
        continue;
      }
      jobs[projectId] = {
        projectId,
        reason: job.reason,
        queuedAt: typeof job.queuedAt === 'string' ? job.queuedAt : new Date(0).toISOString(),
        attempts:
          typeof job.attempts === 'number' && Number.isFinite(job.attempts) ? job.attempts : 0,
        ...(Array.isArray(job.mediaIds)
          ? { mediaIds: job.mediaIds.filter((id): id is string => typeof id === 'string') }
          : {}),
        ...(typeof job.lastError === 'string' ? { lastError: job.lastError } : {}),
      };
    }
    return jobs;
  } catch {
    return {};
  }
}

function saveJobs(storage: Storage | undefined, jobs: Record<string, ProjectCleanupJob>): void {
  if (storage === undefined) {
    memoryJobs = { ...jobs };
    return;
  }
  if (Object.keys(jobs).length === 0) {
    storage.removeItem(PROJECT_CLEANUP_JOBS_STORAGE_KEY);
    return;
  }
  storage.setItem(PROJECT_CLEANUP_JOBS_STORAGE_KEY, JSON.stringify(jobs));
}

function updateJob(
  storage: Storage | undefined,
  projectId: string,
  updater: (job: ProjectCleanupJob | undefined) => ProjectCleanupJob | null,
): ProjectCleanupJob | null {
  const jobs = loadJobs(storage);
  const next = updater(jobs[projectId]);
  if (next === null) delete jobs[projectId];
  else jobs[projectId] = next;
  saveJobs(storage, jobs);
  return next;
}

/** 当前没做完的任务 | Jobs not finished yet */
export function listPendingProjectCleanupJobs(storage = getDefaultStorage()): ProjectCleanupJob[] {
  return Object.values(loadJobs(storage)).sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

/**
 * 写入任务（同一项目已有任务时保留原任务，只在原因更强时更新原因）。
 * Persist a job (an existing job for the project is kept; its reason is only strengthened).
 */
export function enqueueProjectCleanupJob(
  projectId: string,
  reason: ProjectCleanupReason,
  storage = getDefaultStorage(),
): ProjectCleanupJob {
  const id = projectId.trim();
  if (id.length === 0) throw new Error('enqueueProjectCleanupJob requires a project id');
  const job = updateJob(storage, id, (existing) => {
    if (existing) {
      return reason === 'cloud-deleted' ? { ...existing, reason } : existing;
    }
    return { projectId: id, reason, queuedAt: new Date().toISOString(), attempts: 0 };
  });
  return job!;
}

async function defaultListProjectMediaIds(projectId: string): Promise<string[]> {
  const db = await getDb();
  return (await db.dexie.media_items.where('textId').equals(projectId).primaryKeys()) as string[];
}

function removeTrackEntityState(mediaIds: readonly string[], storage: Storage | undefined): void {
  if (storage === undefined || mediaIds.length === 0) return;
  const map = loadTrackEntityStateMap(storage);
  let changed = false;
  for (const mediaId of mediaIds) {
    if (mediaId in map) {
      delete map[mediaId];
      changed = true;
    }
  }
  if (changed) saveTrackEntityStateMap(map, storage);
}

const runningJobs = new Map<string, Promise<void>>();

/**
 * 执行一个项目的清理任务；同一项目同时只跑一份。失败时任务留在队列里，错误照常抛出。
 * Run one project's job; one run per project at a time. On failure the job stays queued and the
 * error is rethrown.
 */
export function runProjectCleanupJob(
  projectId: string,
  deps: ProjectCleanupDeps = {},
): Promise<void> {
  const id = projectId.trim();
  const running = runningJobs.get(id);
  if (running) return running;
  const run = runJobSteps(id, deps).finally(() => {
    runningJobs.delete(id);
  });
  runningJobs.set(id, run);
  return run;
}

async function runJobSteps(projectId: string, deps: ProjectCleanupDeps): Promise<void> {
  const storage = deps.storage ?? getDefaultStorage();
  const listMediaIds = deps.listProjectMediaIds ?? defaultListProjectMediaIds;
  const purgeMainDb = deps.purgeMainDb ?? deleteProjectCascade;
  const deleteMemory =
    deps.deleteProjectMemory ?? ((id: string) => projectMemoryStore.deleteProjectMemory(id));

  let job = loadJobs(storage)[projectId];
  if (!job) return;
  job = updateJob(storage, projectId, (current) =>
    current ? { ...current, attempts: current.attempts + 1 } : null,
  )!;

  try {
    // 1. 先记下媒体 id（主库清掉之后就查不到了）| Capture media ids before the main purge
    if (job.mediaIds === undefined) {
      const mediaIds = await listMediaIds(projectId);
      job = updateJob(storage, projectId, (current) =>
        current ? { ...current, mediaIds } : null,
      )!;
    }
    // 2. 协同状态：游标与待发队列 | Sync state: cursor and pending queue
    clearProjectCollabClientState(projectId, storage);
    // 3. 其他本机库与键 | Other local stores and keys
    await deleteMemory(projectId);
    removeTrackEntityState(job.mediaIds ?? [], storage);
    // 4. 主库（一个事务）| Main DB (one transaction)
    await purgeMainDb(projectId);
    // 5. 完成 | Done
    updateJob(storage, projectId, () => null);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateJob(storage, projectId, (current) =>
      current ? { ...current, lastError: message } : null,
    );
    log.warn('project cleanup job failed; it stays queued', { projectId, err: error });
    throw error;
  }
}

/**
 * 启动时接着执行没做完的任务（T24）。单个任务失败不影响其他任务。
 * Finish pending jobs on start (T24). One failing job does not block the others.
 */
export async function resumeProjectCleanupJobs(
  deps: ProjectCleanupDeps = {},
): Promise<{ finished: string[]; failed: string[] }> {
  const storage = deps.storage ?? getDefaultStorage();
  const finished: string[] = [];
  const failed: string[] = [];
  for (const job of listPendingProjectCleanupJobs(storage)) {
    try {
      await runProjectCleanupJob(job.projectId, deps);
      finished.push(job.projectId);
    } catch {
      failed.push(job.projectId);
    }
  }
  return { finished, failed };
}
