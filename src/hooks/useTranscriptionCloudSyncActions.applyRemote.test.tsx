// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollaborationProjectChangeRecord } from '../collaboration/cloud/syncTypes';
import { useTranscriptionCloudSyncActions, type UseTranscriptionCloudSyncActionsParams } from './useTranscriptionCloudSyncActions';

const {
  bridgeState,
  mockHasSupabaseBrowserClientConfig,
  mockGetSupabaseUserId,
  mockWrappedSaveUnitText,
  mockWrappedSaveUnitLayerFields,
  mockWrappedToggleLayerLink,
  mockRawSaveUnitText,
  mockRawSaveUnitLayerFields,
  mockRawToggleLayerLink,
  mockEnqueueMutation,
} = vi.hoisted(() => {
  const bridgeState: {
    onApplyRemoteChange: ((change: CollaborationProjectChangeRecord) => Promise<void>) | null;
  } = {
    onApplyRemoteChange: null,
  };

  const mockHasSupabaseBrowserClientConfig = vi.fn<() => boolean>().mockReturnValue(false);
  const mockGetSupabaseUserId = vi.fn<() => Promise<string | null>>().mockResolvedValue('user-1');

  const mockWrappedSaveUnitText = vi.fn(async () => undefined);
  const mockWrappedSaveUnitLayerFields = vi.fn(async () => undefined);
  const mockWrappedToggleLayerLink = vi.fn(async () => undefined);
  const mockRawSaveUnitText = vi.fn(async () => undefined);
  const mockRawSaveUnitLayerFields = vi.fn(async () => undefined);
  const mockRawToggleLayerLink = vi.fn(async () => undefined);
  const mockEnqueueMutation = vi.fn();

  return {
    bridgeState,
    mockHasSupabaseBrowserClientConfig,
    mockGetSupabaseUserId,
    mockWrappedSaveUnitText,
    mockWrappedSaveUnitLayerFields,
    mockWrappedToggleLayerLink,
    mockRawSaveUnitText,
    mockRawSaveUnitLayerFields,
    mockRawToggleLayerLink,
    mockEnqueueMutation,
  };
});

