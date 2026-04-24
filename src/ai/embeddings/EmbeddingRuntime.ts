import { nextPhysicalWorkerId } from '../../observability/managedWorkerRegistry';
import { trackBrowserWorkerLifecycle } from '../../observability/trackBrowserWorkerLifecycle';
import { PendingWorkerRequestStore } from '../../services/PendingWorkerRequestStore';

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
  /** 嵌入维度（降级用），如 384（Arctic-Embed-XS）| Embedding dimension for fallback, e.g. 384 for Arctic-Embed-XS */
  dimension?: number;
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
  /** 模型输出维度，用于降级哈希向量 | Model output dimension for fallback hash embedding */
  dimension?: number;
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

function newRequestId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeRetries(retries: number | undefined): number {
  if (!Number.isFinite(retries)) return 1;
  return Math.min(3, Math.max(1, Math.floor(retries ?? 1)));
}

export class WorkerEmbeddingRuntime implements EmbeddingRuntime {
  private worker: Worker | null = null;

  private workerTrackingRelease: (() => void) | null = null;

  private terminated = false;

  private readonly pending = new PendingWorkerRequestStore<WorkerResultMessage, EmbeddingRuntimeProgress>();

  constructor() {
    this.worker = this.createWorker();
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
        ...(options.dimension !== undefined && { dimension: options.dimension }),
      }, options.onProgress),
      normalizeRetries(options.retries),
    );

    return result.vectors ?? [];
  }

  terminate(): void {
    this.terminated = true;
    this.teardownWorker();
    this.pending.rejectAll(new Error('Embedding worker terminated'));
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
    const worker = this.ensureWorker();
    return this.pending.track(
      request.requestId,
      () => {
        try {
          worker.postMessage(request);
        } catch (error) {
          this.restartWorker();
          throw error instanceof Error ? error : new Error(String(error));
        }
      },
      {
        timeoutMs: 60_000,
        timeoutMessage: `Embedding request timed out after 60s (${request.requestId})`,
        ...(onProgress ? { onProgress } : {}),
      },
    );
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    if (this.terminated) {
      throw new Error('Embedding worker terminated');
    }
    this.worker = this.createWorker();
    return this.worker;
  }

  private createWorker(): Worker {
    this.workerTrackingRelease?.();
    this.workerTrackingRelease = null;
    const worker = new Worker(new URL('./embedding.worker.ts', import.meta.url), { type: 'module' });
    this.workerTrackingRelease = trackBrowserWorkerLifecycle(worker, {
      id: nextPhysicalWorkerId('embedding'),
      source: 'WorkerEmbeddingRuntime',
    });
    worker.onmessage = (event: MessageEvent<WorkerResponseMessage>) => {
      const payload = event.data;
      if (!this.pending.get(payload.requestId)) return;

      if (payload.type === 'progress') {
        this.pending.notifyProgress(payload.requestId, payload.progress);
        return;
      }

      if (payload.ok) {
        this.pending.resolve(payload.requestId, payload);
      } else {
        this.pending.reject(payload.requestId, new Error(payload.error ?? 'Embedding worker request failed'));
      }
    };

    worker.onerror = (event: ErrorEvent) => {
      const message = event.message?.trim() || 'Embedding worker runtime error';
      this.handleWorkerFailure(new Error(message));
    };

    worker.onmessageerror = () => {
      this.handleWorkerFailure(new Error('Embedding worker message decode error'));
    };

    return worker;
  }

  private handleWorkerFailure(error: Error): void {
    this.pending.rejectAll(error);
    if (!this.terminated) {
      this.restartWorker();
    }
  }

  private restartWorker(): void {
    this.teardownWorker();
    if (!this.terminated) {
      this.worker = this.createWorker();
    }
  }

  private teardownWorker(): void {
    if (!this.worker) return;
    this.workerTrackingRelease?.();
    this.workerTrackingRelease = null;
    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.worker.onmessageerror = null;
    this.worker.terminate();
    this.worker = null;
  }
}
