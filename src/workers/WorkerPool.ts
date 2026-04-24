/**
 * WorkerPool — 统一的 Web Worker 生命周期管理器
 *
 * 提供 Worker 注册、心跳检测、崩溃自动恢复、状态追踪。
 * Unified Web Worker lifecycle: registration, heartbeat, crash recovery, state tracking.
 */
import { createLogger } from '../observability/logger';

const log = createLogger('WorkerPool');

// ── Types ──

/** Worker 生命周期状态 */
export type WorkerLifecycleState = 'idle' | 'busy' | 'crashed' | 'terminated';

/** 单个 Worker 的元信息 */
export interface WorkerPoolEntry {
  readonly id: string;
  readonly label: string;
  readonly worker: Worker;
  state: WorkerLifecycleState;
  /** 自增重启计数 | Incremented on each restart */
  restartCount: number;
  /** 最后一次心跳时间 | Last heartbeat timestamp */
  lastHeartbeatAt: number;
  /** 最后一次错误 | Last error */
  lastError: ErrorEvent | null;
}

/** WorkerPool 统计信息 */
export interface WorkerPoolStats {
  total: number;
  idle: number;
  busy: number;
  crashed: number;
  terminated: number;
}

// ── Configuration ──

const HEARTBEAT_CHECK_INTERVAL_MS = 15_000;
/** Worker 超过此时间无心跳视为崩溃 | Worker considered crashed if no heartbeat for this long */
const HEARTBEAT_TIMEOUT_MS = 45_000;
/** 最大自动重启次数 | Max automatic restarts before giving up */
const MAX_AUTO_RESTARTS = 5;
/** 重启冷却期 | Backoff delay between restart attempts */
const RESTART_BACKOFF_MS = 3000;

// ── Pool ──

class WorkerPoolImpl {
  private readonly entries = new Map<string, WorkerPoolEntry>();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private readonly createWorker: Map<string, () => Worker> = new Map();

  /**
   * 注册一个 Worker 到池中。如果该 id 已有 Worker，先销毁旧的。
   * Register a worker in the pool. If an existing worker has the same id, it is terminated first.
   */
  register(id: string, label: string, factory: () => Worker): WorkerPoolEntry {
    this.deregister(id);
    this.createWorker.set(id, factory);

    const worker = factory();
    const entry: WorkerPoolEntry = {
      id,
      label,
      worker,
      state: 'idle',
      restartCount: 0,
      lastHeartbeatAt: Date.now(),
      lastError: null,
    };

    this.wire(entry);
    this.entries.set(id, entry);
    this.ensureHeartbeatLoop();
    log.info(`[WorkerPool] registered "${label}" (id=${id})`);
    return entry;
  }

  /** 从池中注销并终止 Worker | Deregister and terminate */
  deregister(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.silence(entry);
    entry.state = 'terminated';
    try { entry.worker.terminate(); } catch { /* already gone */ }
    this.createWorker.delete(id);
    this.entries.delete(id);
    log.info(`[WorkerPool] deregistered "${entry.label}" (id=${id})`);
  }

  /** 获取单个条目 | Get a single entry */
  get(id: string): WorkerPoolEntry | undefined {
    return this.entries.get(id);
  }

  /** 标记 Worker 忙碌 | Mark worker as busy */
  markBusy(id: string): void {
    const entry = this.entries.get(id);
    if (entry && entry.state === 'idle') entry.state = 'busy';
  }

  /** 标记 Worker 空闲 | Mark worker as idle */
  markIdle(id: string): void {
    const entry = this.entries.get(id);
    if (entry && entry.state === 'busy') entry.state = 'idle';
  }

  /** 获取统计信息 | Get stats */
  stats(): WorkerPoolStats {
    let idle = 0, busy = 0, crashed = 0, terminated = 0;
    for (const e of this.entries.values()) {
      switch (e.state) {
        case 'idle': idle++; break;
        case 'busy': busy++; break;
        case 'crashed': crashed++; break;
        case 'terminated': terminated++; break;
      }
    }
    return { total: this.entries.size, idle, busy, crashed, terminated };
  }