vi.mock('./useTranscriptionCollaborationBridge', () => ({
  useTranscriptionCollaborationBridge: (params: {
    onApplyRemoteChange?: (change: CollaborationProjectChangeRecord) => Promise<void>;
  }) => {
    bridgeState.onApplyRemoteChange = params.onApplyRemoteChange ?? null;
    return {
      isBridgeReady: true,
      collaborationProtocolGuard: {
        cloudWritesDisabled: false,
        reasons: [],
        outboundProtocolVersion: 1,
      },
      collaborationOutboundPendingCount: 0,
      enqueueMutation: mockEnqueueMutation,
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
  },
}));

vi.mock('../collaboration/cloud/collaborationSupabaseFacade', () => ({
  getSupabaseBrowserClient: () => ({ from: vi.fn() }),
  hasSupabaseBrowserClientConfig: mockHasSupabaseBrowserClientConfig,
  getSupabaseUserId: mockGetSupabaseUserId,
}));

function buildParams(overrides?: Partial<UseTranscriptionCloudSyncActionsParams>): UseTranscriptionCloudSyncActionsParams {
  const noop = vi.fn(async () => undefined);
  const base: UseTranscriptionCloudSyncActionsParams = {
    phase: 'ready',
    units: [{ id: 'u-1', textId: 'project-1' }],
    layers: [{ id: 'trc-1', key: 'trc_1', layerType: 'transcription', textId: 'project-1' }],
    unitsRef: { current: [{ id: 'u-1', text: 'local text' } as unknown as { id: string }] },
    layersRef: { current: [{ id: 'trc-1', key: 'trc_1', layerType: 'transcription' }] },
    layerLinksRef: { current: [] },
    rawActions: {
      saveUnitText: mockRawSaveUnitText,
      saveUnitSelfCertainty: noop,
      saveUnitLayerFields: mockRawSaveUnitLayerFields,
      saveUnitTiming: noop,
      deleteUnit: noop,
      deleteSelectedUnits: noop,
      deleteLayer: noop,
      toggleLayerLink: mockRawToggleLayerLink,
    },
    wrappedActions: {
      saveUnitText: mockWrappedSaveUnitText,
      saveUnitSelfCertainty: noop,
      saveUnitLayerFields: mockWrappedSaveUnitLayerFields,
      saveUnitTiming: noop,
      saveUnitLayerText: noop,
      createUnitFromSelection: noop,
      deleteUnit: noop,
      deleteSelectedUnits: noop,
      createLayer: vi.fn(async () => false),
      deleteLayer: noop,
      toggleLayerLink: mockWrappedToggleLayerLink,
    },
    runWithDbMutex: async (fn) => fn(),
    loadSnapshot: async () => undefined,
  };
  return {
    ...base,
    ...(overrides ?? {}),
  };
}

function createRemoteContentChange(
  value: string,
  createdAt = new Date().toISOString(),
): CollaborationProjectChangeRecord {
  return {
    id: `change-${value}`,
    projectId: 'project-1',
    actorId: 'remote-user',
    clientId: 'remote-client',
    clientOpId: `op-${value}`,
    protocolVersion: 1,
    projectRevision: 12,
    baseRevision: 11,
    entityType: 'layer_unit_content',
    entityId: 'u-1',
    opType: 'upsert_unit_content',
    payload: {
      unitId: 'u-1',
      value,
    },
    sourceKind: 'user',
    createdAt,
  };
}

function createRemoteRelationChange(payload: Record<string, unknown>): CollaborationProjectChangeRecord {
  return {
    id: `change-relation-${Math.random().toString(36).slice(2, 8)}`,
    projectId: 'project-1',
    actorId: 'remote-user',
    clientId: 'remote-client',
    clientOpId: `op-relation-${Math.random().toString(36).slice(2, 8)}`,
    protocolVersion: 1,
    projectRevision: 21,
    baseRevision: 20,
    entityType: 'unit_relation',
    entityId: 'trc-1:trl-1',
    opType: 'upsert_relation',
    payload,
    sourceKind: 'user',
    createdAt: new Date().toISOString(),
  };
}

async function triggerRemote(change: CollaborationProjectChangeRecord): Promise<void> {
  if (!bridgeState.onApplyRemoteChange) {
    throw new Error('missing onApplyRemoteChange callback');
  }
  await bridgeState.onApplyRemoteChange(change);
}

describe('useTranscriptionCloudSyncActions applyRemote + conflict audit chain', () => {
  beforeEach(() => {
    bridgeState.onApplyRemoteChange = null;
    mockHasSupabaseBrowserClientConfig.mockReturnValue(false);
    mockGetSupabaseUserId.mockClear();
    mockWrappedSaveUnitText.mockClear();
    mockWrappedSaveUnitLayerFields.mockClear();
    mockWrappedToggleLayerLink.mockClear();
    mockRawSaveUnitText.mockClear();
    mockRawSaveUnitLayerFields.mockClear();
    mockRawToggleLayerLink.mockClear();
    mockEnqueueMutation.mockClear();
  });

  it('applies remote relation using hostTranscriptionLayerId payload without key', async () => {
    const { result } = renderHook(() => useTranscriptionCloudSyncActions(buildParams()));
    expect(result.current).toBeTruthy();

    await act(async () => {
      await triggerRemote(createRemoteRelationChange({
        hostTranscriptionLayerId: 'trc-1',
        layerId: 'trl-1',
        enabled: true,
      }));
    });

    await waitFor(() => {
      expect(mockRawToggleLayerLink).toHaveBeenCalledWith('trc_1', 'trl-1');
    });
  });

  it('emits host-id-first relation payload when toggling layer link locally', async () => {
    const { result } = renderHook(() => useTranscriptionCloudSyncActions(buildParams()));

    await act(async () => {
      await result.current.toggleLayerLink('trc_1', 'trl-1');
    });

    expect(mockWrappedToggleLayerLink).toHaveBeenCalledWith('trc_1', 'trl-1');
    expect(mockEnqueueMutation).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'unit_relation',
      entityId: 'trc-1:trl-1',
      opType: 'upsert_relation',
      payload: expect.objectContaining({
        transcriptionLayerKey: 'trc_1',
        hostTranscriptionLayerId: 'trc-1',
        layerId: 'trl-1',
      }),
    }));
  });

  it('enqueues explicit layer-fields batch patches for per-layer writes', async () => {
    const { result } = renderHook(() => useTranscriptionCloudSyncActions(buildParams()));

    await act(async () => {
      await result.current.saveUnitLayerFields(['seg-1'], { status: 'verified' });
    });

    expect(mockWrappedSaveUnitLayerFields).toHaveBeenCalledWith(['seg-1'], { status: 'verified' });
    expect(mockEnqueueMutation).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'layer_unit',
      entityId: 'seg-1',
      opType: 'batch_patch',
      payload: expect.objectContaining({
        action: 'layer-fields',
        unitIds: ['seg-1'],
        patch: { status: 'verified' },
      }),
    }));
  });

  it('records resolutionTraceId on conflict_resolved logs after auto LWW merge', async () => {
    const { result } = renderHook(() => useTranscriptionCloudSyncActions(buildParams()));

    await act(async () => {
      await result.current.saveUnitText('u-1', 'local text');
    });

    await act(async () => {
      await triggerRemote(createRemoteContentChange('remote text', new Date(Date.now() - 10_000).toISOString()));
    });

    await waitFor(() => {
      const resolved = result.current.conflictOperationLogs.filter((item) => item.type === 'conflict_resolved');
      expect(resolved.length).toBeGreaterThan(0);
      expect(resolved[0]?.traceId).toMatch(/^tr-/);
    });
  });

  it('records traceId on manual-review apply-remote recovery path', async () => {
    const { result } = renderHook(() => useTranscriptionCloudSyncActions(buildParams()));

    await act(async () => {
      await result.current.saveUnitText('u-1', 'local-a');
    });

    await act(async () => {
      await triggerRemote(createRemoteContentChange('remote-a'));
    });

    await waitFor(() => {
      expect(result.current.conflictReviewTickets).toHaveLength(1);
    });

    const ticketId = result.current.conflictReviewTickets[0]!.ticketId;

    await act(async () => {
      await result.current.applyRemoteConflictTicket(ticketId);
    });

    await waitFor(() => {
      const withApply = result.current.conflictOperationLogs.filter(
        (item) => item.type === 'conflict_resolved' && item.decisionId?.includes(':apply-remote'),
      );
      expect(withApply.length).toBeGreaterThan(0);
      expect(withApply[withApply.length - 1]?.traceId).toMatch(/^tr-/);
    });
  });
});
