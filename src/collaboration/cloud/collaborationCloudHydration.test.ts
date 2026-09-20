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

describe('hydrateCollaborationProjectFromCloud', () => {
  beforeEach(() => {
    importProjectScopedFromJSON.mockClear();
    importFromJSON.mockClear();
  });

  it('restores the latest snapshot with project-scoped import, not replace-all', async () => {
    const payload = JSON.stringify({
      schemaVersion: 4,
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
});
