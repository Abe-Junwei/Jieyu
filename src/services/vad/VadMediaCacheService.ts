import { createLogger } from '../../observability/logger';
import { WhisperXVadService, type DetectSpeechSegmentsOptions, type SpeechSegment } from './WhisperXVadService';
import { vadCache, type VadCacheEntry } from './VadCacheService';

const log = createLogger('VadMediaCacheService');

interface AudioResponseLike {
  ok: boolean;
  status?: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
  headers?: { get: (name: string) => string | null };
}

/**
 * 自动 VAD 预热的文件大小上限（字节）。超过此值跳过自动预热，避免 decodeAudioData OOM。
 * Max file size for automatic VAD warming. Files above this skip warming to prevent decodeAudioData OOM.
 */
const VAD_AUTO_WARM_MAX_BYTES = 100 * 1024 * 1024; // 100 MB

interface AudioContextLike {
  decodeAudioData: (audioData: ArrayBuffer) => Promise<AudioBuffer>;
  close?: () => Promise<void> | void;
}

interface VadRuntimeLike {
  init?: () => Promise<void>;
  detectSpeechSegments: (buffer: AudioBuffer, options?: DetectSpeechSegmentsOptions) => Promise<SpeechSegment[]>;
  dispose?: () => void;
  getRuntimeEngine?: () => 'silero' | 'energy';
}

export interface VadCacheWarmupStatus {
  state: 'warming';
  engine?: 'silero' | 'energy';
  progressRatio: number;
  processedFrames: number;
  totalFrames: number;
}

export interface EnsureVadCacheForMediaOptions {
  mediaId?: string;
  mediaUrl?: string;
  fetchImpl?: (input: string) => Promise<AudioResponseLike>;
  audioContextFactory?: () => AudioContextLike;
  vadRuntime?: VadRuntimeLike;
  now?: () => number;
}

const inflightByMediaId = new Map<string, Promise<VadCacheEntry | null>>();
const warmupStatusByMediaId = new Map<string, VadCacheWarmupStatus>();
const warmupListenersByMediaId = new Map<string, Set<() => void>>();

function emitWarmupStatus(mediaId: string): void {
  warmupListenersByMediaId.get(mediaId)?.forEach((listener) => {
    listener();
  });
}

function setWarmupStatus(mediaId: string, status: VadCacheWarmupStatus): void {
  warmupStatusByMediaId.set(mediaId, status);
  emitWarmupStatus(mediaId);
}

function clearWarmupStatus(mediaId: string): void {
  if (!warmupStatusByMediaId.delete(mediaId)) return;
  emitWarmupStatus(mediaId);
}

export function getVadCacheWarmupStatus(mediaId: string | undefined): VadCacheWarmupStatus | null {
  if (!mediaId) return null;
  return warmupStatusByMediaId.get(mediaId) ?? null;
}

export function subscribeVadCacheWarmupStatus(mediaId: string | undefined, onStoreChange: () => void): () => void {
  if (!mediaId) {
    return () => {};
  }

  const listeners = warmupListenersByMediaId.get(mediaId) ?? new Set<() => void>();
  listeners.add(onStoreChange);
  warmupListenersByMediaId.set(mediaId, listeners);

  return () => {
    const current = warmupListenersByMediaId.get(mediaId);
    if (!current) return;
    current.delete(onStoreChange);
    if (current.size === 0) {
      warmupListenersByMediaId.delete(mediaId);
    }
  };
}

function createBrowserAudioContext(): AudioContextLike {
  const AudioContextCtor = window.AudioContext ?? (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error('AudioContext unavailable');
  }
  return new AudioContextCtor();
}

async function closeAudioContext(audioContext: AudioContextLike | null): Promise<void> {
  if (!audioContext?.close) return;
  try {
    await audioContext.close();
  } catch (error) {
    log.warn('Failed to close VAD media AudioContext', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function ensureVadCacheForMedia(options: EnsureVadCacheForMediaOptions): Promise<VadCacheEntry | null> {
  const { mediaId, mediaUrl } = options;
  if (!mediaId || !mediaUrl) return null;

  const cached = vadCache.get(mediaId);
  if (cached) return cached;

  const inflight = inflightByMediaId.get(mediaId);
  if (inflight) return inflight;

  const fetchImpl = options.fetchImpl ?? (async (input: string) => {
    const response = await fetch(input);
    return response as AudioResponseLike;
  });
  const audioContextFactory = options.audioContextFactory ?? createBrowserAudioContext;
  const vadRuntime = options.vadRuntime ?? new WhisperXVadService();
  const ownsVadRuntime = options.vadRuntime === undefined;
  const now = options.now ?? Date.now;

  const task = (async () => {
    let audioContext: AudioContextLike | null = null;
    try {
      const initialEngine = vadRuntime.getRuntimeEngine?.();
      setWarmupStatus(mediaId, {
        state: 'warming',
        ...(initialEngine !== undefined ? { engine: initialEngine } : {}),
        progressRatio: 0,
        processedFrames: 0,
        totalFrames: 0,
      });
      if (vadRuntime.init) {
        try {
          await vadRuntime.init();
        } catch (error) {
          log.warn('VAD runtime init failed, continuing with fallback engine', {
            mediaId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const response = await fetchImpl(mediaUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch media for VAD cache: ${response.status ?? 'unknown'}`);
      }

      // 大文件跳过自动预热，避免 decodeAudioData 分配数 GB PCM 导致 OOM | Skip large files to prevent multi-GB PCM allocation from decodeAudioData
      const contentLength = Number(response.headers?.get('content-length') ?? 0);
      if (contentLength > VAD_AUTO_WARM_MAX_BYTES) {
        log.info('Skipping automatic VAD warming for large media file', { mediaId, contentLength });
        clearWarmupStatus(mediaId);
        return null;
      }

      const audioData = await response.arrayBuffer();
      // 二次校验：Content-Length 可能为 0（blob URL），用实际大小兜底 | Double-check with actual size; Content-Length may be 0 for blob URLs
      if (audioData.byteLength > VAD_AUTO_WARM_MAX_BYTES) {
        log.info('Skipping automatic VAD warming for large media file', { mediaId, byteLength: audioData.byteLength });
        clearWarmupStatus(mediaId);
        return null;
      }

      audioContext = audioContextFactory();
      const audioBuffer = await audioContext.decodeAudioData(audioData);
      const segments = await vadRuntime.detectSpeechSegments(audioBuffer, {
        onProgress: (progress) => {
          const progressEngine = vadRuntime.getRuntimeEngine?.();
          setWarmupStatus(mediaId, {
            state: 'warming',
            ...(progressEngine !== undefined ? { engine: progressEngine } : {}),
            progressRatio: progress.ratio,
            processedFrames: progress.processedFrames,
            totalFrames: progress.totalFrames,
          });
        },
      });

      const entry: VadCacheEntry = {
        engine: vadRuntime.getRuntimeEngine?.() ?? 'energy',
        segments,
        durationSec: audioBuffer.duration,
        cachedAt: now(),
      };
      vadCache.set(mediaId, entry);
      clearWarmupStatus(mediaId);
      return entry;
    } catch (error) {
      log.warn('Failed to warm VAD cache for media', {
        mediaId,
        mediaUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      clearWarmupStatus(mediaId);
      return null;
    } finally {
      inflightByMediaId.delete(mediaId);
      await closeAudioContext(audioContext);
      if (ownsVadRuntime) {
        vadRuntime.dispose?.();
      }
    }
  })();

  inflightByMediaId.set(mediaId, task);
  return task;
}
