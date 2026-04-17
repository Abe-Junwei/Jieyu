// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTranscriptionCloudSyncActions, type UseTranscriptionCloudSyncActionsParams } from './useTranscriptionCloudSyncActions';

const {
  mockUpsert,
  mockFrom,
  mockGetSupabaseUserId,
  mockHasSupabaseBrowserClientConfig,
  mockBridge,
  mockPresenceUpdate,
  mockPresenceDisconnect,
} = vi.hoisted(() => {
  const mockUpsert = vi.fn<(row: unknown, options: unknown) => Promise<{ error: null }>>().mockResolvedValue({ error: null });
  const mockFrom = vi.fn(() => ({ upsert: mockUpsert }));
  const mockGetSupabaseUserId = vi.fn<() => Promise<string | null>>().mockResolvedValue('user-1');
  const mockHasSupabaseBrowserClientConfig = vi.fn<() => boolean>().mockReturnValue(true);
  const mockBridge = {
    isBridgeReady: true,
    collaborationProtocolGuard: {
      cloudWritesDisabled: false,
      reasons: [],
      outboundProtocolVersion: 1,
    },
    collaborationOutboundPendingCount: 0,
    enqueueMutation: vi.fn(),
    markProjectRevisionSeen: vi.fn(),
    getLatestKnownRevision: vi.fn(() => 0),
    registerProjectAsset: vi.fn(),
    listProjectAssets: vi.fn(async () => []),
    removeProjectAsset: vi.fn(),
    getProjectAssetSignedUrl: vi.fn(),
    createProjectSnapshot: vi.fn(),
    listProjectSnapshots: vi.fn(async () => []),
    restoreProjectSnapshotById: vi.fn(),
    queryProjectChangeTimeline: vi.fn(async () => ({ changes: [], total: 0 })),
    queryProjectEntityHistory: vi.fn(async () => []),
  };

  const mockPresenceUpdate = vi.fn<(patch: { state: 'online' | 'idle' | 'offline' }) => Promise<void>>().mockResolvedValue(undefined);
  const mockPresenceDisconnect = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

  return {
    mockUpsert,
    mockFrom,
    mockGetSupabaseUserId,
    mockHasSupabaseBrowserClientConfig,
    mockBridge,
    mockPresenceUpdate,
    mockPresenceDisconnect,
  };
});

vi.mock('./useTranscriptionCollaborationBridge', () => ({
  useTranscriptionCollaborationBridge: () => mockBridge,
}));

vi.mock('../integrations/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: mockFrom }),
  hasSupabaseBrowserClientConfig: mockHasSupabaseBrowserClientConfig,
}));

vi.mock('../integrations/supabase/auth', () => ({
  getSupabaseUserId: mockGetSupabaseUserId,
}));

vi.mock('../collaboration/cloud/CollaborationPresenceService', () => {
  class PresenceServiceMock {
    private connection: { projectId: string; userId: string; displayName?: string } | null = null;

    async connect(input: { projectId: string; userId: string; displayName?: string }, onMembersChanged?: (members: unknown[]) => void): Promise<void> {
      this.connection = input;
      onMembersChanged?.([]);
    }

    async update(patch: { state: 'online' | 'idle' | 'offline' }): Promise<void> {
      if (!this.connection) return;
      await mockPresenceUpdate(patch);
    }

    async disconnect(): Promise<void> {
      this.connection = null;
      await mockPresenceDisconnect();
    }

    toPersistedRecord(patch: { state: 'online' | 'idle' | 'offline'; focusedEntityType?: string; focusedEntityId?: string }) {
      if (!this.connection) return null;
      return {
        projectId: this.connection.projectId,
        userId: this.connection.userId,
        ...(this.connection.displayName ? { displayName: this.connection.displayName } : {}),
        state: patch.state,
        ...(patch.focusedEntityType ? { focusedEntityType: patch.focusedEntityType } : {}),
        ...(patch.focusedEntityId ? { focusedEntityId: patch.focusedEntityId } : {}),
        lastSeenAt: '2026-04-17T00:00:00.000Z',
      };
    }
  }

  return {
    CollaborationPresenceService: PresenceServiceMock,
  };
});

function buildParams(): UseTranscriptionCloudSyncActionsParams {
  const rawAction = vi.fn(async () => undefined);
  const wrappedCreateLayer = vi.fn(async () => false);

  return {
    phase: 'ready',
    units: [{ id: 'u-1', textId: 'project-1' }],
    layers: [],
    unitsRef: { current: [] },
    layersRef: { current: [] },
    layerLinksRef: { current: [] },
    rawActions: {
      saveUnitText: rawAction,
      saveUnitSelfCertainty: rawAction,
      saveUnitTiming: rawAction,
      deleteUnit: rawAction,
      deleteSelectedUnits: rawAction,
      deleteLayer: rawAction,
      toggleLayerLink: rawAction,
    },
    wrappedActions: {
      saveUnitText: rawAction,
      saveUnitSelfCertainty: rawAction,
      saveUnitTiming: rawAction,
      saveUnitLayerText: rawAction,
      createUnitFromSelection: rawAction,
      deleteUnit: rawAction,
      deleteSelectedUnits: rawAction,
      createLayer: wrappedCreateLayer,
      deleteLayer: rawAction,
      toggleLayerLink: rawAction,
    },
    runWithDbMutex: async (fn) => fn(),
    loadSnapshot: async () => undefined,
    presenceDisplayName: 'Tester',
  };
}

describe('useTranscriptionCloudSyncActions presence visibility sync', () => {
  beforeEach(() => {
    mockUpsert.mockClear();
    mockFrom.mockClear();
    mockGetSupabaseUserId.mockClear();
    mockHasSupabaseBrowserClientConfig.mockReturnValue(true);
    mockPresenceUpdate.mockClear();
    mockPresenceDisconnect.mockClear();
  });

  it('switches to idle when page becomes hidden and returns online when visible', async () => {
    let visibilityState: DocumentVisibilityState = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibilityState,
    });

    const { unmount } = renderHook(() => useTranscriptionCloudSyncActions(buildParams()));

    await waitFor(() => {
      expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({
        project_id: 'project-1',
        user_id: 'user-1',
        state: 'online',
      }), { onConflict: 'project_id,user_id' });
    });

    const upsertCountAfterOnline = mockUpsert.mock.calls.length;

    visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => {
      expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ state: 'idle' }), { onConflict: 'project_id,user_id' });
    });

    const upsertCountAfterIdle = mockUpsert.mock.calls.length;

    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    await Promise.resolve();

    expect(mockUpsert.mock.calls.length).toBe(upsertCountAfterIdle);

    visibilityState = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => {
      expect(mockUpsert.mock.calls.length).toBeGreaterThan(upsertCountAfterIdle);
      expect(mockUpsert).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'online' }), { onConflict: 'project_id,user_id' });
    });

    expect(mockUpsert.mock.calls.length).toBeGreaterThan(upsertCountAfterOnline);

    unmount();
  });
});
