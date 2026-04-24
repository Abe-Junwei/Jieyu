import {
  shouldSuppressOutboundEcho,
  type CollaborationProjectChangeRecord,
} from './syncTypes';

export interface CollaborationOutboundQueueOptions {
  sender: (changes: CollaborationProjectChangeRecord[]) => Promise<void>;
  onFlushError?: (error: unknown, consecutiveFailures: number) => void;
  onPendingChanged?: (pending: CollaborationProjectChangeRecord[]) => void;
  initialPending?: CollaborationProjectChangeRecord[];
  flushIntervalMs?: number;
  maxBatchSize?: number;
  maxRetries?: number;
  dropBatchAfterMaxRetries?: boolean;
}

const DEFAULT_FLUSH_INTERVAL_MS = 1_000;
const DEFAULT_MAX_BATCH_SIZE = 50;
const DEFAULT_MAX_RETRIES = 8;
const DEFAULT_DROP_BATCH_AFTER_MAX_RETRIES = false;

/**
 * 内存 + 定时节流 flush。**持久化**由 `CollaborationSyncBridge` 在 `onPendingChanged` 内以
 * 防抖落盘 `CollaborationClientStateStore`（见 `OUTBOUND_PENDING_SAVE_DEBOUNCE_MS`），避免每次 `enqueue` 直接写
 * `localStorage`（对应 remediation HIGH-12）。
 */
export class CollaborationOutboundQueue {
  private readonly sender: (changes: CollaborationProjectChangeRecord[]) => Promise<void>;
  private readonly onFlushError: ((error: unknown, consecutiveFailures: number) => void) | undefined;
  private readonly onPendingChanged: ((pending: CollaborationProjectChangeRecord[]) => void) | undefined;
  private readonly flushIntervalMs: number;
  private readonly maxBatchSize: number;
  private readonly maxRetries: number;
  private readonly dropBatchAfterMaxRetries: boolean;
  private readonly pending: CollaborationProjectChangeRecord[];
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;
  private consecutiveFailures = 0;

  constructor(options: CollaborationOutboundQueueOptions) {
    this.sender = options.sender;
    this.onFlushError = options.onFlushError;
    this.onPendingChanged = options.onPendingChanged;
    this.flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    this.maxBatchSize = options.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.dropBatchAfterMaxRetries = options.dropBatchAfterMaxRetries ?? DEFAULT_DROP_BATCH_AFTER_MAX_RETRIES;
    this.pending = options.initialPending?.slice() ?? [];
  }

  private emitPendingChanged(): void {
    this.onPendingChanged?.(this.pending.slice());
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.flush();
    }, this.flushIntervalMs);
    // 启动后立即尝试补发，减少重连等待时间 | Attempt replay immediately on start
    void this.flush();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  enqueue(change: CollaborationProjectChangeRecord): void {
    if (shouldSuppressOutboundEcho(change.sourceKind)) {
      return;
    }

    this.pending.push(change);
    this.emitPendingChanged();
    if (this.pending.length >= this.maxBatchSize) {
      void this.flush();
    }
  }

  size(): number {
    return this.pending.length;
  }

  async flush(): Promise<void> {
    if (this.inFlight || this.pending.length === 0) {
      return;
    }

    this.inFlight = true;
    const batch = this.pending.splice(0, this.maxBatchSize);

    try {
      await this.sender(batch);
      this.consecutiveFailures = 0;
      this.emitPendingChanged();
    } catch (error) {
      this.consecutiveFailures += 1;
      const shouldDropBatch = this.dropBatchAfterMaxRetries && this.consecutiveFailures > this.maxRetries;
      if (!shouldDropBatch) {
        // 默认失败不丢弃，持续回退重试，避免静默数据丢失。
        // Keep retrying by default to avoid silent data loss.
        this.pending.unshift(...batch);
      }
      this.emitPendingChanged();
      this.onFlushError?.(error, this.consecutiveFailures);
    } finally {
      this.inFlight = false;
    }
  }
}
