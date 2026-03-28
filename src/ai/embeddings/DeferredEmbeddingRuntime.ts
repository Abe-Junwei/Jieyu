import type { TaskRunner } from '../tasks/TaskRunner';
import type { EmbeddingProvider, EmbeddingProviderCreateConfig } from './EmbeddingProvider';
import type { EmbeddingSearchService } from './EmbeddingSearchService';
import type { EmbeddingService } from './EmbeddingService';

class DeferredEmbeddingRuntime {
  private providerPromise: Promise<EmbeddingProvider> | null = null;
  private resolvedProvider: EmbeddingProvider | null = null;
  private embeddingServicePromise: Promise<EmbeddingService> | null = null;
  private resolvedEmbeddingService: EmbeddingService | null = null;
  private embeddingSearchServicePromise: Promise<EmbeddingSearchService> | null = null;
  private resolvedEmbeddingSearchService: EmbeddingSearchService | null = null;

  constructor(
    private readonly getConfig: () => EmbeddingProviderCreateConfig,
    private readonly taskRunner: TaskRunner,
  ) {}

  private async getProvider(): Promise<EmbeddingProvider> {
    if (this.resolvedProvider) return this.resolvedProvider;
    if (!this.providerPromise) {
      this.providerPromise = import('./EmbeddingProviderCatalog').then((module) => {
        const provider = module.createEmbeddingProvider(this.getConfig());
        this.resolvedProvider = provider;
        return provider;
      });
    }
    return this.providerPromise;
  }

  async getEmbeddingService(): Promise<EmbeddingService> {
    if (this.resolvedEmbeddingService) return this.resolvedEmbeddingService;
    if (!this.embeddingServicePromise) {
      this.embeddingServicePromise = Promise.all([
        import('./EmbeddingService'),
        this.getProvider(),
      ]).then(([module, provider]) => {
        const service = new module.EmbeddingService(provider, this.taskRunner);
        this.resolvedEmbeddingService = service;
        return service;
      });
    }
    return this.embeddingServicePromise;
  }

  async getEmbeddingSearchService(): Promise<EmbeddingSearchService> {
    if (this.resolvedEmbeddingSearchService) return this.resolvedEmbeddingSearchService;
    if (!this.embeddingSearchServicePromise) {
      this.embeddingSearchServicePromise = Promise.all([
        import('./EmbeddingSearchService'),
        this.getProvider(),
      ]).then(([module, provider]) => {
        const service = new module.EmbeddingSearchService(provider);
        this.resolvedEmbeddingSearchService = service;
        return service;
      });
    }
    return this.embeddingSearchServicePromise;
  }

  terminate(): void {
    this.resolvedEmbeddingSearchService?.terminate();
    this.resolvedEmbeddingService?.terminate();
    if (!this.resolvedEmbeddingService && !this.resolvedEmbeddingSearchService) {
      this.resolvedProvider?.terminate();
    }
  }
}

class DeferredEmbeddingService {
  constructor(private readonly runtime: DeferredEmbeddingRuntime) {}

  terminate(): void {
    this.runtime.terminate();
  }

  async buildEmbeddings(...args: Parameters<EmbeddingService['buildEmbeddings']>): ReturnType<EmbeddingService['buildEmbeddings']> {
    const service = await this.runtime.getEmbeddingService();
    return service.buildEmbeddings(...args);
  }

  async buildNotesEmbeddings(...args: Parameters<EmbeddingService['buildNotesEmbeddings']>): ReturnType<EmbeddingService['buildNotesEmbeddings']> {
    const service = await this.runtime.getEmbeddingService();
    return service.buildNotesEmbeddings(...args);
  }

  async buildPdfEmbeddings(...args: Parameters<EmbeddingService['buildPdfEmbeddings']>): ReturnType<EmbeddingService['buildPdfEmbeddings']> {
    const service = await this.runtime.getEmbeddingService();
    return service.buildPdfEmbeddings(...args);
  }
}

class DeferredEmbeddingSearchRuntime {
  constructor(private readonly runtime: DeferredEmbeddingRuntime) {}

  terminate(): void {
    this.runtime.terminate();
  }

  async searchSimilarUtterances(...args: Parameters<EmbeddingSearchService['searchSimilarUtterances']>): ReturnType<EmbeddingSearchService['searchSimilarUtterances']> {
    const service = await this.runtime.getEmbeddingSearchService();
    return service.searchSimilarUtterances(...args);
  }

  async searchMultiSourceHybrid(...args: Parameters<EmbeddingSearchService['searchMultiSourceHybrid']>): ReturnType<EmbeddingSearchService['searchMultiSourceHybrid']> {
    const service = await this.runtime.getEmbeddingSearchService();
    return service.searchMultiSourceHybrid(...args);
  }
}

export function createDeferredEmbeddingRuntime(
  getConfig: () => EmbeddingProviderCreateConfig,
  taskRunner: TaskRunner,
): {
  embeddingService: EmbeddingService;
  embeddingSearchService: EmbeddingSearchService;
} {
  const runtime = new DeferredEmbeddingRuntime(getConfig, taskRunner);
  return {
    embeddingService: new DeferredEmbeddingService(runtime) as unknown as EmbeddingService,
    embeddingSearchService: new DeferredEmbeddingSearchRuntime(runtime) as unknown as EmbeddingSearchService,
  };
}