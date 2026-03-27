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

import type {
  EmbeddingProvider,
  EmbeddingProviderCreateConfig,
  EmbeddingProviderDefinition,
  EmbeddingProviderKind,
} from './EmbeddingProvider';

const DEFAULT_LOCAL_MODEL = 'Xenova/multilingual-e5-small';

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
    'Xenova E5 Small (本地)',
    config.model || DEFAULT_LOCAL_MODEL,
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
  const label = kind === 'minimax' ? 'MiniMax Embedding (付费)' : 'OpenAI Compatible Embedding (付费)';
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
    label: 'Xenova E5 Small (本地)',
    description: 'HuggingFace @xenova/transformers本地向量模型，完全离线运行。默认模型：Xenova/multilingual-e5-small。',
    tag: '本地',
    fields: [
      {
        key: 'model',
        label: 'Model ID',
        type: 'text',
        placeholder: 'Xenova/multilingual-e5-small',
        required: false,
      },
    ],
    create: (cfg): EmbeddingProvider => createLazyLocalProvider(cfg),
  },
  'openai-compatible': {
    kind: 'openai-compatible',
    label: 'OpenAI Compatible (付费)',
    description: '接入 OpenAI 兼容的 embedding 接口：OpenAI、Azure OpenAI、OpenRouter、硅基流动、火山引擎等。',
    tag: '付费',
    fields: [
      { key: 'baseUrl', label: 'Base URL', type: 'text', placeholder: 'https://api.openai.com/v1', required: false },
      { key: 'model', label: 'Model', type: 'text', placeholder: 'text-embedding-3-small', required: false },
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-...', required: true },
    ],
    create: (cfg): EmbeddingProvider => createLazyRemoteProvider('openai-compatible', cfg),
  },
  minimax: {
    kind: 'minimax',
    label: 'MiniMax Embedding (免费)',
    description: 'MiniMax AI embedding 接口，国内直连，有免费额度。',
    tag: '国内',
    fields: [
      { key: 'baseUrl', label: 'Base URL', type: 'text', placeholder: 'https://api.minimax.chat/v1（留空默认）', required: false },
      { key: 'model', label: 'Model', type: 'text', placeholder: 'embo-01（留空默认）', required: false },
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
