/**
 * 稳定的协同 clientId（rev5 9.4）| Stable collaboration clientId (rev5 9.4)
 *
 * 每个安装实例（同一浏览器配置的同一站点）只生成一次，存在 localStorage，不进任何项目包或 JYB
 * （属于 `collab_state` 数据类，见 tableRegistry）。原来每次挂载桥接都生成新的 id，
 * 导致同一台机器重启后认不出自己的回声，去重键也随之变化。
 * Generated once per installation and kept in localStorage; never copied into a project package or
 * JYB (`collab_state`). Previously every bridge mount created a fresh id, so a restarted client could
 * not recognise its own echoes and the dedupe key changed.
 */
export const COLLAB_CLIENT_ID_STORAGE_KEY = 'jieyu:collab-client-id:v1';

const CLIENT_ID_PATTERN = /^web-[A-Za-z0-9-]{8,80}$/;

/** 存储不可用时本次会话内使用的 id | Session fallback when storage is unavailable */
let sessionFallbackClientId: string | null = null;

function getDefaultStorage(): Storage | undefined {
  if (typeof window === 'undefined' || window.localStorage === undefined) return undefined;
  return window.localStorage;
}

function generateClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `web-${crypto.randomUUID()}`;
  }
  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * 读取或生成本机的 clientId。
 * Read or create this installation's clientId.
 */
export function getCollaborationClientId(
  storage: Storage | undefined = getDefaultStorage(),
): string {
  if (storage !== undefined) {
    try {
      const stored = storage.getItem(COLLAB_CLIENT_ID_STORAGE_KEY);
      if (stored !== null && CLIENT_ID_PATTERN.test(stored)) return stored;
      const created = sessionFallbackClientId ?? generateClientId();
      storage.setItem(COLLAB_CLIENT_ID_STORAGE_KEY, created);
      sessionFallbackClientId = created;
      return created;
    } catch {
      // 存储不可用：退回到本次会话内稳定的 id | Storage unavailable: fall back to a session-stable id
    }
  }
  sessionFallbackClientId ??= generateClientId();
  return sessionFallbackClientId;
}

/** Vitest：清掉会话内的回退 id | Vitest: drop the session fallback id */
export function resetCollaborationClientIdForTests(): void {
  sessionFallbackClientId = null;
}
