import type { EmbeddingRuntimeProgress } from './EmbeddingRuntime';
import {
  createFeatureExtractionPipelineWithFallback,
  configureTransformersEmbeddingRuntime,
  type TransformersFeatureExtractionPipeline,
  type TransformersEmbeddingRuntimeConfig,
} from './transformersRuntimeConfig';

type WorkerRequestType = 'preload' | 'embed';

interface WorkerRequestBase {
  requestId: string;
  type: WorkerRequestType;
  modelId: string;
}

interface WorkerPreloadRequest extends WorkerRequestBase {
  type: 'preload';
}

interface WorkerEmbedRequest extends WorkerRequestBase {
  type: 'embed';
  texts: string[];
  /** 模型输出维度，默认 384（e5-small / Arctic-Embed-XS）| Model output dimension, default 384 */
  dimension?: number;
}

type WorkerRequest = WorkerPreloadRequest | WorkerEmbedRequest;

interface WorkerResultMessage {
  type: 'result';
  requestId: string;
  ok: boolean;
  vectors?: number[][];
  error?: string;
}

interface WorkerProgressMessage {
  type: 'progress';
  requestId: string;
  progress: EmbeddingRuntimeProgress;
}

type EmbeddingExtractor = (text: string) => Promise<number[]>;

interface ExtractorState {
  extractor: EmbeddingExtractor;
  degraded: boolean;
  reason?: string;
  runtimeConfig?: TransformersEmbeddingRuntimeConfig;
}

const DEFAULT_DIMENSION = 384;
const DEGRADED_RETRY_COOLDOWN_MS = 30_000;

let cachedModelId = '';
let cachedExtractor: EmbeddingExtractor | null = null;
let cachedDegraded = false;
let cachedDegradedReason: string | undefined;
let cachedLoadedAt = 0;

function postProgress(requestId: string, progress: EmbeddingRuntimeProgress): void {
  const payload: WorkerProgressMessage = {
    type: 'progress',
    requestId,
    progress,
  };
  self.postMessage(payload);
}

function postResult(requestId: string, result: Omit<WorkerResultMessage, 'type' | 'requestId'>): void {
  self.postMessage({
    type: 'result',
    requestId,
    ...result,
  } satisfies WorkerResultMessage);
}

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function fallbackEmbedding(text: string, dimension = DEFAULT_DIMENSION): number[] {
  const vector = new Array<number>(dimension).fill(0);
  const normalized = text.toLowerCase().trim();
  if (!normalized) return vector;

  const tokens = normalized.split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    const tokenHash = fnv1a(token);
    const index = tokenHash % dimension;
    const weight = ((tokenHash >>> 8) % 1000) / 1000;
    vector[index] = (vector[index] ?? 0) + (0.5 + weight);
  }

  let sumSquares = 0;
  for (const value of vector) {
    sumSquares += value * value;
  }
  const norm = Math.sqrt(sumSquares);
  if (norm <= 0) return vector;

  return vector.map((value) => value / norm);
}

interface TransformerExtractorState {
  extractor: EmbeddingExtractor;
  runtimeConfig: TransformersEmbeddingRuntimeConfig;
}

