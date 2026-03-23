import { describe, expect, it, vi, afterEach } from 'vitest';
import { RemoteEmbeddingProvider } from './RemoteEmbeddingProvider';

describe('RemoteEmbeddingProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fails preload early when api key is missing', async () => {
    const provider = new RemoteEmbeddingProvider('openai-compatible', {
      kind: 'openai-compatible',
      model: 'text-embedding-3-small',
    });

    await expect(provider.preload()).rejects.toThrow('缺少 API Key');
  });

  it('surfaces preload connectivity errors instead of swallowing them', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down');
    }));

    const provider = new RemoteEmbeddingProvider('openai-compatible', {
      kind: 'openai-compatible',
      apiKey: 'sk-test',
      model: 'text-embedding-3-small',
    });

    await expect(provider.preload()).rejects.toThrow('network down');
  });
});