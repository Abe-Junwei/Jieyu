/**
 * LocalEmbeddingProvider — local embedding via @huggingface/transformers.
 *
 * Wraps WorkerEmbeddingRuntime and exposes the EmbeddingProvider interface.
 * Model: Xenova/multilingual-e5-small (or any HuggingFace feature-extraction model).
 * 运行时自动选择 WebGPU / WASM，并启用 OPFS 离线缓存。
 * Runtime auto-selects WebGPU / WASM and enables OPFS offline cache.
 */

import type { EmbeddingProvider, EmbeddingProviderCreateConfig } from '../EmbeddingProvider';
import type { EmbeddingRuntimeOptions } from '../EmbeddingRuntime';
import { WorkerEmbeddingRuntime } from '../EmbeddingRuntime';
import {
  DEFAULT_LOCAL_EMBEDDING_DIMENSION,
  DEFAULT_LOCAL_EMBEDDING_MODEL_ID,
  getLocalEmbeddingModelDisplayName,
} from '../localEmbeddingModelConfig';

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly kind = 'local';
  readonly label: string;
  readonly modelId: string;

  private readonly runtime = new WorkerEmbeddingRuntime();
  private _preloaded = false;

  constructor(config: EmbeddingProviderCreateConfig = { kind: 'local' }) {
    this.modelId = config.model || DEFAULT_LOCAL_EMBEDDING_MODEL_ID;
    this.label = `${getLocalEmbeddingModelDisplayName(this.modelId)} (本地)`;
  }

  async preload(options?: { onProgress?: (progress: { usingFallback?: boolean }) => void }): Promise<void> {
    if (this._preloaded) return;
    const preloadOptions: EmbeddingRuntimeOptions = {
      modelId: this.modelId,
      onProgress: (progress) => {
        if (progress.usingFallback) {
          options?.onProgress?.({ usingFallback: true });
        }
      },
    };
    await this.runtime.preload(preloadOptions);
    // 预热成功返回后即视为已初始化；若当前是 fallback，worker 会在冷却后自动重试真实模型。
    // Once preload succeeds, treat runtime as initialized even if currently degraded.
    this._preloaded = true;
  }

  /** Local provider is available if the runtime is responsive (model preloaded or loads on first use). */
  async isAvailable(): Promise<boolean> {
    try {
      // Try a single-vector embed to verify the worker is alive
      await this.embed(['health-check']);
      return true;
    } catch (err) {
      console.error('[Jieyu] LocalEmbeddingProvider: health check failed', err);
      return false;
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    const options: EmbeddingRuntimeOptions = { modelId: this.modelId, dimension: DEFAULT_LOCAL_EMBEDDING_DIMENSION };
    return this.runtime.embed(texts, options);
  }

  terminate(): void {
    this.runtime.terminate();
    this._preloaded = false;
  }
}
