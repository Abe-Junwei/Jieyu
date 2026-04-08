import { createLogger } from '../../observability/logger';
import { WhisperXVadService, type DetectSpeechSegmentsOptions, type SpeechSegment } from './WhisperXVadService';
import { vadCache, type VadCacheEntry } from './VadCacheService';

const log = createLogger('VadMediaCacheService');

interface AudioResponseLike {
  ok: boolean;
  status?: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

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
      setWarmupStatus(mediaId, {
        state: 'warming',
        engine: vadRuntime.getRuntimeEngine?.(),
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

      const audioData = await response.arrayBuffer();
      audioContext = audioContextFactory();
      const audioBuffer = await audioContext.decodeAudioData(audioData);
      const segments = await vadRuntime.detectSpeechSegments(audioBuffer, {
        onProgress: (progress) => {
          setWarmupStatus(mediaId, {
            state: 'warming',
            engine: vadRuntime.getRuntimeEngine?.(),
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
