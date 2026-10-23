// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  BridgeMock,
  bridgeStart,
  bridgeStop,
  bridgeEnqueue,
  bridgeListAssets,
  bridgeRegisterAsset,
  bridgeCreateSnapshot,
  bridgeRestoreSnapshot,
  bridgeQueryTimeline,
  lastBridgeOptions,
  bridgeCtorCalls,
  hasConfig,
  getUserId,
  supabaseFrom,
  supabaseInsert,
  projectGuardRow,
  projectSelectMaybeSingle,
} = vi.hoisted(() => {
  const bridgeStart = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const bridgeStop = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const bridgeEnqueue = vi.fn<(record: unknown) => void>();
  const bridgeListAssets = vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]);
  const bridgeRegisterAsset = vi.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'asset-1' });
  const bridgeCreateSnapshot = vi.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'snap-1' });
  const bridgeRestoreSnapshot = vi.fn<() => Promise<unknown>>().mockResolvedValue({
    record: { id: 'snap-1' },
    payloadJson: '{"ok":true}',
  });
  const bridgeQueryTimeline = vi.fn<() => Promise<unknown>>().mockResolvedValue({
    changes: [],
    total: 0,
  });
  const lastBridgeOptions: { current: unknown } = { current: null };
  const bridgeCtorCalls: unknown[] = [];

  class BridgeMock {
    constructor(options: unknown) {
      bridgeCtorCalls.push(options);
      lastBridgeOptions.current = options;
    }

    start = bridgeStart;
    stop = bridgeStop;
    enqueueLocalChange = bridgeEnqueue;
    listProjectAssets = bridgeListAssets;
    registerProjectAsset = bridgeRegisterAsset;
    createProjectSnapshot = bridgeCreateSnapshot;
    restoreProjectSnapshotById = bridgeRestoreSnapshot;
    queryProjectChangeTimeline = bridgeQueryTimeline;
  }

  const hasConfig = vi.fn<() => boolean>().mockReturnValue(true);
  const getUserId = vi.fn<() => Promise<string | null>>().mockResolvedValue('user-1');
  const supabaseInsert = vi
    .fn<(rows: unknown[]) => Promise<{ error: null }>>()
    .mockResolvedValue({ error: null });
  const projectGuardRow: {
    current: { protocol_version: number; app_min_version: string; deleted_at?: string | null };
  } = { current: { protocol_version: 1, app_min_version: '0.1.0' } };
  const projectSelectMaybeSingle = vi.fn().mockImplementation(async () => ({
    data: projectGuardRow.current,
    error: null,
  }));
  const projectSelectEq = vi.fn(() => ({ maybeSingle: projectSelectMaybeSingle }));
  const projectSelect = vi.fn(() => ({ eq: projectSelectEq }));
  const supabaseFrom = vi.fn((table: string) => {
    if (table === 'projects') {
      return { select: projectSelect };
    }
    return { insert: supabaseInsert };
  });

  return {
    BridgeMock,
    bridgeStart,
    bridgeStop,
    bridgeEnqueue,
    bridgeListAssets,
    bridgeRegisterAsset,
    bridgeCreateSnapshot,
    bridgeRestoreSnapshot,
    bridgeQueryTimeline,
    lastBridgeOptions,
    bridgeCtorCalls,
    hasConfig,
    getUserId,
    supabaseFrom,
    supabaseInsert,
    projectGuardRow,
    projectSelectMaybeSingle,
  };
});

const { applyTombstone } = vi.hoisted(() => ({
  applyTombstone: vi
    .fn<(projectId: string, input?: { deletedAt?: string | null }) => Promise<unknown>>()
    .mockResolvedValue({ projectId: 'project-1', cancelledOutboundCount: 0 }),
}));

const { multiDocument } = vi.hoisted(() => ({ multiDocument: { current: false } }));

vi.mock('../../services/annotationDocumentCollaborationGate', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../services/annotationDocumentCollaborationGate')>();
  return {
    ...actual,
    isMultiDocumentProject: () => multiDocument.current,
    refreshMultiDocumentGate: async () => multiDocument.current,
    assertCollaborationAllowed: (textId: string) => {
      if (multiDocument.current)
        throw new actual.AnnotationDocumentCollaborationBlockedError(textId);
    },
  };
});

