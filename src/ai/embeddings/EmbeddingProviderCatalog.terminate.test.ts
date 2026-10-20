import { describe, expect, it, vi } from 'vitest';
import { createEmbeddingProvider } from './EmbeddingProviderCatalog';

vi.mock('./providers/LocalEmbeddingProvider', () => ({
  LocalEmbeddingProvider: class {
    constructor() {
      throw new Error('model load failed');
    }
  },
}));

describe('LazyEmbeddingProvider.terminate', () => {
  it('does not leak an unhandled rejection when the provider failed to load', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const provider = createEmbeddingProvider({ kind: 'local' });
      await expect(provider.embed(['x'])).rejects.toThrow('model load failed');
      provider.terminate();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});
