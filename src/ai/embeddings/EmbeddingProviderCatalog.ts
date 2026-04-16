/**
 * Embedding Provider Catalog
 *
 * Central registry for creating EmbeddingProvider instances by kind.
 * Add new providers here to make them available in the UI selector.
 *
 * Adding a new provider:
 *   1. Implement EmbeddingProvider in providers/
 *   2. Add definition + create() here
 *   3. Done — EmbeddingService picks it up via createEmbeddingProvider()
 */

import type { EmbeddingProvider, EmbeddingProviderCreateConfig, EmbeddingProviderDefinition, EmbeddingProviderKind } from './EmbeddingProvider';
import { ARCTIC_LOCAL_EMBEDDING_MODEL_ID, DEFAULT_LOCAL_EMBEDDING_MODEL_ID } from './localEmbeddingModelConfig';

class LazyEmbeddingProvider implements EmbeddingProvider {
  private providerPromise: Promise<EmbeddingProvider> | null = null;

  constructor(
    readonly kind: EmbeddingProviderKind,
    readonly label: string,
    readonly modelId: string,
    private readonly loadProvider: () => Promise<EmbeddingProvider>,
  ) {}

  private async getProvider(): Promise<EmbeddingProvider> {
    this.providerPromise ??= this.loadProvider();
    return this.providerPromise;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return (await this.getProvider()).embed(texts);
  }

  async isAvailable(): Promise<boolean> {
    return (await this.getProvider()).isAvailable();
  }

  async preload(options?: { onProgress?: (progress: { usingFallback?: boolean }) => void }): Promise<void> {
    const provider = await this.getProvider();
    await provider.preload?.(options);
  }

  terminate(): void {
    if (!this.providerPromise) return;
    void this.providerPromise.then((provider) => provider.terminate());
  }
}

function createLazyLocalProvider(config: EmbeddingProviderCreateConfig): EmbeddingProvider {
  return new LazyEmbeddingProvider(
    'local',
    'HuggingFace Local Embedding (\u672c\u5730)',
    config.model || DEFAULT_LOCAL_EMBEDDING_MODEL_ID,
    async () => {
      const module = await import('./providers/LocalEmbeddingProvider');
      return new module.LocalEmbeddingProvider(config);
    },
  );
}

function createLazyRemoteProvider(
  kind: 'openai-compatible' | 'minimax',
  config: EmbeddingProviderCreateConfig,
): EmbeddingProvider {
  const fallbackModel = kind === 'minimax' ? 'embo-01' : 'text-embedding-3-small';
  const label = kind === 'minimax' ? 'MiniMax Embedding (\u4ed8\u8d39)' : 'OpenAI Compatible Embedding (\u4ed8\u8d39)';
  return new LazyEmbeddingProvider(
    kind,
    label,
    config.model || fallbackModel,
    async () => {
      const module = await import('./providers/RemoteEmbeddingProvider');
      return new module.RemoteEmbeddingProvider(kind, config);
    },
  );
}

const PROVIDERS: Record<EmbeddingProviderKind, EmbeddingProviderDefinition> = {
  local: {
    kind: 'local',
    label: 'HuggingFace Local Embedding (\u672c\u5730)',
    description: `HuggingFace \u672c\u5730\u5411\u91cf\u6a21\u578b\uff0c\u5b8c\u5168\u79bb\u7ebf\u8fd0\u884c\u3002\u9ed8\u8ba4\u6a21\u578b\uff1a${DEFAULT_LOCAL_EMBEDDING_MODEL_ID}\uff1b\u5df2\u8bc4\u4f30\u5019\u9009\uff1a${ARCTIC_LOCAL_EMBEDDING_MODEL_ID}\u3002`,
    tag: '\u672c\u5730',
    fields: [
      {
        key: 'model',
        label: 'Model ID',
        type: 'text',
        placeholder: DEFAULT_LOCAL_EMBEDDING_MODEL_ID,
        required: false,
      },
    ],
    create: (cfg): EmbeddingProvider => createLazyLocalProvider(cfg),
  },
  'openai-compatible': {
    kind: 'openai-compatible',
    label: 'OpenAI Compatible (\u4ed8\u8d39)',
    description: '\u63a5\u5165 OpenAI \u517c\u5bb9\u7684 embedding \u63a5\u53e3\uff1aOpenAI\u3001Azure OpenAI\u3001OpenRouter\u3001\u7845\u57fa\u6d41\u52a8\u3001\u706b\u5c71\u5f15\u64ce\u7b49\u3002',
    tag: '\u4ed8\u8d39',
    fields: [
      { key: 'baseUrl', label: 'Base URL', type: 'text', placeholder: 'https://api.openai.com/v1', required: false },
      { key: 'model', label: 'Model', type: 'text', placeholder: 'text-embedding-3-small', required: false },
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-...', required: true },
    ],
    create: (cfg): EmbeddingProvider => createLazyRemoteProvider('openai-compatible', cfg),
  },
  minimax: {
    kind: 'minimax',
    label: 'MiniMax Embedding (\u514d\u8d39)',
    description: 'MiniMax AI embedding \u63a5\u53e3\uff0c\u56fd\u5185\u76f4\u8fde\uff0c\u6709\u514d\u8d39\u989d\u5ea6\u3002',
    tag: '\u56fd\u5185',
    fields: [
      { key: 'baseUrl', label: 'Base URL', type: 'text', placeholder: 'https://api.minimax.chat/v1\uff08\u7559\u7a7a\u9ed8\u8ba4\uff09', required: false },
      { key: 'model', label: 'Model', type: 'text', placeholder: 'embo-01\uff08\u7559\u7a7a\u9ed8\u8ba4\uff09', required: false },
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'eyJ...', required: true },
    ],
    create: (cfg): EmbeddingProvider => createLazyRemoteProvider('minimax', cfg),
  },
};

export function createEmbeddingProvider(config: EmbeddingProviderCreateConfig): EmbeddingProvider {
  return PROVIDERS[config.kind]?.create(config) ?? PROVIDERS['local'].create({ kind: 'local' });
}

/** Test whether an embedding provider is currently reachable / available. */
export async function testEmbeddingProvider(
  config: EmbeddingProviderCreateConfig,
): Promise<{ available: boolean; error?: string }> {
  try {
    const provider = createEmbeddingProvider(config);
    const available = await provider.isAvailable();
    return { available };
  } catch (err) {
    return { available: false, error: err instanceof Error ? err.message : String(err) };
  }
}
