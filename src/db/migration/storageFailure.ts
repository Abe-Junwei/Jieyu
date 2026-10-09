/**
 * 写入失败分类（rev5 6.2 / 8.2）| Storage write-failure classification (rev5 6.2 / 8.2)
 *
 * 统一处理 QuotaExceededError、AbortError、事务中止和连接被关闭：调用方据此如实报告失败，
 * **不自动删除原件**（只清理自己写了一半的副本，例如不完整的快照槽位）。
 * Unifies QuotaExceededError, AbortError, aborted transactions and closed connections so callers
 * report failures honestly. Originals are never deleted automatically.
 */

export type StorageFailureKind =
  | 'quota-exceeded'
  | 'aborted'
  | 'transaction-inactive'
  | 'connection-closed'
  | 'version'
  | 'blocked'
  | 'unknown';

export type StorageFailure = {
  kind: StorageFailureKind;
  /** 原始错误名 | Original error name */
  name: string;
  message: string;
};

function nameOf(error: unknown): string {
  if (
    error !== null &&
    typeof error === 'object' &&
    'name' in error &&
    typeof error.name === 'string'
  )
    return error.name;
  return '';
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    error !== null &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  )
    return error.message;
  return String(error);
}

function innerOf(error: unknown): unknown {
  if (error !== null && typeof error === 'object') {
    const record = error as { inner?: unknown; cause?: unknown };
    return record.inner ?? record.cause;
  }
  return undefined;
}

function isQuota(error: unknown): boolean {
  const name = nameOf(error);
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
  return typeof DOMException !== 'undefined' && error instanceof DOMException && error.code === 22;
}

/** 分类一个存储错误（会向内看 Dexie 的 `inner` / `cause`）| Classify a storage error (follows Dexie `inner`) */
export function classifyStorageFailure(error: unknown): StorageFailure {
  const chain: unknown[] = [];
  let cursor: unknown = error;
  for (let depth = 0; cursor !== undefined && cursor !== null && depth < 5; depth += 1) {
    chain.push(cursor);
    cursor = innerOf(cursor);
  }
  const top = chain[0];
  const result = (kind: StorageFailureKind): StorageFailure => ({
    kind,
    name: nameOf(top),
    message: messageOf(top),
  });
  // 配额问题常被包在 AbortError 里，先看整条链 | quota errors are often wrapped in AbortError
  if (chain.some(isQuota)) return result('quota-exceeded');
  for (const item of chain) {
    const name = nameOf(item);
    const message = messageOf(item).toLowerCase();
    if (name === 'DatabaseClosedError' || (name === 'InvalidStateError' && /clos/.test(message))) {
      return result('connection-closed');
    }
    if (name === 'TransactionInactiveError' || name === 'PrematureCommitError')
      return result('transaction-inactive');
    if (name === 'VersionError') return result('version');
    if (name === 'BlockedError' || /blocked/.test(message)) return result('blocked');
  }
  if (chain.some((item) => nameOf(item) === 'AbortError')) return result('aborted');
  return result('unknown');
}

/** 一段如实的说明，供日志与界面使用 | Honest one-line description for logs and UI */
export function describeStorageFailure(failure: StorageFailure): string {
  const base: Record<StorageFailureKind, string> = {
    'quota-exceeded': 'storage quota exceeded',
    aborted: 'write aborted',
    'transaction-inactive': 'transaction aborted or no longer active',
    'connection-closed': 'database connection was closed',
    version: 'database version mismatch',
    blocked: 'blocked by another connection',
    unknown: 'storage write failed',
  };
  const detail = failure.message !== '' ? `: ${failure.message}` : '';
  return `${base[failure.kind]}${failure.name !== '' ? ` (${failure.name}${detail})` : ''}`;
}
