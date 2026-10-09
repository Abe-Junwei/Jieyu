/**
 * 多标签页协调（rev5 8.2 / T54）| Multi-tab coordination (rev5 8.2 / T54)
 *
 * - 所有标签页注册 `versionchange`：关闭连接（不再自动重开），提示“应用已更新，请刷新”。
 * - 升级前用 Web Locks 取得独占锁 `jieyu-db-upgrade`，再用 BroadcastChannel 通知其他标签页
 *   暂停写入、关闭连接。
 * - 升级请求收到 `blocked`，或超时仍有连接未关闭，就中止升级（见 migrationGate）。
 * - 不支持 Web Locks 时只依靠 `versionchange` 和 `blocked`。
 * - 升级守卫：主库的 IDBFactory 包一层，只有闸门“放行”的那一次升级才允许执行 upgradeneeded；
 *   绕过闸门的自动打开（Dexie autoOpen）无法悄悄升级。
 *
 * Every tab handles `versionchange` (close without auto-reopen, ask to refresh). Upgrades take the
 * exclusive `jieyu-db-upgrade` Web Lock and broadcast "pause and close" first. An upgrade guard
 * wraps the main DB's IDBFactory so only the gate-armed upgrade may run `upgradeneeded`.
 */
import type Dexie from 'dexie';

export const JIEYU_DB_UPGRADE_LOCK_NAME = 'jieyu-db-upgrade' as const;
export const JIEYU_DB_COORDINATION_CHANNEL = 'jieyu-db-coordination' as const;

export type CoordinationMessage =
  | {
      type: 'upgrade-intent';
      dbName: string;
      fromVersion: number;
      toVersion: number;
      tabId: string;
    }
  | { type: 'paused'; dbName: string; tabId: string };

export type StaleConnectionReason = 'versionchange' | 'upgrade-intent';

export type ChannelLike = {
  postMessage: (message: unknown) => void;
  close: () => void;
  addEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void;
  removeEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void;
};

export type ChannelFactory = (name: string) => ChannelLike | null;

export const defaultChannelFactory: ChannelFactory = (name) => {
  if (typeof BroadcastChannel === 'undefined') return null;
  const channel = new BroadcastChannel(name);
  // Node 的 BroadcastChannel 会拖住进程；浏览器里没有 unref | Node keeps the process alive otherwise
  (channel as unknown as { unref?: () => void }).unref?.();
  return channel as unknown as ChannelLike;
};

let cachedTabId: string | null = null;

