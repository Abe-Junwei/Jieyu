// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollaborationProjectChangeRecord } from './syncTypes';
import { CollaborationSyncBridge } from './CollaborationSyncBridge';
import {
  loadProjectPendingOutboundChanges,
  saveProjectPendingOutboundChanges,
} from './CollaborationClientStateStore';

const mockChannelOn = vi.fn();
const mockChannelSubscribe = vi.fn();
const mockChannelUnsubscribe = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockChannelFactory = vi.fn();

vi.mock('./collaborationSupabaseFacade', () => ({
  getSupabaseBrowserClient: () => ({
    channel: mockChannelFactory,
  }),
}));

function makeChange(clientOpId: string): CollaborationProjectChangeRecord {
  return {
    id: `change-${clientOpId}`,
    projectId: 'project-1',
    actorId: 'actor-1',
    clientId: 'client-1',
    clientOpId,
    protocolVersion: 1,
    projectRevision: 1,
    baseRevision: 0,
    entityType: 'text',
    entityId: 'text-1',
    opType: 'upsert_text',
    sourceKind: 'user',
    createdAt: '2026-04-17T00:00:00.000Z',
  };
}

async function flushMicroTasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

/** `CollaborationSyncBridge` 出站落盘对非空队列有 500ms debounce | Matches OUTBOUND_PENDING_SAVE_DEBOUNCE_MS */
async function waitForOutboundDebounce(): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, 550));
}

describe('CollaborationSyncBridge persistence flow', () => {
  beforeEach(() => {
    window.localStorage.clear();

    mockChannelOn.mockReset();
    mockChannelSubscribe.mockReset();
    mockChannelUnsubscribe.mockReset();
    mockChannelFactory.mockReset();

    const channel = {
      on: mockChannelOn,
      subscribe: mockChannelSubscribe,
      unsubscribe: mockChannelUnsubscribe,
    };

    mockChannelOn.mockReturnValue(channel);
    mockChannelSubscribe.mockImplementation((callback: (status: string) => void) => {
      callback('SUBSCRIBED');
      return channel;
    });
    mockChannelFactory.mockReturnValue(channel);
  });

  it('刷新后会自动补发持久化 pending 并清空队列 | replays persisted pending after refresh and clears queue', async () => {
    saveProjectPendingOutboundChanges('project-1', [makeChange('seed-op')]);

    const sender = vi.fn<(changes: CollaborationProjectChangeRecord[]) => Promise<void>>().mockResolvedValue(undefined);
    const bridge = new CollaborationSyncBridge({
      projectId: 'project-1',
      onApplyRemoteChange: async () => {},
      onSendLocalChanges: sender,
    });

    await bridge.start();
    await flushMicroTasks();
    // `outbound.start()` 使用 `void flush()`，须让微任务/下一 macrotick 先跑完再读 localStorage
    await new Promise<void>((r) => setTimeout(r, 0));

    expect(sender).toHaveBeenCalledWith([
      expect.objectContaining({ clientOpId: 'seed-op' }),
    ]);
    expect(loadProjectPendingOutboundChanges('project-1')).toEqual([]);

    await bridge.stop();
  });

  it('离线失败会持久化，刷新重连后可补发 | persists on offline failure and replays on reconnect after refresh', async () => {
    const failedSender = vi.fn<(changes: CollaborationProjectChangeRecord[]) => Promise<void>>()
      .mockRejectedValue(new Error('offline'));

    const offlineBridge = new CollaborationSyncBridge({
      projectId: 'project-1',
      onApplyRemoteChange: async () => {},
      onSendLocalChanges: failedSender,
    });

    await offlineBridge.start();
    offlineBridge.enqueueLocalChange(makeChange('offline-op'));
    await offlineBridge.flushLocalChanges();
    await waitForOutboundDebounce();

    await offlineBridge.stop();

    const recoveredSender = vi.fn<(changes: CollaborationProjectChangeRecord[]) => Promise<void>>()
      .mockResolvedValue(undefined);

    const recoveredBridge = new CollaborationSyncBridge({
      projectId: 'project-1',
      onApplyRemoteChange: async () => {},
      onSendLocalChanges: recoveredSender,
    });

    await recoveredBridge.start();
    await flushMicroTasks();
    await new Promise<void>((r) => setTimeout(r, 0));

    expect(recoveredSender).toHaveBeenCalledWith([
      expect.objectContaining({ clientOpId: 'offline-op' }),
    ]);
    expect(loadProjectPendingOutboundChanges('project-1')).toEqual([]);

    await recoveredBridge.stop();
  });

  it('initialOutboundPending: [] 不消费 localStorage 中的 pending（避免禁写时静默丢批次）| empty override skips replay without clearing storage', async () => {
    saveProjectPendingOutboundChanges('project-1', [makeChange('seed-op')]);

    const sender = vi.fn<(changes: CollaborationProjectChangeRecord[]) => Promise<void>>().mockResolvedValue(undefined);
    const bridge = new CollaborationSyncBridge({
      projectId: 'project-1',
      onApplyRemoteChange: async () => {},
      onSendLocalChanges: sender,
      initialOutboundPending: [],
    });

    await bridge.start();
    await flushMicroTasks();

    expect(sender).not.toHaveBeenCalled();
    expect(loadProjectPendingOutboundChanges('project-1')).toEqual([
      expect.objectContaining({ clientOpId: 'seed-op' }),
    ]);

    await bridge.stop();
  });

  it('sender 抛错时出站批次回退且持久化 pending 不丢 | throw from sender keeps batch and persisted pending', async () => {
    saveProjectPendingOutboundChanges('project-1', [makeChange('seed-op')]);

    const sender = vi.fn<(changes: CollaborationProjectChangeRecord[]) => Promise<void>>()
      .mockRejectedValue(new Error('Collaboration cloud writes are disabled: test'));

    const bridge = new CollaborationSyncBridge({
      projectId: 'project-1',
      onApplyRemoteChange: async () => {},
      onSendLocalChanges: sender,
    });

    await bridge.start();
    await flushMicroTasks();
    await waitForOutboundDebounce();

    expect(sender).toHaveBeenCalledWith([
      expect.objectContaining({ clientOpId: 'seed-op' }),
    ]);
    expect(loadProjectPendingOutboundChanges('project-1')).toEqual([
      expect.objectContaining({ clientOpId: 'seed-op' }),
    ]);

    await bridge.stop();
  });
});
