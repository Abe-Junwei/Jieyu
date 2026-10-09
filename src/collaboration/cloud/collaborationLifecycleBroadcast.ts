/**
 * 同一浏览器内各标签页之间的协作生命周期通知（rev5 9.3）。
 * Collaboration lifecycle notices between tabs of the same browser (rev5 9.3).
 *
 * 本机移除、云端删除、协议升级都会广播；本标签页的订阅者也会同步收到。
 * 没有 BroadcastChannel 的环境只通知本标签页，其他标签页靠获得焦点时的重新检查兜底。
 * Local removal, cloud deletion and protocol upgrades are broadcast; same-tab subscribers are told
 * too. Without BroadcastChannel only this tab is notified; other tabs re-check on focus.
 */
export type CollaborationLifecycleEvent =
  | 'project-removed-locally'
  | 'project-deleted-cloud'
  | 'protocol-changed';

export interface CollaborationLifecycleMessage {
  type: CollaborationLifecycleEvent;
  projectId: string;
  at: string;
}

export const COLLAB_LIFECYCLE_CHANNEL = 'jieyu-collab-lifecycle';

type Listener = (message: CollaborationLifecycleMessage) => void;

const localListeners = new Set<Listener>();
let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (channel === null) {
    channel = new BroadcastChannel(COLLAB_LIFECYCLE_CHANNEL);
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const message = parseMessage(event.data);
      if (message === null) return;
      for (const listener of localListeners) listener(message);
    };
  }
  return channel;
}

function parseMessage(value: unknown): CollaborationLifecycleMessage | null {
  if (value === null || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const type = source.type;
  if (
    type !== 'project-removed-locally' &&
    type !== 'project-deleted-cloud' &&
    type !== 'protocol-changed'
  ) {
    return null;
  }
  if (typeof source.projectId !== 'string' || source.projectId.length === 0) return null;
  return {
    type,
    projectId: source.projectId,
    at: typeof source.at === 'string' ? source.at : new Date().toISOString(),
  };
}

/** 通知本标签页和其他标签页 | Notify this tab and the others */
export function broadcastCollaborationLifecycle(
  type: CollaborationLifecycleEvent,
  projectId: string,
): void {
  const message: CollaborationLifecycleMessage = { type, projectId, at: new Date().toISOString() };
  for (const listener of localListeners) listener(message);
  try {
    getChannel()?.postMessage(message);
  } catch {
    // 广播失败时其他标签页靠获得焦点时的检查兜底 | Other tabs fall back to the focus re-check
  }
}

/** 订阅通知；返回取消函数 | Subscribe; returns an unsubscribe function */
export function subscribeCollaborationLifecycle(listener: Listener): () => void {
  localListeners.add(listener);
  getChannel();
  return () => {
    localListeners.delete(listener);
  };
}

/** Vitest：关闭频道并清空订阅 | Vitest: close the channel and drop listeners */
export function resetCollaborationLifecycleBroadcastForTests(): void {
  localListeners.clear();
  channel?.close();
  channel = null;
}
