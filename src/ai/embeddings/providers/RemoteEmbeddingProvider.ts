/**
 * RemoteEmbeddingProvider — OpenAI-compatible embedding API.
 *
 * Works with OpenAI, Azure OpenAI, OpenRouter, Groq, MiniMax, 硅基流动,
 * 火山引擎, and any other OpenAI-compatible embedding endpoint.
 *
 * Request: POST {baseUrl}/embeddings  (or /v1/embeddings)
 * Body: { input: string[], model: string }
 * Response: { data: [{ embedding: number[] }] }
 */

import type {
  EmbeddingProvider,
  EmbeddingProviderCreateConfig,
  OpenAIEmbeddingResponse,
} from '../EmbeddingProvider';

function normalizeBaseUrl(url: string | undefined, fallback: string): string {
  return (url ?? fallback).replace(/\/+$/, '');
}

export class RemoteEmbeddingProvider implements EmbeddingProvider {
  readonly kind: 'openai-compatible' | 'minimax';
  readonly label: string;
  readonly modelId: string;

  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    kind: 'openai-compatible' | 'minimax',
    config: EmbeddingProviderCreateConfig,
  ) {
    this.kind = kind;
    const isMinimax = kind === 'minimax';
    this.baseUrl = normalizeBaseUrl(
      config.baseUrl,
      isMinimax ? 'https://api.minimax.chat/v1' : 'https://api.openai.com/v1',
    );
    this.apiKey = config.apiKey ?? '';
    this.modelId = config.model || (isMinimax ? 'embo-01' : 'text-embedding-3-small');
    this.label = isMinimax ? 'MiniMax Embedding (付费)' : 'OpenAI Compatible Embedding (付费)';
  }

  async preload(_options?: { onProgress?: (progress: { usingFallback?: boolean }) => void }): Promise<void> {
    if (!this.apiKey) {
      throw new Error(`${this.label} 缺少 API Key`);
    }
    await this.embed(['health-check']);
  }

  /** Ping the remote endpoint with a minimal embed request to verify connectivity and credentials. */
  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const resp = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ input: ['health-check'], model: this.modelId }),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const body: Record<string, unknown> = {
      input: texts,
      model: this.modelId,
    };

    const resp = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      let msg = `Embedding API failed: ${resp.status}`;
      try {
        const err = await resp.json() as OpenAIEmbeddingResponse;
        msg = err.error?.message ?? msg;
      } catch { /* ignore */ }
      throw new Error(msg);
    }

    const json = await resp.json() as OpenAIEmbeddingResponse;

    if (json.error) {
      throw new Error(json.error.message ?? 'Embedding API returned an error');
    }

    const vectors: number[][] = new Array(texts.length).fill(null as unknown as number[]);
    for (const item of json.data ?? []) {
      const idx = item.index ?? 0;
      if (item.embedding) {
        vectors[idx] = item.embedding;
      }
    }

    // Fill any gaps with zero vectors.
    for (let i = 0; i < vectors.length; i += 1) {
      if (!vectors[i]) vectors[i] = [];
    }

    return vectors;
  }

  terminate(): void {
    // No persistent connections to close.
  }
}
