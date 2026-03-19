export type EmbeddingProgressStage = 'loading' | 'embedding' | 'ready';

export interface EmbeddingRuntimeProgress {
  stage: EmbeddingProgressStage;
  loaded?: number;
  total?: number;
  processed?: number;
  totalItems?: number;
  message?: string;
  /** True when the model failed to load and FNV-hash fallback is being used */
  usingFallback?: boolean;
}

export interface EmbeddingRuntimeOptions {
  modelId: string;
  retries?: number;
  onProgress?: (progress: EmbeddingRuntimeProgress) => void;
}

export interface EmbeddingRuntime {
  preload(options: EmbeddingRuntimeOptions): Promise<void>;
  embed(texts: string[], options: EmbeddingRuntimeOptions): Promise<number[][]>;
  terminate(): void;
}

type WorkerRequestType = 'preload' | 'embed';

interface WorkerRequestBase {
  requestId: string;
  type: WorkerRequestType;
  modelId: string;
}

interface WorkerPreloadRequest extends WorkerRequestBase {
  type: 'preload';
}

interface WorkerEmbedRequest extends WorkerRequestBase {
  type: 'embed';
  texts: string[];
}

type WorkerRequest = WorkerPreloadRequest | WorkerEmbedRequest;

interface WorkerResultMessage {
  type: 'result';
  requestId: string;
  ok: boolean;
  vectors?: number[][];
  error?: string;
}

interface WorkerProgressMessage {
  type: 'progress';
  requestId: string;
  progress: EmbeddingRuntimeProgress;
}

type WorkerResponseMessage = WorkerResultMessage | WorkerProgressMessage;

interface PendingRequest {
  resolve: (value: WorkerResultMessage) => void;
  reject: (reason?: unknown) => void;
  onProgress?: (progress: EmbeddingRuntimeProgress) => void;
}

function newRequestId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeRetries(retries: number | undefined): number {
  if (!Number.isFinite(retries)) return 1;
  return Math.min(3, Math.max(1, Math.floor(retries ?? 1)));
}

export class WorkerEmbeddingRuntime implements EmbeddingRuntime {
  private readonly worker: Worker;

  private readonly pending = new Map<string, PendingRequest>();

  constructor() {
    this.worker = new Worker(new URL('./embedding.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<WorkerResponseMessage>) => {
      const payload = event.data;
      const pending = this.pending.get(payload.requestId);
      if (!pending) return;

      if (payload.type === 'progress') {
        pending.onProgress?.(payload.progress);
        return;
      }

      this.pending.delete(payload.requestId);
      if (payload.ok) {
        pending.resolve(payload);
      } else {
        pending.reject(new Error(payload.error ?? 'Embedding worker request failed'));
      }
    };

    this.worker.onerror = (event: ErrorEvent) => {
      const message = event.message?.trim() || 'Embedding worker runtime error';
      this.rejectAllPending(new Error(message));
    };

    this.worker.onmessageerror = () => {
      this.rejectAllPending(new Error('Embedding worker message decode error'));
    };
  }

  async preload(options: EmbeddingRuntimeOptions): Promise<void> {
    await this.runWithRetry(
      () => this.postRequest({
        requestId: newRequestId('embed_preload'),
        type: 'preload',
        modelId: options.modelId,
      }, options.onProgress),
      normalizeRetries(options.retries),
    );
  }

  async embed(texts: string[], options: EmbeddingRuntimeOptions): Promise<number[][]> {
    if (texts.length === 0) return [];

    const result = await this.runWithRetry(
      () => this.postRequest({
        requestId: newRequestId('embed_run'),
        type: 'embed',
        modelId: options.modelId,
        texts,
      }, options.onProgress),
      normalizeRetries(options.retries),
    );

    return result.vectors ?? [];
  }

  terminate(): void {
    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.worker.onmessageerror = null;
    this.worker.terminate();
    this.rejectAllPending(new Error('Embedding worker terminated'));
  }

  private async runWithRetry<T>(runner: () => Promise<T>, retries: number): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        return await runner();
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Embedding runtime request failed');
  }

  private postRequest(request: WorkerRequest, onProgress?: (progress: EmbeddingRuntimeProgress) => void): Promise<WorkerResultMessage> {
    return new Promise<WorkerResultMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(request.requestId)) {
          reject(new Error(`Embedding request timed out after 60s (${request.requestId})`));
        }
      }, 60_000);
      const wrappedResolve = (value: WorkerResultMessage) => { clearTimeout(timer); resolve(value); };
      const wrappedReject = (reason?: unknown) => { clearTimeout(timer); reject(reason); };
      this.pending.set(request.requestId, onProgress
        ? { resolve: wrappedResolve, reject: wrappedReject, onProgress }
        : { resolve: wrappedResolve, reject: wrappedReject });
      this.worker.postMessage(request);
    });
  }

  private rejectAllPending(error: Error): void {
    for (const entry of this.pending.values()) {
      entry.reject(error);
    }
    this.pending.clear();
  }
}
