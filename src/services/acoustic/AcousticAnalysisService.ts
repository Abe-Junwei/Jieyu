import { PendingWorkerRequestStore } from '../PendingWorkerRequestStore';
import { createLogger } from '../../observability/logger';
import { buildAcousticCacheKey, DEFAULT_ACOUSTIC_ANALYSIS_CONFIG, type AcousticAnalysisConfig, type AcousticAnalysisProgress, type AcousticFeatureResult } from '../../utils/acousticOverlayTypes';
import { acousticAnalysisCacheDB } from './AcousticAnalysisCacheDB';
import { isAllowedExternalProviderEndpoint, type AcousticProviderAnalyzeInput, type AcousticProviderRuntimeConfig, type ExternalAcousticProviderConfig, LOCAL_ACOUSTIC_PROVIDER_DEFINITION, resolveAcousticProviderRuntimeConfig, resolveAcousticProviderState, type ResolvedAcousticProviderState } from './acousticProviderContract';

const log = createLogger('AcousticAnalysisService');

interface AudioResponseLike {
  ok: boolean;
  status?: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

interface AudioContextLike {
  decodeAudioData: (audioData: ArrayBuffer) => Promise<AudioBuffer>;
  close?: () => Promise<void> | void;
}

interface WorkerLike {
  onmessage: ((event: MessageEvent<AcousticWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage: (message: AcousticWorkerRequest, transfer?: Transferable[]) => void;
  terminate: () => void;
}

interface AcousticAnalyzeWorkerRequest {
  requestId: string;
  type: 'analyze';
  mediaKey: string;
  pcm: Float32Array;
  sampleRate: number;
  config: AcousticAnalysisConfig;
}

interface AcousticCancelWorkerRequest {
  requestId: string;
  type: 'cancel';
}

type AcousticWorkerRequest = AcousticAnalyzeWorkerRequest | AcousticCancelWorkerRequest;

interface AcousticWorkerProgress {
  type: 'progress';
  requestId: string;
  progress: AcousticAnalysisProgress;
}

interface AcousticWorkerResult {
  type: 'result';
  requestId: string;
  ok: boolean;
  result?: AcousticFeatureResult;
  error?: string;
}

type AcousticWorkerResponse = AcousticWorkerProgress | AcousticWorkerResult;

interface AnalyzeRequestOptions {
  signal?: AbortSignal;
  onProgress?: (progress: AcousticAnalysisProgress) => void;
}

interface AnalyzeMediaInput extends AnalyzeRequestOptions {
  mediaKey: string;
  mediaUrl: string;
  config?: Partial<AcousticAnalysisConfig>;
  providerId?: string;
}

interface AnalyzeAudioBufferInput extends AnalyzeRequestOptions {
  mediaKey: string;
  audioBuffer: AudioBuffer;
  config?: Partial<AcousticAnalysisConfig>;
  providerId?: string;
}

interface AnalyzeAudioBufferExecutionInput extends AnalyzeAudioBufferInput {
  runtimeConfig: AcousticProviderRuntimeConfig;
  providerState: ResolvedAcousticProviderState;
}

interface AcousticAnalysisServiceOptions {
  fetchImpl?: (input: string) => Promise<AudioResponseLike>;
  audioContextFactory?: () => AudioContextLike;
  workerFactory?: () => WorkerLike;
  providerRuntimeConfigResolver?: () => AcousticProviderRuntimeConfig;
  externalProviderAnalyze?: (input: AcousticProviderAnalyzeInput & {
    providerId: string;
    externalConfig: ExternalAcousticProviderConfig;
  }) => Promise<AcousticFeatureResult>;
  now?: () => number;
}

interface CacheEntry {
  result: AcousticFeatureResult;
  cachedAt: number;
  lastAccessedAt: number;
}

const MAX_CACHE_ENTRIES = 8;
const MAX_EXTERNAL_PROVIDER_PCM_BYTES = 64 * 1024 * 1024;

function createBrowserAudioContext(): AudioContextLike {
  const AudioContextCtor = window.AudioContext ?? (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error('AudioContext unavailable');
  }
  return new AudioContextCtor();
}

function normalizeConfig(config?: Partial<AcousticAnalysisConfig>): AcousticAnalysisConfig {
  return {
    ...DEFAULT_ACOUSTIC_ANALYSIS_CONFIG,
    ...config,
  };
}

function buildRequestId(): string {
  return `acoustic-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function downmixToMono(audioBuffer: AudioBuffer): Float32Array {
  const mono = new Float32Array(audioBuffer.length);
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const channelData = audioBuffer.getChannelData(channel);
    for (let index = 0; index < channelData.length; index += 1) {
      mono[index] = (mono[index] ?? 0) + (channelData[index] ?? 0);
    }
  }
  if (audioBuffer.numberOfChannels > 1) {
    const gain = 1 / audioBuffer.numberOfChannels;
    for (let index = 0; index < mono.length; index += 1) {
      mono[index] = (mono[index] ?? 0) * gain;
    }
  }
  return mono;
}

function createAbortError(): Error {
  const error = new Error('Acoustic analysis aborted');
  error.name = 'AbortError';
  return error;
}

function wrapPromiseWithSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(createAbortError());
  }
  return new Promise<T>((resolve, reject) => {
    const handleAbort = () => {
      signal.removeEventListener('abort', handleAbort);
      reject(createAbortError());
    };
    signal.addEventListener('abort', handleAbort, { once: true });
    promise.then((value) => {
      signal.removeEventListener('abort', handleAbort);
      resolve(value);
    }).catch((error) => {
      signal.removeEventListener('abort', handleAbort);
      reject(error);
    });
  });
}

async function closeAudioContext(audioContext: AudioContextLike | null): Promise<void> {
  if (!audioContext?.close) return;
  try {
    await audioContext.close();
  } catch (error) {
    log.warn('Failed to close acoustic AudioContext', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export class AcousticAnalysisService {
  private static instance: AcousticAnalysisService | null = null;

  static getInstance(): AcousticAnalysisService {
    if (!AcousticAnalysisService.instance) {
      AcousticAnalysisService.instance = new AcousticAnalysisService();
    }
    return AcousticAnalysisService.instance;
  }

  private readonly cache = new Map<string, CacheEntry>();
  private readonly pending = new Map<string, Promise<AcousticFeatureResult>>();
  private readonly fetchImpl: AcousticAnalysisServiceOptions['fetchImpl'];
  private readonly audioContextFactory: AcousticAnalysisServiceOptions['audioContextFactory'];
  private readonly workerFactory: AcousticAnalysisServiceOptions['workerFactory'];
  private readonly providerRuntimeConfigResolver: NonNullable<AcousticAnalysisServiceOptions['providerRuntimeConfigResolver']>;
  private readonly externalProviderAnalyzeImpl: NonNullable<AcousticAnalysisServiceOptions['externalProviderAnalyze']>;
  private readonly now: NonNullable<AcousticAnalysisServiceOptions['now']>;
  private worker: WorkerLike | null = null;
  private readonly pendingWorkerRequests = new PendingWorkerRequestStore<AcousticFeatureResult, AcousticAnalysisProgress>();

  constructor(options: AcousticAnalysisServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? (async (input: string) => {
      const response = await fetch(input);
      return response as AudioResponseLike;
    });
    this.audioContextFactory = options.audioContextFactory ?? createBrowserAudioContext;
    this.workerFactory = options.workerFactory ?? (() => new Worker(
      new URL('./acousticAnalysis.worker.ts', import.meta.url),
      { type: 'module' },
    ) as unknown as WorkerLike);
    this.providerRuntimeConfigResolver = options.providerRuntimeConfigResolver ?? resolveAcousticProviderRuntimeConfig;
    this.externalProviderAnalyzeImpl = options.externalProviderAnalyze ?? this.analyzeWithExternalProvider.bind(this);
    this.now = options.now ?? Date.now;
  }

  private resolveRuntimeConfig(): AcousticProviderRuntimeConfig {
    return this.providerRuntimeConfigResolver();
  }

  private buildProviderCacheScope(
    providerState: ResolvedAcousticProviderState,
    runtimeConfig: AcousticProviderRuntimeConfig,
  ): string {
    if (providerState.effectiveProviderId !== 'enhanced-provider') {
      return providerState.effectiveProviderId;
    }
    const endpoint = runtimeConfig.externalProvider.endpoint?.trim() ?? 'unconfigured';
    return `${providerState.effectiveProviderId}:${endpoint}`;
  }

  async analyzeMedia(input: AnalyzeMediaInput): Promise<AcousticFeatureResult> {
    const config = normalizeConfig(input.config);
    const runtimeConfig = this.resolveRuntimeConfig();
    const providerState = resolveAcousticProviderState(input.providerId, { runtimeConfig });
    const providerCacheScope = this.buildProviderCacheScope(providerState, runtimeConfig);
    const providerAwareMediaKey = `${input.mediaKey}::${providerCacheScope}`;
    const cacheKey = buildAcousticCacheKey(providerAwareMediaKey, config);
    return this.runCachedAnalysis(cacheKey, input.mediaKey, async (options) => {
      if (providerState.fellBackToLocal) {
        log.info('Acoustic provider unavailable, falling back to local provider', {
          requestedProviderId: providerState.requestedProviderId,
          effectiveProviderId: providerState.effectiveProviderId,
          reason: providerState.fallbackReason,
        });
      }
      let audioContext: AudioContextLike | null = null;
      try {
        if (options.signal?.aborted) {
          throw createAbortError();
        }
        const response = await this.fetchImpl?.(input.mediaUrl);
        if (!response?.ok) {
          throw new Error(`Failed to fetch audio: ${response?.status ?? 'unknown'}`);
        }
        const audioBytes = await response.arrayBuffer();
        audioContext = this.audioContextFactory?.() ?? createBrowserAudioContext();
        const audioBuffer = await audioContext.decodeAudioData(audioBytes);
        return this.performAnalyzeAudioBuffer({
          mediaKey: input.mediaKey,
          audioBuffer,
          config,
          providerId: providerState.requestedProviderId,
          runtimeConfig,
          providerState,
          ...(options.signal ? { signal: options.signal } : {}),
          ...(options.onProgress ? { onProgress: options.onProgress } : {}),
        });
      } finally {
        await closeAudioContext(audioContext);
      }
    }, input);
  }

  async analyzeAudioBuffer(input: AnalyzeAudioBufferInput): Promise<AcousticFeatureResult> {
    const config = normalizeConfig(input.config);
    const runtimeConfig = this.resolveRuntimeConfig();
    const providerState = resolveAcousticProviderState(input.providerId, { runtimeConfig });
    const providerCacheScope = this.buildProviderCacheScope(providerState, runtimeConfig);
    const providerAwareMediaKey = `${input.mediaKey}::${providerCacheScope}`;
    const cacheKey = buildAcousticCacheKey(providerAwareMediaKey, config);
    return this.runCachedAnalysis(cacheKey, input.mediaKey, (options) => this.performAnalyzeAudioBuffer({
      mediaKey: input.mediaKey,
      audioBuffer: input.audioBuffer,
      config,
      providerId: providerState.requestedProviderId,
      runtimeConfig,
      providerState,
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.onProgress ? { onProgress: options.onProgress } : {}),
    }), input);
  }

  resolveProviderState(preferredProviderId?: string | null): ResolvedAcousticProviderState {
    return resolveAcousticProviderState(preferredProviderId, { runtimeConfig: this.resolveRuntimeConfig() });
  }

  private async runCachedAnalysis(
    cacheKey: string,
    mediaKey: string,
    runner: (options: AnalyzeRequestOptions) => Promise<AcousticFeatureResult>,
    options: AnalyzeRequestOptions,
  ): Promise<AcousticFeatureResult> {
    if (options.signal?.aborted) {
      throw createAbortError();
    }

    const cached = await this.getCached(cacheKey);
    if (cached) return cached;

    const pending = this.pending.get(cacheKey);
    if (pending) return wrapPromiseWithSignal(pending, options.signal);

    const task = (async () => {
      const result = await runner(options);
      await this.setCached(cacheKey, mediaKey, result);
      return result;
    })().finally(() => {
      this.pending.delete(cacheKey);
    });

    this.pending.set(cacheKey, task);
    if (options.signal) {
      task.catch(() => undefined);
    }
    return task;
  }

  private async dispatchToWorker(request: AcousticAnalyzeWorkerRequest, options: AnalyzeRequestOptions = {}): Promise<AcousticFeatureResult> {
    if (options.signal?.aborted) {
      throw createAbortError();
    }

    const worker = this.ensureWorker();
    const abortListener = () => {
      this.pendingWorkerRequests.reject(request.requestId, createAbortError());
      worker.postMessage({ type: 'cancel', requestId: request.requestId });
    };
    if (options.signal) {
      options.signal.addEventListener('abort', abortListener, { once: true });
    }

    return this.pendingWorkerRequests.track(request.requestId, () => {
      try {
        worker.postMessage(request, [request.pcm.buffer]);
      } catch (error) {
        throw error instanceof Error ? error : new Error(String(error));
      }
    }, {
      ...(options.onProgress ? { onProgress: options.onProgress } : {}),
    }).finally(() => {
      options.signal?.removeEventListener('abort', abortListener);
    });
  }

  private async performAnalyzeAudioBuffer(input: AnalyzeAudioBufferExecutionInput): Promise<AcousticFeatureResult> {
    const config = normalizeConfig(input.config);
    const runtimeConfig = input.runtimeConfig;
    const providerState = input.providerState;
    const mono = downmixToMono(input.audioBuffer);

    if (providerState.effectiveProviderId !== LOCAL_ACOUSTIC_PROVIDER_DEFINITION.id) {
      try {
        return await this.externalProviderAnalyzeImpl({
          mediaKey: input.mediaKey,
          pcm: mono,
          sampleRate: input.audioBuffer.sampleRate,
          config,
          providerId: providerState.effectiveProviderId,
          externalConfig: runtimeConfig.externalProvider,
          ...(input.signal ? { signal: input.signal } : {}),
          ...(input.onProgress ? { onProgress: (processedFrames, totalFrames) => input.onProgress?.({
            phase: 'analyzing',
            processedFrames,
            totalFrames,
            ratio: totalFrames > 0 ? processedFrames / totalFrames : 0,
          }) } : {}),
        });
      } catch (error) {
        log.warn('External acoustic provider failed, falling back to local provider', {
          requestedProviderId: providerState.requestedProviderId,
          effectiveProviderId: providerState.effectiveProviderId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return this.dispatchToWorker({
      requestId: buildRequestId(),
      type: 'analyze',
      mediaKey: input.mediaKey,
      pcm: mono,
      sampleRate: input.audioBuffer.sampleRate,
      config,
    }, input);
  }

  private async analyzeWithExternalProvider(input: AcousticProviderAnalyzeInput & {
    providerId: string;
    externalConfig: ExternalAcousticProviderConfig;
  }): Promise<AcousticFeatureResult> {
    const endpoint = input.externalConfig.endpoint?.trim();
    if (!endpoint) {
      throw new Error('External provider endpoint is not configured.');
    }
    if (!isAllowedExternalProviderEndpoint(endpoint)) {
      throw new Error('External provider endpoint must use HTTPS. HTTP is allowed only for localhost.');
    }

    const timeoutController = new AbortController();
    const timeoutMs = input.externalConfig.timeoutMs;
    const timeoutId = globalThis.setTimeout(() => timeoutController.abort(), timeoutMs);

    const abortListener = () => timeoutController.abort();
    if (input.signal) {
      if (input.signal.aborted) {
        timeoutController.abort();
      } else {
        input.signal.addEventListener('abort', abortListener, { once: true });
      }
    }

    const cleanup = () => {
      globalThis.clearTimeout(timeoutId);
      input.signal?.removeEventListener('abort', abortListener);
    };
    try {
      if (input.pcm.byteLength > MAX_EXTERNAL_PROVIDER_PCM_BYTES) {
        throw new Error(`External provider payload exceeds limit (${MAX_EXTERNAL_PROVIDER_PCM_BYTES} bytes)`);
      }

      const pcmArrayBuffer = new ArrayBuffer(input.pcm.byteLength);
      new Uint8Array(pcmArrayBuffer).set(new Uint8Array(input.pcm.buffer, input.pcm.byteOffset, input.pcm.byteLength));
      const metadata = {
        mediaKey: input.mediaKey,
        providerId: input.providerId,
        sampleRate: input.sampleRate,
        config: input.config,
      };
      const formData = new FormData();
      formData.set('metadata', JSON.stringify(metadata));
      formData.set('pcm_f32le', new Blob([pcmArrayBuffer], { type: 'application/octet-stream' }), `${input.mediaKey}.f32`);

      const request = (async () => {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'x-jieyu-acoustic-wire-format': 'multipart-f32-v1',
            ...(input.externalConfig.apiKey ? { authorization: `Bearer ${input.externalConfig.apiKey}` } : {}),
          },
          body: formData,
          signal: timeoutController.signal,
        });

        if (!response.ok) {
          throw new Error(`External provider request failed: ${response.status}`);
        }

        const payload = await response.json();
        if (!payload || typeof payload !== 'object' || !('result' in payload)) {
          throw new Error('External provider returned malformed payload.');
        }

        return (payload as { result: AcousticFeatureResult }).result;
      })();

      const result = await wrapPromiseWithSignal(request, input.signal);
      input.onProgress?.(1, 1);
      return result;
    } finally {
      cleanup();
    }
  }

  private ensureWorker(): WorkerLike {
    if (!this.worker) {
      this.worker = this.workerFactory?.() ?? (new Worker(new URL('./acousticAnalysis.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike);
      this.worker.onmessage = (event: MessageEvent<AcousticWorkerResponse>) => {
        const payload = event.data;
        if (!payload?.requestId) {
          return;
        }

        if (payload.type === 'progress') {
          this.pendingWorkerRequests.notifyProgress(payload.requestId, payload.progress);
          return;
        }

        if (payload.type !== 'result') {
          return;
        }

        if (!this.pendingWorkerRequests.get(payload.requestId)) {
          return;
        }

        if (!payload.ok || !payload.result) {
          this.pendingWorkerRequests.reject(payload.requestId, new Error(payload.error ?? 'Acoustic analysis failed'));
          return;
        }

        this.pendingWorkerRequests.resolve(payload.requestId, payload.result);
      };
      this.worker.onerror = (event) => {
        const error = new Error(event.message || 'Acoustic worker error');
        this.pendingWorkerRequests.rejectAll(error);
      };
    }
    return this.worker;
  }

  private async setCached(cacheKey: string, mediaKey: string, result: AcousticFeatureResult): Promise<void> {
    this.cache.set(cacheKey, {
      result,
      cachedAt: this.now(),
      lastAccessedAt: this.now(),
    });
    this.evictIfNeeded();
    await acousticAnalysisCacheDB.put({
      cacheKey,
      mediaKey,
      result,
      now: this.now(),
    });
  }

  private async getCached(cacheKey: string): Promise<AcousticFeatureResult | null> {
    const memoryEntry = this.cache.get(cacheKey);
    if (memoryEntry) {
      memoryEntry.lastAccessedAt = this.now();
      return memoryEntry.result;
    }

    const persisted = await acousticAnalysisCacheDB.get(cacheKey, this.now());
    if (!persisted) return null;

    this.cache.set(cacheKey, {
      result: persisted,
      cachedAt: this.now(),
      lastAccessedAt: this.now(),
    });
    this.evictIfNeeded();
    return persisted;
  }

  private evictIfNeeded(): void {
    while (this.cache.size > MAX_CACHE_ENTRIES) {
      let oldestKey: string | null = null;
      let oldestAccess = Number.POSITIVE_INFINITY;
      for (const [cacheKey, entry] of this.cache.entries()) {
        if (entry.lastAccessedAt < oldestAccess) {
          oldestAccess = entry.lastAccessedAt;
          oldestKey = cacheKey;
        }
      }
      if (!oldestKey) return;
      this.cache.delete(oldestKey);
    }
  }

  dispose(): void {
    const disposedError = new Error('Acoustic analysis service disposed');
    this.pendingWorkerRequests.rejectAll(disposedError);
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
    this.cache.clear();
  }
}