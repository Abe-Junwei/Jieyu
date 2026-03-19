import type { EmbeddingRuntimeProgress } from './EmbeddingRuntime';

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
}

const DEFAULT_DIMENSION = 256;

let cachedModelId = '';
let cachedExtractor: EmbeddingExtractor | null = null;
let cachedDegraded = false;
let cachedDegradedReason: string | undefined;

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

async function createTransformerExtractor(modelId: string, requestId: string): Promise<EmbeddingExtractor> {
  const transformers = await import('@xenova/transformers');
  const pipeline = await transformers.pipeline('feature-extraction', modelId, {
    progress_callback: (event: { progress?: number; loaded?: number; total?: number; status?: string }) => {
      const progress: EmbeddingRuntimeProgress = {
        stage: 'loading',
      };
      if (typeof event.loaded === 'number') progress.loaded = event.loaded;
      if (typeof event.total === 'number') progress.total = event.total;
      if (typeof event.status === 'string') progress.message = event.status;
      postProgress(requestId, {
        ...progress,
      });
    },
  });

  return async (text: string): Promise<number[]> => {
    const tensor = await pipeline(text, {
      pooling: 'mean',
      normalize: true,
    }) as { data?: Float32Array | number[] };

    if (Array.isArray(tensor.data)) return tensor.data;
    if (tensor.data instanceof Float32Array) return Array.from(tensor.data);
    return fallbackEmbedding(text);
  };
}

async function ensureExtractor(modelId: string, requestId: string, forceRetry = false): Promise<ExtractorState> {
  if (cachedExtractor && cachedModelId === modelId && !(forceRetry && cachedDegraded)) {
    return {
      extractor: cachedExtractor,
      degraded: cachedDegraded,
      ...(cachedDegradedReason ? { reason: cachedDegradedReason } : {}),
    };
  }

  try {
    cachedExtractor = await createTransformerExtractor(modelId, requestId);
    cachedModelId = modelId;
    cachedDegraded = false;
    cachedDegradedReason = undefined;
    return {
      extractor: cachedExtractor,
      degraded: false,
    };
  } catch (error) {
    cachedExtractor = async (text: string) => fallbackEmbedding(text);
    cachedModelId = modelId;
    cachedDegraded = true;
    cachedDegradedReason = error instanceof Error ? error.message : 'model load failed';
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
      const extractorState = await ensureExtractor(request.modelId, request.requestId, request.type === 'preload');
      const extractor = extractorState.extractor;

      if (request.type === 'preload') {
        postProgress(request.requestId, {
          stage: 'ready',
          usingFallback: extractorState.degraded,
          message: extractorState.degraded
            ? `fallback:${extractorState.reason ?? 'model unavailable'}`
            : 'model ready',
        });
        postResult(request.requestId, { ok: true, vectors: [] });
        return;
      }

      const vectors: number[][] = [];
      for (let i = 0; i < request.texts.length; i += 1) {
        const text = request.texts[i] ?? '';
        const vector = await extractor(text);
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