function formatInitError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function createTransformerExtractor(modelId: string, requestId: string): Promise<TransformerExtractorState> {
  // 从 @huggingface/transformers v4 动态加载 | Dynamic import from @huggingface/transformers v4
  const transformers = await import('@huggingface/transformers');
  const workerHref = (self as unknown as { location?: { href?: string } }).location?.href;

  const runtimeConfig = await configureTransformersEmbeddingRuntime({
    transformers,
    ...(workerHref ? { workerHref } : {}),
  });

  const pipelineProgressCallback = (event: { progress?: number; loaded?: number; total?: number; status?: string }) => {
    const progress: EmbeddingRuntimeProgress = {
      stage: 'loading',
    };
    if (typeof event.loaded === 'number') progress.loaded = event.loaded;
    if (typeof event.total === 'number') progress.total = event.total;
    if (typeof event.status === 'string') progress.message = event.status;
    postProgress(requestId, {
      ...progress,
    });
  };

  const pipelineState = await createFeatureExtractionPipelineWithFallback({
    transformers,
    modelId,
    preferredDevice: runtimeConfig.device,
    progressCallback: pipelineProgressCallback,
    onWebgpuFallback: (error) => {
      postProgress(requestId, {
        stage: 'loading',
        message: `webgpu init failed; retry wasm: ${formatInitError(error)}`,
      });
    },
  });

  const resolvedRuntimeConfig = pipelineState.device === runtimeConfig.device
    ? runtimeConfig
    : {
      ...runtimeConfig,
      device: pipelineState.device,
    };
  const pipeline: TransformersFeatureExtractionPipeline = pipelineState.pipeline;

  return {
    runtimeConfig: resolvedRuntimeConfig,
    extractor: async (text: string): Promise<number[]> => {
      const tensor = await pipeline(text, {
        pooling: 'mean',
        normalize: true,
      }) as { data?: Float32Array | number[] };

      if (Array.isArray(tensor.data)) return tensor.data;
      if (tensor.data instanceof Float32Array) return Array.from(tensor.data);
      return fallbackEmbedding(text);
    },
  };
}

async function ensureExtractor(modelId: string, requestId: string): Promise<ExtractorState> {
  const degradedCooldownElapsed = cachedDegraded && (Date.now() - cachedLoadedAt >= DEGRADED_RETRY_COOLDOWN_MS);
  if (cachedExtractor && cachedModelId === modelId && !degradedCooldownElapsed) {
    return {
      extractor: cachedExtractor,
      degraded: cachedDegraded,
      ...(cachedDegradedReason ? { reason: cachedDegradedReason } : {}),
    };
  }

  try {
    const transformerState = await createTransformerExtractor(modelId, requestId);
    cachedExtractor = transformerState.extractor;
    cachedModelId = modelId;
    cachedDegraded = false;
    cachedDegradedReason = undefined;
    cachedLoadedAt = Date.now();
    return {
      extractor: cachedExtractor,
      degraded: false,
      runtimeConfig: transformerState.runtimeConfig,
    };
  } catch (error) {
    cachedExtractor = async (text: string) => fallbackEmbedding(text);
    cachedModelId = modelId;
    cachedDegraded = true;
    cachedDegradedReason = error instanceof Error ? error.message : 'model load failed';
    cachedLoadedAt = Date.now();
    return {
      extractor: cachedExtractor,
      degraded: true,
      ...(cachedDegradedReason ? { reason: cachedDegradedReason } : {}),
    };
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  void (async () => {
    const request = event.data;

    try {
      const extractorState = await ensureExtractor(request.modelId, request.requestId);
      const extractor = extractorState.extractor;

      if (request.type === 'preload') {
        postProgress(request.requestId, {
          stage: 'ready',
          usingFallback: extractorState.degraded,
          message: extractorState.degraded
            ? `fallback:${extractorState.reason ?? 'model unavailable'}`
            : `model ready; device=${extractorState.runtimeConfig?.device ?? 'unknown'}; cache=${extractorState.runtimeConfig?.browserCacheEnabled ? 'browser' : 'off'}${extractorState.runtimeConfig?.cacheDir ? `; cacheDir=${extractorState.runtimeConfig.cacheDir}` : ''}`,
        });
        postResult(request.requestId, { ok: true, vectors: [] });
        return;
      }

      // 降级提取器需使用请求中的维度 | Degraded extractor should use request dimension
      const dim = request.type === 'embed' ? request.dimension : undefined;
      const wrappedExtractor: EmbeddingExtractor = extractorState.degraded && dim
        ? (text) => Promise.resolve(fallbackEmbedding(text, dim))
        : extractor;

      const vectors: number[][] = [];
      for (let i = 0; i < request.texts.length; i += 1) {
        const text = request.texts[i] ?? '';
        const vector = await wrappedExtractor(text);
        vectors.push(vector);
        postProgress(request.requestId, {
          stage: 'embedding',
          processed: i + 1,
          totalItems: request.texts.length,
        });
      }

      postResult(request.requestId, { ok: true, vectors });
    } catch (error) {
      postResult(request.requestId, {
        ok: false,
        error: error instanceof Error ? error.message : 'Embedding worker failed',
      });
    }
  })();
};
