import { PendingWorkerRequestStore } from '../PendingWorkerRequestStore';
import { createLogger } from '../../observability/logger';
import {
  buildAcousticCacheKey,
  DEFAULT_ACOUSTIC_ANALYSIS_CONFIG,
  type AcousticAnalysisConfig,
  type AcousticFeatureResult,
} from '../../utils/acousticOverlayTypes';
import { acousticAnalysisCacheDB } from './AcousticAnalysisCacheDB';

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
  onmessage: ((event: MessageEvent<AcousticWorkerResult>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage: (message: AcousticWorkerRequest, transfer?: Transferable[]) => void;
  terminate: () => void;
}

interface AcousticWorkerRequest {
  requestId: string;
  type: 'analyze';
  mediaKey: string;
  pcm: Float32Array;
  sampleRate: number;
  config: AcousticAnalysisConfig;
}

interface AcousticWorkerResult {
  type: 'result';
  requestId: string;
  ok: boolean;
  result?: AcousticFeatureResult;
  error?: string;
}

interface AnalyzeMediaInput {
  mediaKey: string;
  mediaUrl: string;
  config?: Partial<AcousticAnalysisConfig>;
}

interface AnalyzeAudioBufferInput {
  mediaKey: string;
  audioBuffer: AudioBuffer;
  config?: Partial<AcousticAnalysisConfig>;
}

interface AcousticAnalysisServiceOptions {
  fetchImpl?: (input: string) => Promise<AudioResponseLike>;
  audioContextFactory?: () => AudioContextLike;
  workerFactory?: () => WorkerLike;
  now?: () => number;
}

interface CacheEntry {
  result: AcousticFeatureResult;
  cachedAt: number;
  lastAccessedAt: number;
}

const MAX_CACHE_ENTRIES = 8;

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
  private readonly now: NonNullable<AcousticAnalysisServiceOptions['now']>;
  private worker: WorkerLike | null = null;
  private readonly pendingWorkerRequests = new PendingWorkerRequestStore<AcousticFeatureResult>();

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
    this.now = options.now ?? Date.now;
  }

  async analyzeMedia(input: AnalyzeMediaInput): Promise<AcousticFeatureResult> {
    const config = normalizeConfig(input.config);
    const cacheKey = buildAcousticCacheKey(input.mediaKey, config);
    return this.runCachedAnalysis(cacheKey, input.mediaKey, async () => {
      let audioContext: AudioContextLike | null = null;
      try {
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
        });
      } finally {
        await closeAudioContext(audioContext);
      }
    });
  }

  async analyzeAudioBuffer(input: AnalyzeAudioBufferInput): Promise<AcousticFeatureResult> {
    const config = normalizeConfig(input.config);
    const cacheKey = buildAcousticCacheKey(input.mediaKey, config);
    return this.runCachedAnalysis(cacheKey, input.mediaKey, () => this.performAnalyzeAudioBuffer({
      mediaKey: input.mediaKey,
      audioBuffer: input.audioBuffer,
      config,
    }));
  }

  private async runCachedAnalysis(
    cacheKey: string,
    mediaKey: string,
    runner: () => Promise<AcousticFeatureResult>,
  ): Promise<AcousticFeatureResult> {
    const cached = await this.getCached(cacheKey);
    if (cached) return cached;

    const pending = this.pending.get(cacheKey);
    if (pending) return pending;

    const task = (async () => {
      const result = await runner();
      await this.setCached(cacheKey, mediaKey, result);
      return result;
    })().finally(() => {
      this.pending.delete(cacheKey);
    });

    this.pending.set(cacheKey, task);
    return task;
  }

  private async dispatchToWorker(request: AcousticWorkerRequest): Promise<AcousticFeatureResult> {
    const worker = this.ensureWorker();
    return this.pendingWorkerRequests.track(request.requestId, () => {
      try {
        worker.postMessage(request, [request.pcm.buffer]);
      } catch (error) {
        throw error instanceof Error ? error : new Error(String(error));
      }
    });
  }

  private async performAnalyzeAudioBuffer(input: AnalyzeAudioBufferInput): Promise<AcousticFeatureResult> {
    const config = normalizeConfig(input.config);
    const mono = downmixToMono(input.audioBuffer);
    return this.dispatchToWorker({
      requestId: buildRequestId(),
      type: 'analyze',
      mediaKey: input.mediaKey,
      pcm: mono,
      sampleRate: input.audioBuffer.sampleRate,
      config,
    });
  }

  private ensureWorker(): WorkerLike {
    if (!this.worker) {
      this.worker = this.workerFactory?.() ?? (new Worker(new URL('./acousticAnalysis.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike);
      this.worker.onmessage = (event: MessageEvent<AcousticWorkerResult>) => {
        const payload = event.data;
        if (!payload || payload.type !== 'result' || !payload.requestId) {
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