/** 本标签页的随机 id | Random id of this tab */
export function currentTabId(): string {
  if (cachedTabId === null) {
    cachedTabId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `tab-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  }
  return cachedTabId;
}

/**
 * 给一个 Dexie 实例装上“旧连接”处理：其他连接要升级时关闭自己、不再自动重开，并通知界面。
 * 删除数据库（newVersion 为空）保持 Dexie 默认行为。返回卸载函数。
 * Install stale-connection handling on a Dexie instance. Deletes keep Dexie's default behaviour.
 */
export function installStaleConnectionHandlers(
  dexie: Dexie,
  options: {
    onStale: (reason: StaleConnectionReason) => void;
    channelFactory?: ChannelFactory;
    tabId?: string;
  },
): () => void {
  const tabId = options.tabId ?? currentTabId();
  const onVersionChange = (event: IDBVersionChangeEvent): boolean | undefined => {
    if (event.newVersion === null || event.newVersion === 0) return undefined; // 删除：交给默认处理 | delete: default
    dexie.close({ disableAutoOpen: true });
    options.onStale('versionchange');
    return false; // 阻止 Dexie 默认的“关闭后自动重开” | stop Dexie's close-and-reopen default
  };
  dexie.on('versionchange', onVersionChange);

  const channel = (options.channelFactory ?? defaultChannelFactory)(JIEYU_DB_COORDINATION_CHANNEL);
  const onMessage = (event: MessageEvent): void => {
    const message = event.data as CoordinationMessage | undefined;
    if (
      !message ||
      message.type !== 'upgrade-intent' ||
      message.dbName !== dexie.name ||
      message.tabId === tabId
    )
      return;
    dexie.close({ disableAutoOpen: true });
    options.onStale('upgrade-intent');
    channel?.postMessage({
      type: 'paused',
      dbName: dexie.name,
      tabId,
    } satisfies CoordinationMessage);
  };
  channel?.addEventListener('message', onMessage);
  return () => {
    dexie.on('versionchange').unsubscribe(onVersionChange);
    channel?.removeEventListener('message', onMessage);
    channel?.close();
  };
}

/**
 * 广播升级意图，并等待一个宽限期（让其他标签页关闭连接）。返回回复“已暂停”的标签页数。
 * Broadcast the upgrade intent and wait a grace period. Returns how many tabs acknowledged.
 */
export async function broadcastUpgradeIntent(
  message: Omit<Extract<CoordinationMessage, { type: 'upgrade-intent' }>, 'type' | 'tabId'>,
  options: { graceMs: number; channelFactory?: ChannelFactory; tabId?: string },
): Promise<number> {
  const channel = (options.channelFactory ?? defaultChannelFactory)(JIEYU_DB_COORDINATION_CHANNEL);
  if (!channel) return 0;
  const tabId = options.tabId ?? currentTabId();
  const acknowledged = new Set<string>();
  const onMessage = (event: MessageEvent): void => {
    const data = event.data as CoordinationMessage | undefined;
    if (data?.type === 'paused' && data.dbName === message.dbName && data.tabId !== tabId)
      acknowledged.add(data.tabId);
  };
  channel.addEventListener('message', onMessage);
  try {
    channel.postMessage({
      type: 'upgrade-intent',
      tabId,
      ...message,
    } satisfies CoordinationMessage);
    await new Promise((resolve) => setTimeout(resolve, options.graceMs));
    return acknowledged.size;
  } finally {
    channel.removeEventListener('message', onMessage);
    channel.close();
  }
}

export type LockManagerLike = {
  request: (
    name: string,
    options: { mode: 'exclusive'; signal?: AbortSignal },
    callback: () => Promise<unknown>,
  ) => Promise<unknown>;
};

export function defaultLockManager(): LockManagerLike | null {
  if (typeof navigator === 'undefined') return null;
  const locks = (navigator as Navigator & { locks?: LockManagerLike | undefined }).locks;
  return locks !== undefined && typeof locks.request === 'function' ? locks : null;
}

export type UpgradeLockResult<T> =
  | { acquired: true; supported: boolean; value: T }
  | { acquired: false; reason: 'timeout' };

/**
 * 在独占锁 `jieyu-db-upgrade` 内执行。不支持 Web Locks 时直接执行（`supported: false`）。
 * Run inside the exclusive `jieyu-db-upgrade` lock; run directly when Web Locks are unsupported.
 */
export async function withUpgradeLock<T>(
  fn: () => Promise<T>,
  options: { timeoutMs: number; locks?: LockManagerLike | null },
): Promise<UpgradeLockResult<T>> {
  const locks = options.locks === undefined ? defaultLockManager() : options.locks;
  if (!locks) return { acquired: true, supported: false, value: await fn() };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  let started = false;
  try {
    const value = (await locks.request(
      JIEYU_DB_UPGRADE_LOCK_NAME,
      { mode: 'exclusive', signal: controller.signal },
      async () => {
        started = true;
        clearTimeout(timer);
        return fn();
      },
    )) as T;
    return { acquired: true, supported: true, value };
  } catch (error) {
    if (!started && error instanceof Error && error.name === 'AbortError')
      return { acquired: false, reason: 'timeout' };
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 升级守卫：决定某次 `upgradeneeded` 是否允许执行。
 * - 新建数据库（oldVersion 0）总是允许；
 * - 闸门放行（arm）时，只允许从预期的旧版本升级；
 * - 冻结之前，允许 Dexie 对代码目标版本的 schema 补丁（原生版本 +1，Dexie 版本不变）；
 * - 其余一律中止（例如绕过闸门的自动打开、旧代码给新数据打补丁）。
 * Upgrade guard deciding whether an `upgradeneeded` may proceed.
 */
export class UpgradeGuard {
  private armedFromNative: number | null = null;
  private startedListener: (() => void) | null = null;

  constructor(
    private readonly options: { dbName: string; codeTargetVersion: number; frozen: boolean },
  ) {}

  arm(expectedOldNative: number, onUpgradeStarted?: () => void): void {
    this.armedFromNative = expectedOldNative;
    this.startedListener = onUpgradeStarted ?? null;
  }

  disarm(): void {
    this.armedFromNative = null;
    this.startedListener = null;
  }

  get armed(): boolean {
    return this.armedFromNative !== null;
  }

  allows(name: string, oldNative: number, newNative: number | null): boolean {
    if (name !== this.options.dbName) return true;
    if (oldNative === 0) return true;
    if (this.armedFromNative !== null && oldNative === this.armedFromNative) {
      this.startedListener?.();
      return true;
    }
    if (!this.options.frozen && newNative !== null) {
      const target = this.options.codeTargetVersion;
      if (Math.floor(oldNative / 10) === target && Math.floor(newNative / 10) === target)
        return true;
    }
    return false;
  }
}

/**
 * 包一层 IDBFactory：在 Dexie 的 `onupgradeneeded` 之前检查守卫，不允许就中止升级事务。
 * Wrap an IDBFactory so the guard runs before Dexie's `onupgradeneeded` and aborts disallowed upgrades.
 */
export function createUpgradeGuardedFactory(
  getBase: () => IDBFactory,
  guard: UpgradeGuard,
): IDBFactory {
  const open = (name: string, version?: number): IDBOpenDBRequest => {
    const base = getBase();
    const request = version === undefined ? base.open(name) : base.open(name, version);
    request.addEventListener('upgradeneeded', (event) => {
      const versionEvent = event as IDBVersionChangeEvent;
      if (guard.allows(name, versionEvent.oldVersion, versionEvent.newVersion)) return;
      event.stopImmediatePropagation();
      try {
        request.transaction?.abort();
      } catch {
        // already aborted
      }
    });
    return request;
  };
  return new Proxy({} as IDBFactory, {
    get(_target, property) {
      if (property === 'open') return open;
      const base = getBase() as unknown as Record<PropertyKey, unknown>;
      const value = base[property];
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(base)
        : value;
    },
  });
}
