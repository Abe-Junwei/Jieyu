/**
 * TranscriptionPage - Persistence Helpers
 * 提取自 TranscriptionPage.tsx 的持久化辅助函数
 */

import type { EmbeddingProviderKind } from '../ai/embeddings/EmbeddingProvider';
import { createLogger } from '../observability/logger';

const log = createLogger('TranscriptionPage');

// ── Storage keys ───────────────────────────────────────────────────────────────

export const EMBEDDING_PROVIDER_STORAGE_KEY = 'jieyu.embeddingProvider';

export interface EmbeddingProviderConfig {
  kind: EmbeddingProviderKind;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

export function loadEmbeddingProviderConfig(): EmbeddingProviderConfig {
  try {
    const raw = window.localStorage.getItem(EMBEDDING_PROVIDER_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as EmbeddingProviderConfig;
  } catch (error) {
    log.warn('Failed to load embedding provider config, fallback to local', {
      storageKey: EMBEDDING_PROVIDER_STORAGE_KEY,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return { kind: 'local' };
}

export function saveEmbeddingProviderConfig(cfg: EmbeddingProviderConfig): void {
  try {
    window.localStorage.setItem(EMBEDDING_PROVIDER_STORAGE_KEY, JSON.stringify(cfg));
  } catch (error) {
    log.warn('Failed to persist embedding provider config', {
      storageKey: EMBEDDING_PROVIDER_STORAGE_KEY,
      kind: cfg.kind,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
