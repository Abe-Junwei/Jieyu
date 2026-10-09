/**
 * 迁移闸门状态（供界面读取）| Migration gate status for the UI
 *
 * `getDb()` 可能在 React 挂载之前就运行，所以状态保存在模块里，同时派发 window 事件。
 * `getDb()` may run before React mounts, so the status lives here and is also dispatched as events.
 */
import type { MigrationGateErrorDetail } from './migrationGate';
import type { StaleConnectionReason } from './upgradeCoordinator';

export const JIEYU_DB_MIGRATION_GATE_EVENT = 'jieyu:db-migration-gate' as const;
export const JIEYU_DB_STALE_EVENT = 'jieyu:db-stale' as const;
export const JIEYU_DB_MIGRATION_WARNING_EVENT = 'jieyu:db-migration-warning' as const;

export type MigrationGateStatus =
  | { kind: 'ok' }
  | { kind: 'gate-failed'; detail: MigrationGateErrorDetail }
  | { kind: 'stale'; reason: StaleConnectionReason }
  | { kind: 'warning'; warning: string };

type Listener = (status: MigrationGateStatus) => void;

let current: MigrationGateStatus = { kind: 'ok' };
const listeners = new Set<Listener>();

export function getMigrationGateStatus(): MigrationGateStatus {
  return current;
}

export function subscribeMigrationGateStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function dispatch(type: string, detail: unknown): void {
  try {
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent(type, { detail }));
    }
  } catch {
    // 事件派发失败不影响状态 | dispatch failures must not lose the status
  }
}

/** 记录并通知；闸门失败与“旧连接”优先于警告 | Record and notify; failures outrank warnings */
export function publishMigrationGateStatus(status: MigrationGateStatus): void {
  if (status.kind === 'warning' && (current.kind === 'gate-failed' || current.kind === 'stale'))
    return;
  current = status;
  if (status.kind === 'gate-failed') dispatch(JIEYU_DB_MIGRATION_GATE_EVENT, status.detail);
  if (status.kind === 'stale') dispatch(JIEYU_DB_STALE_EVENT, { reason: status.reason });
  if (status.kind === 'warning')
    dispatch(JIEYU_DB_MIGRATION_WARNING_EVENT, { warning: status.warning });
  for (const listener of [...listeners]) listener(status);
}

/** 仅测试 | tests only */
export function resetMigrationGateStatusForTests(): void {
  current = { kind: 'ok' };
}
