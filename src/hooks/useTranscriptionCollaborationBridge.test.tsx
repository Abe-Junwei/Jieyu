// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  BridgeMock,
  bridgeStart,
  bridgeStop,
  bridgeEnqueue,
  bridgeListAssets,
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
    createProjectSnapshot = bridgeCreateSnapshot;
    restoreProjectSnapshotById = bridgeRestoreSnapshot;
    queryProjectChangeTimeline = bridgeQueryTimeline;
  }

  const hasConfig = vi.fn<() => boolean>().mockReturnValue(true);
  const getUserId = vi.fn<() => Promise<string | null>>().mockResolvedValue('user-1');
  const supabaseInsert = vi.fn<(rows: unknown[]) => Promise<{ error: null }>>().mockResolvedValue({ error: null });
  const projectGuardRow = { current: { protocol_version: 1, app_min_version: '0.1.0' } };
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

vi.mock('../collaboration/cloud/CollaborationSyncBridge', () => ({
  CollaborationSyncBridge: BridgeMock,
}));

vi.mock('../integrations/supabase/client', () => ({
  hasSupabaseBrowserClientConfig: hasConfig,
  getSupabaseBrowserClient: () => ({ from: supabaseFrom }),
}));

vi.mock('../integrations/supabase/auth', () => ({
  getSupabaseUserId: getUserId,
}));

import { useTranscriptionCollaborationBridge } from './useTranscriptionCollaborationBridge';

describe('useTranscriptionCollaborationBridge', () => {
  beforeEach(() => {
    bridgeStart.mockClear();
    bridgeStop.mockClear();
    bridgeEnqueue.mockClear();
    bridgeListAssets.mockClear();
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
  });

  it('启动后创建桥接，停用时停止桥接 | starts bridge when enabled and stops when disabled', async () => {
    const { rerender } = renderHook((props: { enabled: boolean; projectId: string }) => (
      useTranscriptionCollaborationBridge(props)
    ), {
      initialProps: { enabled: true, projectId: 'project-1' },
    });

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

    renderHook(() => useTranscriptionCollaborationBridge({
      enabled: true,
      projectId: 'project-1',
    }));

    await waitFor(() => {
      expect(bridgeCtorCalls).toHaveLength(0);
      expect(bridgeStart).not.toHaveBeenCalled();
    });
  });

  it('未登录时降级，不启动桥接 | degrades without authenticated user and does not start bridge', async () => {
    getUserId.mockResolvedValueOnce(null);

    renderHook(() => useTranscriptionCollaborationBridge({
      enabled: true,
      projectId: 'project-1',
    }));

    await waitFor(() => {
      expect(bridgeCtorCalls).toHaveLength(0);
      expect(bridgeStart).not.toHaveBeenCalled();
    });
  });

  it('enqueueMutation 生成并投递变更记录 | enqueueMutation builds and enqueues change records', async () => {
    const { result } = renderHook(() => useTranscriptionCollaborationBridge({
      enabled: true,
      projectId: 'project-1',
    }));

    await waitFor(() => {
      expect(bridgeStart).toHaveBeenCalledTimes(1);
    });

    act(() => {
      result.current.enqueueMutation({
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
    const { result } = renderHook(() => useTranscriptionCollaborationBridge({
      enabled: true,
      projectId: 'project-1',
    }));

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

  it('启动前拉取 projects 行用于协议守卫 | loads projects row for protocol guard before bridge start', async () => {
    renderHook(() => useTranscriptionCollaborationBridge({
      enabled: true,
      projectId: 'project-1',
    }));

    await waitFor(() => {
      expect(supabaseFrom).toHaveBeenCalledWith('projects');
      expect(bridgeStart).toHaveBeenCalledTimes(1);
    });
  });

  it('当客户端版本低于 app_min_version 时阻止 enqueueMutation | blocks enqueueMutation when client is below app_min_version', async () => {
    projectGuardRow.current = { protocol_version: 1, app_min_version: '100.0.0' };

    const { result } = renderHook(() => useTranscriptionCollaborationBridge({
      enabled: true,
      projectId: 'project-1',
    }));

    await waitFor(() => {
      expect(result.current.collaborationProtocolGuard.cloudWritesDisabled).toBe(true);
    });

    act(() => {
      result.current.enqueueMutation({
        entityType: 'layer_unit_content',
        entityId: 'unit-1:layer-1',
        opType: 'upsert_unit_content',
        payload: { unitId: 'unit-1', layerId: 'layer-1', value: 'hello' },
      });
    });

    expect(bridgeEnqueue).not.toHaveBeenCalled();
  });
});
