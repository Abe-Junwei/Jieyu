import type { EmbeddingSearchService } from './EmbeddingSearchService';
import type { EmbeddingProviderCreateConfig } from './EmbeddingProvider';

type SearchArgs = Parameters<EmbeddingSearchService['searchSimilarUnits']>;
type SearchResult = ReturnType<EmbeddingSearchService['searchSimilarUnits']>;
type MultiSourceArgs = Parameters<EmbeddingSearchService['searchMultiSource']>;
type MultiSourceResult = ReturnType<EmbeddingSearchService['searchMultiSource']>;
type MultiSourceHybridArgs = Parameters<EmbeddingSearchService['searchMultiSourceHybrid']>;
type MultiSourceHybridResult = ReturnType<EmbeddingSearchService['searchMultiSourceHybrid']>;

class DeferredEmbeddingSearchService {
  private servicePromise: Promise<EmbeddingSearchService> | null = null;
  private resolvedService: EmbeddingSearchService | null = null;

  constructor(private readonly getConfig: () => EmbeddingProviderCreateConfig) {}

  private async getService(): Promise<EmbeddingSearchService> {
    if (this.resolvedService) return this.resolvedService;
    if (!this.servicePromise) {
      this.servicePromise = Promise.all([
        import('./EmbeddingSearchService'),
        import('./EmbeddingProviderCatalog'),
      ]).then(([searchModule, providerModule]) => {
        const provider = providerModule.createEmbeddingProvider(this.getConfig());
        const service = new searchModule.EmbeddingSearchService(provider);
        this.resolvedService = service;
        return service;
      });
    }
    return this.servicePromise;
  }

  terminate(): void {
    this.resolvedService?.terminate();
  }

  async searchSimilarUnits(...args: SearchArgs): SearchResult {
    const service = await this.getService();
    return service.searchSimilarUnits(...args);
  }

  async searchMultiSource(...args: MultiSourceArgs): MultiSourceResult {
    const service = await this.getService();
    return service.searchMultiSource(...args);
  }

  async searchMultiSourceHybrid(...args: MultiSourceHybridArgs): MultiSourceHybridResult {
    const service = await this.getService();
    return service.searchMultiSourceHybrid(...args);
  }
}

export function createDeferredEmbeddingSearchService(
  getConfig: () => EmbeddingProviderCreateConfig,
): EmbeddingSearchService {
  return new DeferredEmbeddingSearchService(getConfig) as unknown as EmbeddingSearchService;
}