vi.mock('../../services/projectCloudTombstone', () => ({
  applyCloudProjectTombstone: applyTombstone,
}));

vi.mock('../../collaboration/cloud/CollaborationSyncBridge', () => ({
  CollaborationSyncBridge: BridgeMock,
}));

vi.mock('../../collaboration/cloud/collaborationSupabaseFacade', () => ({
  hasSupabaseBrowserClientConfig: hasConfig,
  getSupabaseBrowserClient: () => ({ from: supabaseFrom, rpc: supabaseInsert }),
  getSupabaseUserId: getUserId,
}));

import { useTranscriptionCollaborationBridge } from './useTranscriptionCollaborationBridge';
import {
  flushCollabClientStateWritesForTests,
  loadProjectLastSeenRevision,
  loadUnverifiedCollabMutations,
  resetCollabClientStateVolatileOverlayForTests,
} from '../../collaboration/cloud/CollaborationClientStateStore';
import { resetCollaborationClientStateIdbForTests } from '../../collaboration/cloud/CollaborationClientStateStore.idb';
import type { CollaborationProjectChangeRecord } from '../../collaboration/cloud/syncTypes';
import {
  broadcastCollaborationLifecycle,
  resetCollaborationLifecycleBroadcastForTests,
  subscribeCollaborationLifecycle,
} from '../../collaboration/cloud/collaborationLifecycleBroadcast';
import { markProjectRemovedLocally } from '../../collaboration/cloud/collaborationLocalProjectRegistry';

