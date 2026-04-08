type PendingRequest<TResult, TProgress> = {
  resolve: (value: TResult) => void;
  reject: (reason?: unknown) => void;
  onProgress?: (progress: TProgress) => void;
  timer: ReturnType<typeof setTimeout> | null;
};

export interface PendingWorkerRequestOptions<TProgress> {
  timeoutMs?: number;
  timeoutMessage?: string;
  onProgress?: (progress: TProgress) => void;
}

export class PendingWorkerRequestStore<TResult, TProgress = never> {
  private readonly pending = new Map<string, PendingRequest<TResult, TProgress>>();

  get(requestId: string): PendingRequest<TResult, TProgress> | undefined {
    return this.pending.get(requestId);
  }

  track(
    requestId: string,
    start: () => void,
    options: PendingWorkerRequestOptions<TProgress> = {},
  ): Promise<TResult> {
    return new Promise<TResult>((resolve, reject) => {
      if (this.pending.has(requestId)) {
        reject(new Error(`Duplicate worker request id: ${requestId}`));
        return;
      }

      const timer = typeof options.timeoutMs === 'number' && options.timeoutMs > 0
        ? setTimeout(() => {
          const entry = this.pending.get(requestId);
          if (!entry) return;
          this.pending.delete(requestId);
          entry.reject(new Error(options.timeoutMessage ?? `Worker request timed out (${requestId})`));
        }, options.timeoutMs)
        : null;

      const finish = (): void => {
        if (timer !== null) {
          clearTimeout(timer);
        }
        this.pending.delete(requestId);
      };

      this.pending.set(requestId, {
        resolve: (value) => {
          finish();
          resolve(value);
        },
        reject: (reason) => {
          finish();
          reject(reason);
        },
        ...(options.onProgress ? { onProgress: options.onProgress } : {}),
        timer,
      });

      try {
        start();
      } catch (error) {
        this.reject(requestId, error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  resolve(requestId: string, value: TResult): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;
    entry.resolve(value);
    return true;
  }

  reject(requestId: string, error: Error): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;
    entry.reject(error);
    return true;
  }

  notifyProgress(requestId: string, progress: TProgress): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;
    entry.onProgress?.(progress);
    return true;
  }

  rejectAll(error: Error): void {
    const entries = Array.from(this.pending.values());
    this.pending.clear();
    entries.forEach((entry) => {
      if (entry.timer !== null) {
        clearTimeout(entry.timer);
      }
      entry.reject(error);
    });
  }
}