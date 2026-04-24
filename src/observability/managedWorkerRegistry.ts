/**
 * 浏览器 `Worker` 轻量登记（ARCH-8）。供调试/遥测/健康快照；不替代各业务内的 onerror/terminate。
 * Light registry for `Worker` instances (ARCH-8) — debugging / telemetry; does not replace per-service error handling.
 */
export type ManagedWorkerState = 'live' | 'terminated';

export interface ManagedWorkerRegistryEntry {
  id: string;
  source: string;
  state: ManagedWorkerState;
  createdAtMs: number;
  terminatedAtMs?: number;
  errorEventCount: number;
  messageErrorEventCount: number;
  lastErrorMessage?: string;
}

const entries = new Map<string, ManagedWorkerRegistryEntry>();

let physicalWorkerSeq = 0;

/** 为同一来源的多次 new Worker 生成稳定前缀下的唯一 id。 */
export function nextPhysicalWorkerId(prefix: string): string {
  physicalWorkerSeq += 1;
  return `${prefix}-${physicalWorkerSeq}`;
}

export function registerManagedWorker(id: string, source: string): void {
  const now = Date.now();
  entries.set(id, {
    id,
    source,
    state: 'live',
    createdAtMs: now,
    errorEventCount: 0,
    messageErrorEventCount: 0,
  });
}

export function recordManagedWorkerError(
  id: string,
  kind: 'error' | 'messageerror',
  message?: string,
): void {
  const e = entries.get(id);
  if (!e || e.state !== 'live') return;
  if (kind === 'error') {
    e.errorEventCount += 1;
  } else {
    e.messageErrorEventCount += 1;
  }
  if (message && message.length > 0) {
    e.lastErrorMessage = message.slice(0, 200);
  }
}

export function markManagedWorkerTerminated(id: string): void {
  const e = entries.get(id);
  if (!e) return;
  e.state = 'terminated';
  e.terminatedAtMs = Date.now();
}

export function getManagedWorkerRegistrySnapshot(): readonly ManagedWorkerRegistryEntry[] {
  return [...entries.values()].sort((a, b) => a.createdAtMs - b.createdAtMs);
}

/** Vitest / 单测隔离。 */
export function resetManagedWorkerRegistryForTests(): void {
  entries.clear();
  physicalWorkerSeq = 0;
}
