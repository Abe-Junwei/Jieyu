/**
 * Embedding Provider Interface
 *
 * Pluggable interface for embedding models — local (@xenova/transformers) or remote (REST API).
 *
 * Design: each provider wraps an EmbeddingRuntime and exposes a simpler `embed(texts)`
 * surface. The registry (EmbeddingProviderCatalog.ts) creates providers by kind.
 */

export type EmbeddingProviderKind = 'local' | 'openai-compatible' | 'minimax';

export interface EmbeddingProviderDefinition {
  kind: EmbeddingProviderKind;
  label: string;
  description: string;
  /** Short tag shown in the UI list, e.g. "本地" or "付费" */
  tag?: string;
  fields: EmbeddingProviderFieldDefinition[];
  create(config: EmbeddingProviderCreateConfig): EmbeddingProvider;
}

export interface EmbeddingProviderFieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'password' | 'select';
  placeholder: string;
  required: boolean;
  options?: Array<{ value: string; label: string }>;
}

export interface EmbeddingProviderCreateConfig {
  kind: EmbeddingProviderKind;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

export interface EmbeddingProvider {
  readonly kind: EmbeddingProviderKind;
  readonly label: string;
  readonly modelId: string;
  /** Embed a batch of texts into vectors. */
  embed(texts: string[]): Promise<number[][]>;
  /** Check whether this provider is currently available (network可达、凭据有效、本地模型已加载). */
  isAvailable(): Promise<boolean>;
  /**
   * Optional warm-up (e.g., preload local model, ping remote endpoint).
   * May receive an optional progress callback to signal when a fallback embedding
   * (FNV hash) is being used because the primary model is unavailable.
   */
  preload?(options?: { onProgress?: (progress: { usingFallback?: boolean }) => void }): Promise<void>;
  /** Release resources (terminate worker or close connections). */
  terminate(): void;
}

// ─── Remote API response shapes ──────────────────────────────────────────────

export interface OpenAIEmbeddingResponse {
  object?: string;
  data?: Array<{ object?: string; embedding?: number[]; index?: number }>;
  model?: string;
  error?: { message?: string; type?: string };
}
