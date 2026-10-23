import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollaborationProjectChangeRecord } from './syncTypes';

const { importProjectScopedFromJSON, importFromJSON } = vi.hoisted(() => ({
  importProjectScopedFromJSON: vi.fn(async () => ({ collections: {} })),
  importFromJSON: vi.fn(async () => ({ collections: {} })),
}));

vi.mock('../../services/LinguisticService', () => ({
  LinguisticService: {
    database: {
      importProjectScopedFromJSON,
      importFromJSON,
    },
  },
}));

import { hydrateCollaborationProjectFromCloud } from './collaborationCloudHydration';
import {
  RECOVERY_TIMELINE_PAGE_SIZE,
  MAX_RECOVERY_TIMELINE_PAGES,
} from './cloudSyncConflictHelpers';
import { ProjectSnapshotMissingProjectError } from '../../services/linguisticServiceDatabaseIo';

function changeStub(): CollaborationProjectChangeRecord {
  return {
    id: 'c1',
    projectId: 'text-a',
    actorId: 'u1',
    clientId: 'cli',
    clientOpId: 'op',
    protocolVersion: 1,
    projectRevision: 2,
    baseRevision: 1,
    entityType: 'layer_unit',
    entityId: 'u1',
    opType: 'upsert_unit',
    sourceKind: 'sync',
    createdAt: '2026-09-20T00:00:00.000Z',
  };
}


function changeAt(revision: number): CollaborationProjectChangeRecord {
  return {
    ...changeStub(),
    id: `c-${revision}`,
    clientOpId: `op-${revision}`,
    projectRevision: revision,
    baseRevision: Math.max(0, revision - 1),
  };
}

describe('hydrateCollaborationProjectFromCloud', () => {
  beforeEach(() => {
    importProjectScopedFromJSON.mockClear();
    importFromJSON.mockClear();
  });

  it('restores the latest snapshot with project-scoped import, not replace-all', async () => {
    const payload = JSON.stringify({
      schemaVersion: 5,
      collections: { texts: [{ id: 'text-a' }] },
    });
    const result = await hydrateCollaborationProjectFromCloud({
      collaborationProjectId: 'text-a',
      hasProjectLocalData: false,
      getLatestKnownRevision: () => 0,
      listProjectSnapshots: async () => [{ id: 'snap-1', changeCursor: 4 }],
      queryProjectChangeTimeline: async () => ({ changes: [] }),
      restoreProjectSnapshotById: async () => ({ payloadJson: payload }),
      runWithDbMutex: async (fn) => fn(),
      loadSnapshot: async () => undefined,
      applyRemoteChangeToLocal: async () => undefined,
      markProjectRevisionSeen: () => undefined,
      isCancelled: () => false,
    });

    expect(result.hydrated).toBe(true);
    expect(importProjectScopedFromJSON).toHaveBeenCalledWith(payload, 'text-a');
    expect(importFromJSON).not.toHaveBeenCalled();
  });

  it('#355: a snapshot without the project is skipped (warn only) and hydration carries on', async () => {
    importProjectScopedFromJSON.mockRejectedValueOnce(
      new ProjectSnapshotMissingProjectError('text-a'),
    );
    const applyRemoteChangeToLocal = vi.fn(async () => undefined);
    const result = await hydrateCollaborationProjectFromCloud({
      collaborationProjectId: 'text-a',
      hasProjectLocalData: false,
      getLatestKnownRevision: () => 0,
      listProjectSnapshots: async () => [{ id: 'snap-1', changeCursor: 4 }],
      queryProjectChangeTimeline: async () => ({ changes: [changeStub()] }),
      restoreProjectSnapshotById: async () => ({
        payloadJson: JSON.stringify({ schemaVersion: 5, collections: {} }),
      }),
      runWithDbMutex: async (fn) => fn(),
      loadSnapshot: async () => undefined,
      applyRemoteChangeToLocal,
      markProjectRevisionSeen: () => undefined,
      isCancelled: () => false,
    });
    expect(result.hydrated).toBe(true);
    expect(importProjectScopedFromJSON).toHaveBeenCalledTimes(1);
  });

  it('does not import a snapshot when the project already has local units', async () => {
    await hydrateCollaborationProjectFromCloud({
      collaborationProjectId: 'text-a',
      hasProjectLocalData: true,
      getLatestKnownRevision: () => 3,
      listProjectSnapshots: async () => [{ id: 'snap-1', changeCursor: 4 }],
      queryProjectChangeTimeline: async () => ({ changes: [changeStub()] }),
      restoreProjectSnapshotById: async () => ({
        payloadJson: '{"schemaVersion":4,"collections":{}}',
      }),
      runWithDbMutex: async (fn) => fn(),
      loadSnapshot: async () => undefined,
      applyRemoteChangeToLocal: async () => undefined,
      markProjectRevisionSeen: () => undefined,
      isCancelled: () => false,
    });

    expect(importProjectScopedFromJSON).not.toHaveBeenCalled();
    expect(importFromJSON).not.toHaveBeenCalled();
  });

  it('#362: pages ascending from cursor; page-cap leaves hydrated false without claiming unseen max', async () => {
    const pageSize = RECOVERY_TIMELINE_PAGE_SIZE;
    const maxPages = MAX_RECOVERY_TIMELINE_PAGES;
    const cloudMax = pageSize * maxPages + 2; // 10002 — one past a full round
    const allRevisions = Array.from({ length: cloudMax - 1 }, (_, i) => i + 2); // 2..10002
    const applied: number[] = [];
    const calls: Array<{
      sinceRevision: number;
      limit: number;
      offset: number;
      ascending?: boolean;
    }> = [];
    const markProjectRevisionSeen = vi.fn();

    const result = await hydrateCollaborationProjectFromCloud({
      collaborationProjectId: 'text-a',
      hasProjectLocalData: true,
      getLatestKnownRevision: () => 1,
      listProjectSnapshots: async () => [],
      queryProjectChangeTimeline: async (opts) => {
        calls.push(opts);
        const ascending = opts.ascending === true;
        const filtered = allRevisions.filter((revision) => revision >= opts.sinceRevision);
        const ordered = ascending ? filtered : [...filtered].reverse();
        const slice = ordered.slice(opts.offset, opts.offset + opts.limit);
        return { changes: slice.map(changeAt) };
      },
      restoreProjectSnapshotById: async () => ({
        payloadJson: '{"schemaVersion":4,"collections":{}}',
      }),
      runWithDbMutex: async (fn) => fn(),
      loadSnapshot: async () => undefined,
      applyRemoteChangeToLocal: async (change) => {
        applied.push(change.projectRevision);
      },
      markProjectRevisionSeen,
      isCancelled: () => false,
    });

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((call) => call.ascending === true)).toBe(true);
    expect(applied[0]).toBe(2);
    expect(applied.length).toBe(pageSize * maxPages);
    expect(applied[applied.length - 1]).toBe(pageSize * maxPages + 1); // 10001
    expect(result.hydrated).toBe(false);
    expect(result.latestRevision).toBe(pageSize * maxPages + 1);
    expect(result.latestRevision).toBeLessThan(cloudMax);
    expect(markProjectRevisionSeen).toHaveBeenCalledWith(pageSize * maxPages + 1);
    expect(markProjectRevisionSeen).not.toHaveBeenCalledWith(cloudMax);
  });

});
