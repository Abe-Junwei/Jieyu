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
  mockRawSaveUnitText,
  mockEnqueueMutation,
  mockGetDb,
} = vi.hoisted(() => {
  const bridgeState: {
    onApplyRemoteChange: ((change: CollaborationProjectChangeRecord) => Promise<void>) | null;
  } = {
    onApplyRemoteChange: null,
  };

  const mockHasSupabaseBrowserClientConfig = vi.fn<() => boolean>().mockReturnValue(false);
  const mockGetSupabaseUserId = vi.fn<() => Promise<string | null>>().mockResolvedValue('user-1');

  const mockWrappedSaveUnitText = vi.fn(async () => undefined);
  const mockRawSaveUnitText = vi.fn(async () => undefined);
  const mockEnqueueMutation = vi.fn();
  const mockAuditLogRows: Array<Record<string, unknown>> = [];
  const mockGetDb = vi.fn(async () => ({
    dexie: {
      audit_logs: {
        clear: vi.fn(async () => {
          mockAuditLogRows.length = 0;
        }),
        toArray: vi.fn(async () => [...mockAuditLogRows]),
        bulkPut: vi.fn(async (rows: Array<Record<string, unknown>>) => {
          mockAuditLogRows.push(...rows);
        }),
        put: vi.fn(async (row: Record<string, unknown>) => {
          mockAuditLogRows.push(row);
        }),
      },
    },
    collections: {
      audit_logs: {
        insert: vi.fn(async (row: Record<string, unknown>) => {
          mockAuditLogRows.push(row);
        }),
      },
    },
  }));

  return {
    bridgeState,
    mockHasSupabaseBrowserClientConfig,
    mockGetSupabaseUserId,
    mockWrappedSaveUnitText,
    mockRawSaveUnitText,
    mockEnqueueMutation,
    mockAuditLogRows,
    mockGetDb,
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

vi.mock('../db', () => ({
  getDb: mockGetDb,
}));

function buildParams(): UseTranscriptionCloudSyncActionsParams {
  const noop = vi.fn(async () => undefined);
  return {
    phase: 'ready',
    units: [{ id: 'u-1', textId: 'project-1' }],
    layers: [],
    unitsRef: { current: [{ id: 'u-1', text: 'local text' } as unknown as { id: string }] },
    layersRef: { current: [] },
    layerLinksRef: { current: [] },
    rawActions: {
      saveUnitText: mockRawSaveUnitText,
      saveUnitSelfCertainty: noop,
      saveUnitLayerFields: noop,
      saveUnitTiming: noop,
      deleteUnit: noop,
      deleteSelectedUnits: noop,
      deleteLayer: noop,
      toggleLayerLink: noop,
    },
    wrappedActions: {
      saveUnitText: mockWrappedSaveUnitText,
      saveUnitSelfCertainty: noop,
      saveUnitLayerFields: noop,
      saveUnitTiming: noop,
      saveUnitLayerText: noop,
      createUnitFromSelection: noop,
      deleteUnit: noop,
      deleteSelectedUnits: noop,
      createLayer: vi.fn(async () => false),
      deleteLayer: noop,
      toggleLayerLink: noop,
    },
    runWithDbMutex: async (fn) => fn(),
    loadSnapshot: async () => undefined,
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

async function triggerRemote(change: CollaborationProjectChangeRecord): Promise<void> {
  if (!bridgeState.onApplyRemoteChange) {
    throw new Error('missing onApplyRemoteChange callback');
  }
  await bridgeState.onApplyRemoteChange(change);
}

async function clearAuditLogs(): Promise<void> {
  const db = await mockGetDb();
  await db.dexie.audit_logs.clear();
}

describe('useTranscriptionCloudSyncActions conflict governance', () => {
  beforeEach(async () => {
    bridgeState.onApplyRemoteChange = null;
    mockHasSupabaseBrowserClientConfig.mockReturnValue(false);
    mockGetSupabaseUserId.mockClear();
    mockWrappedSaveUnitText.mockClear();
    mockRawSaveUnitText.mockClear();
    mockEnqueueMutation.mockClear();
    await clearAuditLogs();
  });

  it('auto-resolves low risk conflicts and applies remote mutation', async () => {
    const { result } = renderHook(() => useTranscriptionCloudSyncActions(buildParams()));

    await act(async () => {
      await result.current.saveUnitText('u-1', 'local text');
    });

    await act(async () => {
      await triggerRemote(createRemoteContentChange('remote text', new Date(Date.now() - 10_000).toISOString()));
    });

    await waitFor(() => {
      expect(mockRawSaveUnitText).toHaveBeenCalledWith('u-1', 'remote text', undefined);
      expect(result.current.conflictReviewTickets).toHaveLength(0);
      expect(result.current.conflictOperationLogs.some((item) => item.type === 'conflict_resolved')).toBe(true);
    });
  });

  it('routes high risk conflicts to manual review and allows apply remote recovery', async () => {
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

    expect(mockRawSaveUnitText).toHaveBeenCalledTimes(0);

    const ticketId = result.current.conflictReviewTickets[0]!.ticketId;

    await act(async () => {
      const applied = await result.current.applyRemoteConflictTicket(ticketId);
      expect(applied).toBe(true);
    });

    await waitFor(() => {
      expect(mockRawSaveUnitText).toHaveBeenCalledWith('u-1', 'remote-a', undefined);
      expect(result.current.conflictReviewTickets).toHaveLength(0);
    });
  });

  it('persists conflict governance logs into audit storage', async () => {
    const { result } = renderHook(() => useTranscriptionCloudSyncActions(buildParams()));

    await act(async () => {
      await result.current.saveUnitText('u-1', 'local-persist');
    });

    await act(async () => {
      await triggerRemote(createRemoteContentChange('remote-persist', new Date(Date.now() - 10_000).toISOString()));
    });

    await waitFor(async () => {
      const db = await mockGetDb();
      const auditRows = (await db.dexie.audit_logs.toArray()).filter(
        (row) => row.collection === 'collaboration_conflicts' && row.field === 'operation_log',
      );

      expect(auditRows.some((row) => String(row.requestId ?? '').includes('log_'))).toBe(true);
      expect(auditRows.some((row) => row.newValue === 'conflict_resolved')).toBe(true);
    });
  });

  it('allows keeping local state and closing manual review ticket', async () => {
    const { result } = renderHook(() => useTranscriptionCloudSyncActions(buildParams()));

    await act(async () => {
      await result.current.saveUnitText('u-1', 'local-b');
    });

    await act(async () => {
      await triggerRemote(createRemoteContentChange('remote-b'));
    });

    await waitFor(() => {
      expect(result.current.conflictReviewTickets).toHaveLength(1);
    });

    const ticketId = result.current.conflictReviewTickets[0]!.ticketId;

    await act(async () => {
      const kept = result.current.keepLocalConflictTicket(ticketId);
      expect(kept).toBe(true);
    });

    await waitFor(() => {
      expect(result.current.conflictReviewTickets).toHaveLength(0);
      expect(mockRawSaveUnitText).toHaveBeenCalledTimes(0);
      expect(result.current.conflictOperationLogs.some((item) => item.decisionId?.includes(':keep-local'))).toBe(true);
    });
  });

  it('completes manual-review recovery flow from inbound conflict to later apply-remote', async () => {
    const { result } = renderHook(() => useTranscriptionCloudSyncActions(buildParams()));

    await act(async () => {
      await result.current.saveUnitText('u-1', 'local-phase-1');
    });

    await act(async () => {
      await triggerRemote(createRemoteContentChange('remote-phase-1'));
    });

    await waitFor(() => {
      expect(result.current.conflictReviewTickets).toHaveLength(1);
    });

    const firstTicketId = result.current.conflictReviewTickets[0]!.ticketId;

    await act(async () => {
      result.current.postponeConflictTicket(firstTicketId);
    });

    await waitFor(() => {
      expect(result.current.conflictReviewTickets).toHaveLength(1);
      expect(result.current.conflictReviewTickets[0]!.ticketId).toBe(firstTicketId);
    });

    await act(async () => {
      const kept = result.current.keepLocalConflictTicket(firstTicketId);
      expect(kept).toBe(true);
    });

    await waitFor(() => {
      expect(result.current.conflictReviewTickets).toHaveLength(0);
      expect(mockRawSaveUnitText).toHaveBeenCalledTimes(0);
      expect(result.current.conflictOperationLogs.some((item) => item.decisionId?.includes(':keep-local'))).toBe(true);
    });

    await act(async () => {
      await result.current.saveUnitText('u-1', 'local-phase-2');
    });

    await act(async () => {
      await triggerRemote(createRemoteContentChange('remote-phase-2'));
    });

    await waitFor(() => {
      expect(result.current.conflictReviewTickets).toHaveLength(1);
    });

    const secondTicketId = result.current.conflictReviewTickets[0]!.ticketId;

    await act(async () => {
      const applied = await result.current.applyRemoteConflictTicket(secondTicketId);
      expect(applied).toBe(true);
    });

    await waitFor(() => {
      expect(mockRawSaveUnitText).toHaveBeenCalledWith('u-1', 'remote-phase-2', undefined);
      expect(result.current.conflictReviewTickets).toHaveLength(0);
      expect(result.current.conflictOperationLogs.some((item) => item.decisionId?.includes(':apply-remote'))).toBe(true);
    });
  });
});
