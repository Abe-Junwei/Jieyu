// @vitest-environment jsdom
/**
 * T23（本机部分）：看到云端墓碑后作废出站队列并清理本机副本；owner 删除云端项目。rev5 9.2。
 * T23 (local part): a cloud tombstone cancels outbound and cleans up; owner cloud delete. rev5 9.2.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, hasConfig } = vi.hoisted(() => ({
  rpc: vi.fn(),
  hasConfig: vi.fn(() => true),
}));

vi.mock('../collaboration/cloud/collaborationSupabaseFacade', () => ({
  hasSupabaseBrowserClientConfig: hasConfig,
  getSupabaseBrowserClient: () => ({ rpc }),
  getSupabaseUserId: async () => 'owner-1',
}));

import {
  loadProjectPendingOutboundChanges,
  saveProjectPendingOutboundChanges,
} from '../collaboration/cloud/CollaborationClientStateStore';
import {
  resetCollaborationLifecycleBroadcastForTests,
  subscribeCollaborationLifecycle,
} from '../collaboration/cloud/collaborationLifecycleBroadcast';
import {
  isProjectSyncBlockedLocally,
  listLocallyRemovedCloudProjects,
  markProjectRemovedLocally,
  readCollaborationLocalRegistry,
} from '../collaboration/cloud/collaborationLocalProjectRegistry';
import type { CollaborationProjectChangeRecord } from '../collaboration/cloud/syncTypes';
import {
  CloudProjectDeleteError,
  applyCloudProjectTombstone,
  deleteProjectFromCloud,
} from './projectCloudTombstone';
import { listPendingProjectCleanupJobs, type ProjectCleanupDeps } from './projectLocalCleanupJobs';

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

let deps: ProjectCleanupDeps;
let purge: ReturnType<typeof vi.fn>;
let events: string[];
let unsubscribe: () => void;

beforeEach(() => {
  window.localStorage.clear();
  purge = vi.fn(async () => undefined);
  deps = {
    storage: window.localStorage,
    listProjectMediaIds: async () => [],
    purgeMainDb: purge as unknown as (projectId: string) => Promise<void>,
    deleteProjectMemory: async () => undefined,
  };
  rpc.mockReset();
  hasConfig.mockReturnValue(true);
  events = [];
  resetCollaborationLifecycleBroadcastForTests();
  unsubscribe = subscribeCollaborationLifecycle((m) => events.push(`${m.type}:${m.projectId}`));
});

afterEach(() => {
  unsubscribe();
});

describe('applyCloudProjectTombstone (9.2)', () => {
  it('cancels outbound (cancelled_by_delete), records the tombstone and cleans up locally', async () => {
    saveProjectPendingOutboundChanges('p1', [pendingChange('p1')], window.localStorage);
    const result = await applyCloudProjectTombstone(
      'p1',
      { deletedAt: '2026-10-09T03:00:00.000Z' },
      deps,
    );
    expect(result).toEqual({ projectId: 'p1', cancelledOutboundCount: 1 });
    expect(loadProjectPendingOutboundChanges('p1', window.localStorage)).toEqual([]);
    expect(purge).toHaveBeenCalledWith('p1');
    expect(listPendingProjectCleanupJobs(window.localStorage)).toEqual([]);
    const registry = readCollaborationLocalRegistry(window.localStorage);
    expect(registry.ok && registry.records.p1?.cloudDeletedAt).toBe('2026-10-09T03:00:00.000Z');
    expect(isProjectSyncBlockedLocally('p1', window.localStorage)).toBe(true);
    expect(events).toEqual(['project-deleted-cloud:p1']);
  });

  it('a project removed locally earlier leaves the re-download list once tombstoned', async () => {
    markProjectRemovedLocally('p1', { projectName: 'x' }, window.localStorage);
    expect(listLocallyRemovedCloudProjects(window.localStorage)).toHaveLength(1);
    await applyCloudProjectTombstone('p1', {}, deps);
    expect(listLocallyRemovedCloudProjects(window.localStorage)).toEqual([]);
  });

  it('a corrupt registry does not stop the cleanup (tombstone wins)', async () => {
    window.localStorage.setItem('jieyu:collab-local-projects:v1', '{broken');
    await applyCloudProjectTombstone('p1', {}, deps);
    expect(purge).toHaveBeenCalledWith('p1');
  });
});

describe('deleteProjectFromCloud (owner only)', () => {
  it('calls the RPC and then applies the tombstone locally', async () => {
    rpc.mockResolvedValue({ data: '2026-10-09T04:00:00.000Z', error: null });
    await deleteProjectFromCloud('p1', deps);
    expect(rpc).toHaveBeenCalledWith('delete_cloud_project', { p_project_id: 'p1' });
    expect(purge).toHaveBeenCalledWith('p1');
  });

  it('a non-owner gets owner-only and nothing local is touched', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'JYOWN', message: 'JIEYU_OWNER_ONLY' } });
    await expect(deleteProjectFromCloud('p1', deps)).rejects.toMatchObject({
      name: 'CloudProjectDeleteError',
      rejection: 'owner-only',
    });
    expect(purge).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it('without cloud config it refuses before any request', async () => {
    hasConfig.mockReturnValue(false);
    await expect(deleteProjectFromCloud('p1', deps)).rejects.toBeInstanceOf(
      CloudProjectDeleteError,
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});
