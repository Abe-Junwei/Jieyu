// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useTranscriptionCloudSyncActions,
  type UseTranscriptionCloudSyncActionsParams,
} from './useTranscriptionCloudSyncActions';

const {
  mockFetchAccessibleCloudProjects,
  mockFetchCloudProjectMembers,
  mockBridge,
  mockCollaborationCloudEnabled,
  mockHasSupabaseBrowserClientConfig,
} = vi.hoisted(() => ({
  mockFetchAccessibleCloudProjects: vi
    .fn<() => Promise<Array<{ id: string }>>>()
    .mockResolvedValue([{ id: 'cloud-1' }]),
  mockFetchCloudProjectMembers: vi
    .fn<(projectId: string) => Promise<Array<{ userId: string }>>>()
    .mockResolvedValue([{ userId: 'user-1' }]),
  mockBridge: {
    isBridgeReady: false,
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
  },
  mockCollaborationCloudEnabled: vi.fn<() => boolean>().mockReturnValue(true),
  mockHasSupabaseBrowserClientConfig: vi.fn<() => boolean>().mockReturnValue(true),
}));

vi.mock('../../ai/config/featureFlags', () => ({
  featureFlags: {
    get collaborationCloudEnabled() {
      return mockCollaborationCloudEnabled();
    },
  },
}));

vi.mock('./useTranscriptionCollaborationBridge', () => ({
  useTranscriptionCollaborationBridge: (input: { enabled: boolean }) => ({
    ...mockBridge,
    isBridgeReady: input.enabled,
  }),
}));

vi.mock('../../collaboration/cloud/CollaborationDirectoryService', () => ({
  listAccessibleCloudProjects: mockFetchAccessibleCloudProjects,
  listCloudProjectMembers: mockFetchCloudProjectMembers,
}));

vi.mock('../../collaboration/cloud/collaborationSupabaseFacade', () => ({
  hasSupabaseBrowserClientConfig: mockHasSupabaseBrowserClientConfig,
}));

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
      saveUnitLayerFields: rawAction,
      saveUnitTiming: rawAction,
      deleteUnit: rawAction,
      deleteSelectedUnits: rawAction,
      deleteLayer: rawAction,
      toggleLayerLink: rawAction,
    },
    wrappedActions: {
      saveUnitText: rawAction,
      saveUnitSelfCertainty: rawAction,
      saveUnitLayerFields: rawAction,
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
    loadSnapshot: vi.fn(async () => undefined),
  };
}

describe('useTranscriptionCloudSyncActions collaborationCloudEnabled', () => {
  beforeEach(() => {
    mockCollaborationCloudEnabled.mockReturnValue(true);
    mockHasSupabaseBrowserClientConfig.mockReturnValue(true);
    mockFetchAccessibleCloudProjects.mockClear();
    mockFetchCloudProjectMembers.mockClear();
  });

  it('does not call directory APIs when collaborationCloudEnabled is false', async () => {
    mockCollaborationCloudEnabled.mockReturnValue(false);

    const { result } = renderHook(() => useTranscriptionCloudSyncActions(buildParams()));

    await expect(result.current.listAccessibleCloudProjects()).resolves.toEqual([]);
    await expect(result.current.listCloudProjectMembers('project-1')).resolves.toEqual([]);
    expect(mockFetchAccessibleCloudProjects).not.toHaveBeenCalled();
    expect(mockFetchCloudProjectMembers).not.toHaveBeenCalled();
  });

  it('reports idle sync badge when collaboration cloud is disabled', async () => {
    mockCollaborationCloudEnabled.mockReturnValue(false);
    mockHasSupabaseBrowserClientConfig.mockReturnValue(true);

    const { result } = renderHook(() => useTranscriptionCloudSyncActions(buildParams()));

    await waitFor(() => {
      expect(result.current.collaborationSyncBadge.kind).toBe('idle');
    });
  });

  it('calls directory APIs when collaboration cloud is enabled', async () => {
    const { result } = renderHook(() => useTranscriptionCloudSyncActions(buildParams()));

    await expect(result.current.listAccessibleCloudProjects()).resolves.toEqual([
      { id: 'cloud-1' },
    ]);
    expect(mockFetchAccessibleCloudProjects).toHaveBeenCalledTimes(1);
  });
});
