// @vitest-environment jsdom
/**
 * T24（清理任务可续做）与 T26（本机部分：删除 / 仅从本机移除）。rev5 9.1、D6。
 * T24 (resumable cleanup jobs) and T26 (local part: delete vs remove from this device).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadProjectLastSeenRevision,
  loadProjectPendingOutboundChanges,
  saveProjectLastSeenRevision,
  saveProjectPendingOutboundChanges,
} from '../collaboration/cloud/CollaborationClientStateStore';
import {
  resetCollaborationLifecycleBroadcastForTests,
  subscribeCollaborationLifecycle,
  type CollaborationLifecycleMessage,
} from '../collaboration/cloud/collaborationLifecycleBroadcast';
import {
  COLLAB_LOCAL_PROJECT_REGISTRY_KEY,
  isProjectSyncBlockedLocally,
  listLocallyRemovedCloudProjects,
  markProjectCollaborationBound,
} from '../collaboration/cloud/collaborationLocalProjectRegistry';
import type { CollaborationProjectChangeRecord } from '../collaboration/cloud/syncTypes';
import {
  PROJECT_CLEANUP_JOBS_STORAGE_KEY,
  enqueueProjectCleanupJob,
  listPendingProjectCleanupJobs,
  resumeProjectCleanupJobs,
  runProjectCleanupJob,
  type ProjectCleanupDeps,
} from './projectLocalCleanupJobs';
import {
  ProjectHasUnsyncedChangesError,
  planProjectRemoval,
  removeProjectFromDevice,
} from './projectRemoval';
import { loadTrackEntityStateMap, saveTrackEntityStateMap } from './TrackEntityStore';

class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

function pendingChange(projectId: string): CollaborationProjectChangeRecord {
  return {
    id: `change-${projectId}`,
    projectId,
    actorId: 'actor',
    clientId: 'web-client',
    clientOpId: 'web-client:1',
    protocolVersion: 1,
    projectRevision: 0,
    baseRevision: 0,
    entityType: 'layer_unit',
    entityId: 'u1',
    opType: 'upsert_unit',
    payload: {},
    sourceKind: 'user',
    createdAt: new Date().toISOString(),
  };
}

function trackState() {
  return { mode: 'single' as const, laneLockMap: {}, updatedAt: '2026-10-09T00:00:00.000Z' };
}

let storage: MemoryStorage;
let deps: Required<ProjectCleanupDeps>;
let purgeMainDb: ReturnType<typeof vi.fn>;
let deleteProjectMemory: ReturnType<typeof vi.fn>;
let events: CollaborationLifecycleMessage[];
let unsubscribe: () => void;

beforeEach(() => {
  storage = new MemoryStorage();
  purgeMainDb = vi.fn(async () => undefined);
  deleteProjectMemory = vi.fn(async () => undefined);
  deps = {
    storage,
    listProjectMediaIds: vi.fn(async () => ['m1', 'm2']),
    purgeMainDb: purgeMainDb as unknown as (projectId: string) => Promise<void>,
    deleteProjectMemory: deleteProjectMemory as unknown as (projectId: string) => Promise<void>,
  };
  events = [];
  resetCollaborationLifecycleBroadcastForTests();
  unsubscribe = subscribeCollaborationLifecycle((message) => events.push(message));
});

afterEach(() => {
  unsubscribe();
  resetCollaborationLifecycleBroadcastForTests();
});

describe('T26 local removal (rev5 9.1, D6)', () => {
  it('never-collaborated project is deleted as before, without a removed record', async () => {
    expect(planProjectRemoval('p1', storage).mode).toBe('delete');
    await expect(removeProjectFromDevice('p1', {}, deps)).resolves.toBe('delete');
    expect(purgeMainDb).toHaveBeenCalledWith('p1');
    expect(deleteProjectMemory).toHaveBeenCalledWith('p1');
    expect(listLocallyRemovedCloudProjects(storage)).toEqual([]);
    expect(listPendingProjectCleanupJobs(storage)).toEqual([]);
    expect(events).toEqual([]);
  });

  it('collaborated project is only removed locally: record kept, cleanup done, sync blocked', async () => {
    markProjectCollaborationBound('p1', storage);
    saveProjectLastSeenRevision('p1', 7, storage);
    saveTrackEntityStateMap({ m1: trackState(), other: trackState() }, storage);

    await expect(removeProjectFromDevice('p1', { projectName: '田野录音' }, deps)).resolves.toBe(
      'remove-local',
    );

    expect(purgeMainDb).toHaveBeenCalledWith('p1');
    expect(loadProjectLastSeenRevision('p1', storage)).toBe(0);
    expect(Object.keys(loadTrackEntityStateMap(storage))).toEqual(['other']);
    const removed = listLocallyRemovedCloudProjects(storage);
    expect(removed).toHaveLength(1);
    expect(removed[0]).toMatchObject({ projectId: 'p1', projectName: '田野录音' });
    expect(isProjectSyncBlockedLocally('p1', storage)).toBe(true);
    expect(events.map((event) => [event.type, event.projectId])).toEqual([
      ['project-removed-locally', 'p1'],
    ]);
    // 删除后再判定：仍然算协作过，不会被当成可以静默删除的本地项目 | Still collaborated afterwards
    expect(planProjectRemoval('p1', storage).mode).toBe('remove-local');
  });

  it('unsynced changes block removal until the user chooses to discard them', async () => {
    markProjectCollaborationBound('p1', storage);
    saveProjectPendingOutboundChanges('p1', [pendingChange('p1')], storage);

    await expect(removeProjectFromDevice('p1', {}, deps)).rejects.toBeInstanceOf(
      ProjectHasUnsyncedChangesError,
    );
    expect(purgeMainDb).not.toHaveBeenCalled();
    expect(listLocallyRemovedCloudProjects(storage)).toEqual([]);
    expect(loadProjectPendingOutboundChanges('p1', storage)).toHaveLength(1);

    await expect(
      removeProjectFromDevice('p1', { discardUnsyncedChanges: true }, deps),
    ).resolves.toBe('remove-local');
    expect(loadProjectPendingOutboundChanges('p1', storage)).toEqual([]);
    expect(purgeMainDb).toHaveBeenCalledTimes(1);
  });

  it('a project with only pending outbound history is treated as collaborated', () => {
    saveProjectPendingOutboundChanges('p1', [pendingChange('p1')], storage);
    expect(planProjectRemoval('p1', storage)).toMatchObject({
      mode: 'remove-local',
      pendingOutboundCount: 1,
    });
  });

  it('unreadable registry: removal is local-only and refuses to run without its record', async () => {
    storage.setItem(COLLAB_LOCAL_PROJECT_REGISTRY_KEY, '{not json');
    expect(planProjectRemoval('p1', storage).mode).toBe('remove-local');
    await expect(removeProjectFromDevice('p1', {}, deps)).rejects.toThrow();
    expect(purgeMainDb).not.toHaveBeenCalled();
    expect(storage.getItem(COLLAB_LOCAL_PROJECT_REGISTRY_KEY)).toBe('{not json');
  });
});

describe('T24 cleanup jobs survive interruption', () => {
  it('a failed run keeps the job (with media ids) and resume finishes it', async () => {
    markProjectCollaborationBound('p1', storage);
    saveTrackEntityStateMap({ m1: trackState() }, storage);
    purgeMainDb.mockRejectedValueOnce(new Error('tab closed mid-purge'));

    await expect(removeProjectFromDevice('p1', {}, deps)).rejects.toThrow('tab closed mid-purge');
    const [job] = listPendingProjectCleanupJobs(storage);
    expect(job).toMatchObject({
      projectId: 'p1',
      reason: 'remove-local',
      attempts: 1,
      mediaIds: ['m1', 'm2'],
      lastError: 'tab closed mid-purge',
    });
    // 已移除记录先于清理写入，中断后项目不会被自动同步回来 | Removed record survives the interruption
    expect(isProjectSyncBlockedLocally('p1', storage)).toBe(true);

    // 模拟重新打开页面：媒体 id 已查不到，但任务里记着 | Media rows are gone; the job remembers them
    deps.listProjectMediaIds = vi.fn(async () => []);
    await expect(resumeProjectCleanupJobs(deps)).resolves.toEqual({ finished: ['p1'], failed: [] });
    expect(deps.listProjectMediaIds).not.toHaveBeenCalled();
    expect(loadTrackEntityStateMap(storage)).toEqual({});
    expect(purgeMainDb).toHaveBeenCalledTimes(2);
    expect(storage.getItem(PROJECT_CLEANUP_JOBS_STORAGE_KEY)).toBeNull();

    await expect(resumeProjectCleanupJobs(deps)).resolves.toEqual({ finished: [], failed: [] });
    expect(purgeMainDb).toHaveBeenCalledTimes(2);
  });

  it('one failing job does not block the others', async () => {
    enqueueProjectCleanupJob('bad', 'delete', storage);
    enqueueProjectCleanupJob('good', 'delete', storage);
    purgeMainDb.mockImplementation(async (projectId: string) => {
      if (projectId === 'bad') throw new Error('boom');
    });
    await expect(resumeProjectCleanupJobs(deps)).resolves.toEqual({
      finished: ['good'],
      failed: ['bad'],
    });
    expect(listPendingProjectCleanupJobs(storage).map((job) => job.projectId)).toEqual(['bad']);
  });

  it('concurrent runs for one project share a single execution', async () => {
    enqueueProjectCleanupJob('p1', 'delete', storage);
    await Promise.all([runProjectCleanupJob('p1', deps), runProjectCleanupJob('p1', deps)]);
    expect(purgeMainDb).toHaveBeenCalledTimes(1);
  });

  it('a later cloud tombstone strengthens an existing job reason', () => {
    enqueueProjectCleanupJob('p1', 'remove-local', storage);
    expect(enqueueProjectCleanupJob('p1', 'cloud-deleted', storage).reason).toBe('cloud-deleted');
    expect(enqueueProjectCleanupJob('p1', 'delete', storage).reason).toBe('cloud-deleted');
  });
});