  /** 销毁整个池 | Destroy the entire pool */
  destroy(): void {
    this.stopHeartbeatLoop();
    for (const id of [...this.entries.keys()]) {
      this.deregister(id);
    }
    this.createWorker.clear();
  }

  // ── Internal ──

  private wire(entry: WorkerPoolEntry): void {
    entry.worker.onerror = (event: ErrorEvent) => {
      entry.lastError = event;
      entry.state = 'crashed';
      log.error(`[WorkerPool] "${entry.label}" crashed`, {
        message: event.message,
        filename: event.filename,
      });
      this.attemptRestart(entry);
    };

    const workerWithEvents = entry.worker as unknown as {
      addEventListener?: (type: 'message', listener: (ev: MessageEvent) => void) => void;
    };
    if (typeof workerWithEvents.addEventListener === 'function') {
      workerWithEvents.addEventListener('message', (ev: MessageEvent) => {
        // 心跳响应 | Heartbeat pong
        if (ev.data?.type === 'workerpool:pong') {
          entry.lastHeartbeatAt = Date.now();
          if (entry.state === 'crashed') entry.state = 'idle';
          return;
        }
        // 业务消息透传，不干扰 | Business messages pass through untouched
      });
    }
  }

  private silence(entry: WorkerPoolEntry): void {
    entry.worker.onerror = null;
  }

  private attemptRestart(entry: WorkerPoolEntry): void {
    if (entry.restartCount >= MAX_AUTO_RESTARTS) {
      log.error(
        `[WorkerPool] "${entry.label}" exceeded max restarts (${MAX_AUTO_RESTARTS}), giving up`,
      );
      return;
    }

    const factory = this.createWorker.get(entry.id);
    if (!factory) return;

    setTimeout(() => {
      if (entry.state === 'terminated') return;
      try { entry.worker.terminate(); } catch { /* already dead */ }
      const newWorker = factory();
      entry.restartCount += 1;
      // 替换 worker 引用 | Replace worker reference
      (entry as { worker: Worker }).worker = newWorker;
      entry.state = 'idle';
      entry.lastHeartbeatAt = Date.now();
      this.wire(entry);
      log.warn(
        `[WorkerPool] "${entry.label}" restarted (attempt ${entry.restartCount}/${MAX_AUTO_RESTARTS})`,
      );
    }, RESTART_BACKOFF_MS);
  }

  private ensureHeartbeatLoop(): void {
    if (this.heartbeatInterval !== null) return;
    this.heartbeatInterval = setInterval(() => {
      for (const entry of this.entries.values()) {
        if (entry.state === 'terminated') continue;
        // 发心跳 ping | Send heartbeat ping
        try {
          entry.worker.postMessage({ type: 'workerpool:ping' });
        } catch {
          // Worker 可能已关闭 | Worker may already be closed
        }
        // 检查超时 | Check timeout
        if (
          entry.state !== 'crashed'
          && Date.now() - entry.lastHeartbeatAt > HEARTBEAT_TIMEOUT_MS
        ) {
          entry.state = 'crashed';
          log.warn(`[WorkerPool] "${entry.label}" heartbeat timeout`);
          this.attemptRestart(entry);
        }
      }
    }, HEARTBEAT_CHECK_INTERVAL_MS);
  }

  private stopHeartbeatLoop(): void {
    if (this.heartbeatInterval !== null) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}

// ── Singleton ──

let instance: WorkerPoolImpl | null = null;

/** 获取 WorkerPool 单例 | Get the singleton WorkerPool */
export function getWorkerPool(): WorkerPoolImpl {
  if (!instance) {
    instance = new WorkerPoolImpl();
  }
  return instance;
}

/** 仅测试用：销毁并重置单例 | Test-only: destroy and reset singleton */
export function resetWorkerPoolForTest(): void {
  instance?.destroy();
  instance = null;
}

export type WorkerPool = WorkerPoolImpl;