describe('useTranscriptionCollaborationBridge', () => {
  beforeEach(async () => {
    bridgeStart.mockClear();
    bridgeStop.mockClear();
    bridgeEnqueue.mockClear();
    bridgeListAssets.mockClear();
    bridgeRegisterAsset.mockClear();
    bridgeCreateSnapshot.mockClear();
    bridgeRestoreSnapshot.mockClear();
    bridgeQueryTimeline.mockClear();
    supabaseFrom.mockClear();
    supabaseInsert.mockClear();
    projectSelectMaybeSingle.mockClear();
    projectGuardRow.current = { protocol_version: 1, app_min_version: '0.1.0' };
    hasConfig.mockReturnValue(true);
    getUserId.mockResolvedValue('user-1');
    lastBridgeOptions.current = null;
    bridgeCtorCalls.length = 0;
    await flushCollabClientStateWritesForTests();
    window.localStorage.clear();
    resetCollabClientStateVolatileOverlayForTests(window.localStorage);
    await resetCollaborationClientStateIdbForTests();
    applyTombstone.mockClear();
    resetCollaborationLifecycleBroadcastForTests();
    multiDocument.current = false;
  });

  it('第 5 批反向门：多份文稿的项目不启动桥接 | batch 5: no bridge for a project with several documents', async () => {
    multiDocument.current = true;
    renderHook(() =>
      useTranscriptionCollaborationBridge({ enabled: true, projectId: 'project-1' }),
    );
    await waitFor(() => expect(getUserId).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(bridgeCtorCalls).toHaveLength(0);
    expect(bridgeStart).not.toHaveBeenCalled();
  });

  it('第 5 批反向门：运行中有了第二份文稿就不再上传 | batch 5: no upload once a second document exists', async () => {
    const { result } = renderHook(() =>
      useTranscriptionCollaborationBridge({ enabled: true, projectId: 'project-1' }),
    );
    await waitFor(() => expect(bridgeStart).toHaveBeenCalledTimes(1));
    multiDocument.current = true;
    act(() => {
      void result.current.enqueueMutation({
        entityType: 'layer_unit_content',
        entityId: 'unit-1:layer-1',
        opType: 'upsert_unit_content',
        payload: { unitId: 'unit-1', layerId: 'layer-1', value: 'hello' },
      });
    });
    expect(bridgeEnqueue).not.toHaveBeenCalled();
    await expect(
      result.current.createProjectSnapshot({
        version: 1,
        payloadJson: '{}',
        schemaVersion: 1,
        createdBy: 'user-1',
        changeCursor: 0,
      }),
    ).rejects.toThrow(/several annotation documents/);
    expect(bridgeCreateSnapshot).not.toHaveBeenCalled();
  });

  it('启动后创建桥接，停用时停止桥接 | starts bridge when enabled and stops when disabled', async () => {
    const { rerender } = renderHook(
      (props: { enabled: boolean; projectId: string }) =>
        useTranscriptionCollaborationBridge(props),
      {
        initialProps: { enabled: true, projectId: 'project-1' },
      },
    );

    await waitFor(() => {
      expect(bridgeCtorCalls).toHaveLength(1);
      expect(bridgeStart).toHaveBeenCalledTimes(1);
    });

    rerender({ enabled: false, projectId: 'project-1' });

    await waitFor(() => {
      expect(bridgeStop).toHaveBeenCalledTimes(1);
    });
  });

  it('无配置时降级，不启动桥接 | degrades without config and does not start bridge', async () => {
    hasConfig.mockReturnValue(false);

    const { result } = renderHook(() =>
      useTranscriptionCollaborationBridge({
        enabled: true,
        projectId: 'project-1',
      }),
    );

    await waitFor(() => {
      expect(bridgeCtorCalls).toHaveLength(0);
      expect(bridgeStart).not.toHaveBeenCalled();
    });

    await expect(result.current.listProjectAssets()).resolves.toEqual([]);
    await expect(result.current.listProjectSnapshots()).resolves.toEqual([]);
    await expect(result.current.queryProjectChangeTimeline()).resolves.toEqual({
      changes: [],
      total: 0,
    });
  });

  it('未登录时降级，不启动桥接 | degrades without authenticated user and does not start bridge', async () => {
    getUserId.mockResolvedValueOnce(null);

    renderHook(() =>
      useTranscriptionCollaborationBridge({
        enabled: true,
        projectId: 'project-1',
      }),
    );

    await waitFor(() => {
      expect(bridgeCtorCalls).toHaveLength(0);
      expect(bridgeStart).not.toHaveBeenCalled();
    });
  });

  it('桥接还没就绪时留下可恢复记录 | keeps a recovery record when the bridge is not ready', async () => {
    const { result } = renderHook(() =>
      useTranscriptionCollaborationBridge({
        enabled: true,
        projectId: 'project-1',
      }),
    );

    act(() => {
      void result.current.enqueueMutation({
        entityType: 'layer_unit_content',
        entityId: 'unit-1:layer-1',
        opType: 'upsert_unit_content',
      });
    });

    expect(bridgeEnqueue).not.toHaveBeenCalled();
    expect(loadUnverifiedCollabMutations('project-1')).toEqual([
      expect.objectContaining({ entityId: 'unit-1:layer-1' }),
    ]);

    await waitFor(() => {
      expect(bridgeEnqueue).toHaveBeenCalledTimes(1);
    });
    expect(loadUnverifiedCollabMutations('project-1')).toEqual([]);
  });

  it('enqueueMutation 生成并投递变更记录 | enqueueMutation builds and enqueues change records', async () => {
    const { result } = renderHook(() =>
      useTranscriptionCollaborationBridge({
        enabled: true,
        projectId: 'project-1',
      }),
    );

    await waitFor(() => {
      expect(bridgeStart).toHaveBeenCalledTimes(1);
    });

    act(() => {
      void result.current.enqueueMutation({
        entityType: 'layer_unit_content',
        entityId: 'unit-1:layer-1',
        opType: 'upsert_unit_content',
        payload: {
          unitId: 'unit-1',
          layerId: 'layer-1',
          value: 'hello',
        },
      });
    });

    expect(bridgeEnqueue).toHaveBeenCalledTimes(1);
    const record = bridgeEnqueue.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(record.projectId).toBe('project-1');
    expect(record.entityType).toBe('layer_unit_content');
    expect(record.entityId).toBe('unit-1:layer-1');
    expect(record.opType).toBe('upsert_unit_content');
    expect(record.sourceKind).toBe('user');
    expect(typeof record.clientOpId).toBe('string');
    expect((record.clientOpId as string).length).toBeGreaterThan(0);
  });

  it('暴露 Phase6 运行时方法并委托到桥接实例 | exposes and delegates Phase6 runtime methods', async () => {
    const { result } = renderHook(() =>
      useTranscriptionCollaborationBridge({
        enabled: true,
        projectId: 'project-1',
      }),
    );

    await waitFor(() => {
      expect(bridgeStart).toHaveBeenCalledTimes(1);
    });

    await result.current.listProjectAssets();
    await result.current.createProjectSnapshot({
      version: 1,
      payloadJson: '{"state":1}',
      schemaVersion: 1,
      createdBy: 'user-1',
      changeCursor: 0,
    });
    await result.current.restoreProjectSnapshotById('snap-1');
    await result.current.queryProjectChangeTimeline();

    expect(bridgeListAssets).toHaveBeenCalledTimes(1);
    expect(bridgeCreateSnapshot).toHaveBeenCalledTimes(1);
    expect(bridgeRestoreSnapshot).toHaveBeenCalledWith('snap-1');
    expect(bridgeQueryTimeline).toHaveBeenCalledTimes(1);
  });

  it('createProjectSnapshot 使用会话用户覆盖 createdBy | overwrites createdBy with session Supabase uid', async () => {
    getUserId.mockResolvedValue('session-uid');
    const { result } = renderHook(() =>
      useTranscriptionCollaborationBridge({
        enabled: true,
        projectId: 'project-1',
      }),
    );

    await waitFor(() => {
      expect(bridgeStart).toHaveBeenCalledTimes(1);
    });

    await result.current.createProjectSnapshot({
      version: 1,
      payloadJson: '{"state":1}',
      schemaVersion: 1,
      createdBy: 'caller-wrong-uuid',
      changeCursor: 0,
    });

    expect(bridgeCreateSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        createdBy: 'session-uid',
      }),
    );
  });

  it('registerProjectAsset 使用会话用户覆盖 uploadedBy | overwrites uploadedBy with session Supabase uid', async () => {
    getUserId.mockResolvedValue('session-uid');
    const { result } = renderHook(() =>
      useTranscriptionCollaborationBridge({
        enabled: true,
        projectId: 'project-1',
      }),
    );

    await waitFor(() => {
      expect(bridgeStart).toHaveBeenCalledTimes(1);
    });

    await result.current.registerProjectAsset({
      assetType: 'attachment',
      fileName: 'a.bin',
      data: new Uint8Array([1]),
      mimeType: 'application/octet-stream',
      uploadedBy: 'caller-wrong-uuid',
    });

    expect(bridgeRegisterAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadedBy: 'session-uid',
      }),
    );
  });

  it('启动前拉取 projects 行用于协议守卫 | loads projects row for protocol guard before bridge start', async () => {
    renderHook(() =>
      useTranscriptionCollaborationBridge({
        enabled: true,
        projectId: 'project-1',
      }),
    );

    await waitFor(() => {
      expect(supabaseFrom).toHaveBeenCalledWith('projects');
      expect(bridgeStart).toHaveBeenCalledTimes(1);
    });
  });

  it('当客户端版本低于 app_min_version 时阻止 enqueueMutation | blocks enqueueMutation when client is below app_min_version', async () => {
    projectGuardRow.current = { protocol_version: 1, app_min_version: '100.0.0' };

    const { result } = renderHook(() =>
      useTranscriptionCollaborationBridge({
        enabled: true,
        projectId: 'project-1',
      }),
    );

    await waitFor(() => {
      expect(result.current.collaborationProtocolGuard.cloudWritesDisabled).toBe(true);
    });

    act(() => {
      void result.current.enqueueMutation({
        entityType: 'layer_unit_content',
        entityId: 'unit-1:layer-1',
        opType: 'upsert_unit_content',
        payload: { unitId: 'unit-1', layerId: 'layer-1', value: 'hello' },
      });
    });

    expect(bridgeEnqueue).not.toHaveBeenCalled();
  });

  it('advances last-seen revision only after remote apply succeeds', async () => {
    const onApplyRemoteChange = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useTranscriptionCollaborationBridge({
        enabled: true,
        projectId: 'project-1',
        onApplyRemoteChange,
      }),
    );

    await waitFor(() => {
      expect(bridgeStart).toHaveBeenCalledTimes(1);
    });

    // Contiguous inbound (#361): seed predecessor via force (hydration/outbound)
    act(() => {
      result.current.markProjectRevisionSeen(6);
    });

    const options = lastBridgeOptions.current as {
      onApplyRemoteChange: (change: CollaborationProjectChangeRecord) => Promise<void>;
    };
    const change: CollaborationProjectChangeRecord = {
      id: 'ch-ok',
      projectId: 'project-1',
      actorId: 'user-2',
      clientId: 'other-client',
      clientOpId: 'op-ok',
      protocolVersion: 1,
      projectRevision: 7,
      baseRevision: 6,
      entityType: 'layer_unit',
      entityId: 'unit-1',
      opType: 'upsert_unit',
      sourceKind: 'sync',
      createdAt: '2026-09-20T00:00:00.000Z',
    };

    await options.onApplyRemoteChange(change);
    expect(onApplyRemoteChange).toHaveBeenCalledTimes(1);
    expect(loadProjectLastSeenRevision('project-1')).toBe(7);
  });

  it('#361: 入站 10 失败后 11 成功不得把游标跨到 11 | failed rev must block later success from advancing cursor', async () => {
    const onApplyRemoteChange = vi
      .fn()
      .mockRejectedValueOnce(new Error('apply-10-failed'))
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() =>
      useTranscriptionCollaborationBridge({
        enabled: true,
        projectId: 'project-1',
        onApplyRemoteChange,
      }),
    );

    await waitFor(() => {
      expect(bridgeStart).toHaveBeenCalledTimes(1);
    });

    // Seed contiguous base at 9 via force (hydration/outbound path)
    act(() => {
      result.current.markProjectRevisionSeen(9);
    });
    expect(loadProjectLastSeenRevision('project-1')).toBe(9);

    const options = lastBridgeOptions.current as {
      onApplyRemoteChange: (
        change: CollaborationProjectChangeRecord,
      ) => Promise<void | { commitRevision?: boolean }>;
    };
    const makeChange = (revision: number): CollaborationProjectChangeRecord => ({
      id: `ch-${revision}`,
      projectId: 'project-1',
      actorId: 'user-2',
      clientId: 'other-client',
      clientOpId: `op-${revision}`,
      protocolVersion: 1,
      projectRevision: revision,
      baseRevision: revision - 1,
      entityType: 'layer_unit',
      entityId: 'unit-1',
      opType: 'upsert_unit',
      sourceKind: 'sync',
      createdAt: '2026-09-20T00:00:00.000Z',
    });

    await expect(options.onApplyRemoteChange(makeChange(10))).rejects.toThrow('apply-10-failed');
    expect(loadProjectLastSeenRevision('project-1')).toBe(9);

    await options.onApplyRemoteChange(makeChange(11));
    // Must stay at 9 (gap at 10); old bug advanced to 11
    expect(loadProjectLastSeenRevision('project-1')).toBe(9);
    expect(result.current.getLatestKnownRevision()).toBe(9);

    // Filling the gap later advances through 11
    onApplyRemoteChange.mockResolvedValueOnce(undefined);
    await options.onApplyRemoteChange(makeChange(10));
    expect(loadProjectLastSeenRevision('project-1')).toBe(11);
    expect(result.current.getLatestKnownRevision()).toBe(11);
  });

  it('#363: does not advance last-seen when apply returns commitRevision:false', async () => {
    const onApplyRemoteChange = vi.fn().mockResolvedValue({ commitRevision: false });
    renderHook(() =>
      useTranscriptionCollaborationBridge({
        enabled: true,
        projectId: 'project-1',
        onApplyRemoteChange,
      }),
    );

    await waitFor(() => {
      expect(bridgeStart).toHaveBeenCalledTimes(1);
    });

    const options = lastBridgeOptions.current as {
      onApplyRemoteChange: (
        change: CollaborationProjectChangeRecord,
      ) => Promise<void | { commitRevision?: boolean }>;
    };
    const change: CollaborationProjectChangeRecord = {
      id: 'ch-manual',
      projectId: 'project-1',
      actorId: 'user-2',
      clientId: 'other-client',
      clientOpId: 'op-manual',
      protocolVersion: 1,
      projectRevision: 8,
      baseRevision: 7,
      entityType: 'layer_unit',
      entityId: 'unit-1',
      opType: 'upsert_unit',
      sourceKind: 'sync',
      createdAt: '2026-09-20T00:00:00.000Z',
    };

    await options.onApplyRemoteChange(change);
    expect(onApplyRemoteChange).toHaveBeenCalledTimes(1);
    expect(loadProjectLastSeenRevision('project-1')).toBe(0);
  });


  it('does not advance last-seen revision when remote apply throws', async () => {
    const onApplyRemoteChange = vi.fn().mockRejectedValue(new Error('apply-failed'));
    renderHook(() =>
      useTranscriptionCollaborationBridge({
        enabled: true,
        projectId: 'project-1',
        onApplyRemoteChange,
      }),
    );

    await waitFor(() => {
      expect(bridgeStart).toHaveBeenCalledTimes(1);
    });

    const options = lastBridgeOptions.current as {
      onApplyRemoteChange: (change: CollaborationProjectChangeRecord) => Promise<void>;
    };
    const change: CollaborationProjectChangeRecord = {
      id: 'ch-fail',
      projectId: 'project-1',
      actorId: 'user-2',
      clientId: 'other-client',
      clientOpId: 'op-fail',
      protocolVersion: 1,
      projectRevision: 9,
      baseRevision: 8,
      entityType: 'layer_unit',
      entityId: 'unit-1',
      opType: 'upsert_unit',
      sourceKind: 'sync',
      createdAt: '2026-09-20T00:00:00.000Z',
    };

    await expect(options.onApplyRemoteChange(change)).rejects.toThrow('apply-failed');
    expect(loadProjectLastSeenRevision('project-1')).toBe(0);
  });

  describe('rev5 2C deletion safety', () => {
    type SendOptions = { onSendLocalChanges: (changes: unknown[]) => Promise<void> };
    const outbound = [
      {
        projectId: 'project-1',
        actorId: 'user-1',
        clientId: 'c',
        clientOpId: 'c:1',
        protocolVersion: 1,
        projectRevision: 0,
        baseRevision: 0,
        entityType: 'layer_unit',
        entityId: 'u1',
        opType: 'upsert_unit',
        sourceKind: 'user',
        createdAt: '2026-10-09T00:00:00.000Z',
      },
    ];

    it('T23: tombstoned at start → bridge never starts, local cleanup runs', async () => {
      projectGuardRow.current = {
        protocol_version: 1,
        app_min_version: '0.1.0',
        deleted_at: '2026-10-09T01:00:00.000Z',
      };
      const { result } = renderHook(() =>
        useTranscriptionCollaborationBridge({ enabled: true, projectId: 'project-1' }),
      );
      await waitFor(() => {
        expect(applyTombstone).toHaveBeenCalledWith('project-1', {
          deletedAt: '2026-10-09T01:00:00.000Z',
        });
      });
      expect(bridgeCtorCalls).toHaveLength(0);
      expect(result.current.collaborationProtocolGuard.cloudWritesDisabled).toBe(true);
      expect(result.current.collaborationProtocolGuard.projectDeleted).toBe(true);
    });

    it('T23: tombstone appearing before a push → no insert, outbound cancelled via cleanup', async () => {
      renderHook(() =>
        useTranscriptionCollaborationBridge({ enabled: true, projectId: 'project-1' }),
      );
      await waitFor(() => expect(bridgeStart).toHaveBeenCalledTimes(1));
      projectGuardRow.current = {
        protocol_version: 1,
        app_min_version: '0.1.0',
        deleted_at: '2026-10-09T02:00:00.000Z',
      };
      const options = lastBridgeOptions.current as SendOptions;
      await expect(options.onSendLocalChanges(outbound)).rejects.toThrow(/deleted in the cloud/);
      expect(supabaseInsert).not.toHaveBeenCalled();
      await waitFor(() => expect(applyTombstone).toHaveBeenCalledTimes(1));
      expect(bridgeStop).toHaveBeenCalled();
    });

    it('JYDEL rejection from the server is handled as a tombstone', async () => {
      renderHook(() =>
        useTranscriptionCollaborationBridge({ enabled: true, projectId: 'project-1' }),
      );
      await waitFor(() => expect(bridgeStart).toHaveBeenCalledTimes(1));
      supabaseInsert.mockResolvedValueOnce({
        error: { code: 'JYDEL', message: 'JIEYU_PROJECT_DELETED: project-1' },
      } as never);
      const options = lastBridgeOptions.current as SendOptions;
      await expect(options.onSendLocalChanges(outbound)).rejects.toMatchObject({ code: 'JYDEL' });
      await waitFor(() =>
        expect(applyTombstone).toHaveBeenCalledWith('project-1', { deletedAt: null }),
      );
    });

    it('T52a: JYPRT / JYVER rejection → read-only and other tabs are told to re-check', async () => {
      const seen: string[] = [];
      const unsubscribe = subscribeCollaborationLifecycle((message) => seen.push(message.type));
      const { result } = renderHook(() =>
        useTranscriptionCollaborationBridge({ enabled: true, projectId: 'project-1' }),
      );
      await waitFor(() => expect(bridgeStart).toHaveBeenCalledTimes(1));
      supabaseInsert.mockResolvedValueOnce({
        error: { code: 'JYPRT', message: 'JIEYU_PROTOCOL_MISMATCH' },
      } as never);
      const options = lastBridgeOptions.current as SendOptions;
      await expect(options.onSendLocalChanges(outbound)).rejects.toMatchObject({ code: 'JYPRT' });
      await waitFor(() => {
        expect(result.current.collaborationProtocolGuard).toMatchObject({
          cloudWritesDisabled: true,
          reasons: ['server-rejected-protocol-mismatch'],
        });
      });
      expect(seen).toContain('protocol-changed');
      act(() => {
        void result.current.enqueueMutation({
          entityType: 'layer_unit',
          entityId: 'u2',
          opType: 'upsert_unit',
        });
      });
      expect(bridgeEnqueue).not.toHaveBeenCalled();
      unsubscribe();
    });

    it('re-reads the project row before every push', async () => {
      renderHook(() =>
        useTranscriptionCollaborationBridge({ enabled: true, projectId: 'project-1' }),
      );
      await waitFor(() => expect(bridgeStart).toHaveBeenCalledTimes(1));
      const before = projectSelectMaybeSingle.mock.calls.length;
      projectGuardRow.current = { protocol_version: 2, app_min_version: '0.1.0' };
      const options = lastBridgeOptions.current as SendOptions;
      await expect(options.onSendLocalChanges(outbound)).rejects.toThrow(
        /cloud writes are disabled/,
      );
      expect(projectSelectMaybeSingle.mock.calls.length).toBeGreaterThan(before);
      expect(supabaseInsert).not.toHaveBeenCalled();
    });

    it("removal in another tab stops this tab's bridge and keeps it stopped", async () => {
      renderHook(() =>
        useTranscriptionCollaborationBridge({ enabled: true, projectId: 'project-1' }),
      );
      await waitFor(() => expect(bridgeStart).toHaveBeenCalledTimes(1));
      markProjectRemovedLocally('project-1');
      bridgeStop.mockClear();
      act(() => {
        broadcastCollaborationLifecycle('project-removed-locally', 'project-1');
      });
      await waitFor(() => expect(bridgeStop).toHaveBeenCalled());
      expect(bridgeStart).toHaveBeenCalledTimes(1);
    });
  });
});
