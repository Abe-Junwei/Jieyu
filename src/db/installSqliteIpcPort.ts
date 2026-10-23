/**
 * 开关打开且桌面桥存在时，才把存储接口换成 IPC 代理（ADR-0079）。
 * 浏览器没有这座桥，所以不会装上。
 */
import { createIpcStoragePort } from './ipcStoragePort';
import { installStoragePort } from './storagePort';

interface DesktopStorageBridge {
  storageCall?: (method: string, args: readonly unknown[]) => Promise<unknown>;
}

export function readDesktopStorageCall():
  ((method: string, args: readonly unknown[]) => Promise<unknown>) | undefined {
  const desktop = (globalThis as { jieyuDesktop?: DesktopStorageBridge }).jieyuDesktop;
  const call = desktop?.storageCall;
  if (typeof call !== 'function') return undefined;
  return (method, args) => call(method, args);
}

export function installSqliteIpcPortIfEnabled(input: {
  enabled: boolean;
  invoke: ((method: string, args: readonly unknown[]) => Promise<unknown>) | undefined;
}): boolean {
  if (!input.enabled || input.invoke === undefined) return false;
  installStoragePort(createIpcStoragePort(input.invoke));
  return true;
}
