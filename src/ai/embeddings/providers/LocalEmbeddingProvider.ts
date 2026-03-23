/**
 * LocalEmbeddingProvider — local embedding via @xenova/transformers.
 *
 * Wraps WorkerEmbeddingRuntime and exposes the EmbeddingProvider interface.
 * Model: Xenova/multilingual-e5-small (or any HuggingFace feature-extraction model).
 */

import type { EmbeddingProvider, EmbeddingProviderCreateConfig } from '../EmbeddingProvider';
import type { EmbeddingRuntimeOptions } from '../EmbeddingRuntime';
import { WorkerEmbeddingRuntime } from '../EmbeddingRuntime';

const DEFAULT_MODEL = 'Xenova/multilingual-e5-small';

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly kind = 'local';
  readonly label = 'Xenova E5 Small (本地)';
  readonly modelId: string;

  private readonly runtime = new WorkerEmbeddingRuntime();
  private _preloaded = false;

  constructor(config: EmbeddingProviderCreateConfig = { kind: 'local' }) {
    this.modelId = config.model || DEFAULT_MODEL;
  }

  async preload(options?: { onProgress?: (progress: { usingFallback?: boolean }) => void }): Promise<void> {
    if (this._preloaded) return;
    let usingFallback = false;
    const preloadOptions: EmbeddingRuntimeOptions = {
      modelId: this.modelId,
      onProgress: (progress) => {
        if (progress.usingFallback) {
          usingFallback = true;
          options?.onProgress?.({ usingFallback: true });
        }
      },
    };
    await this.runtime.preload(preloadOptions);
    this._preloaded = !usingFallback;
  }

  /** Local provider is available if the runtime is responsive (model preloaded or loads on first use). */
  async isAvailable(): Promise<boolean> {
    try {
      // Try a single-vector embed to verify the worker is alive
      await this.embed(['health-check']);
      return true;
    } catch {
      return false;
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    const options: EmbeddingRuntimeOptions = { modelId: this.modelId };
    return this.runtime.embed(texts, options);
  }

  terminate(): void {
    this.runtime.terminate();
    this._preloaded = false;
  }
}
