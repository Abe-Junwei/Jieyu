import { createLogger } from '../../observability/logger';
import { vadCache, type VadCacheEntry } from './VadCacheService';
import { getVadMediaBackend, type VadMediaBackend, type VadMediaRef } from './VadMediaBackend';

const log = createLogger('VadMediaCacheService');

/**
 * 自动 VAD 预热的文件大小上限（字节）。超过此值跳过自动预热，避免 decodeAudioData OOM。
 * Max file size for automatic VAD warming. Files above this skip warming to prevent decodeAudioData OOM.
 */
export const VAD_AUTO_WARM_MAX_BYTES = 100 * 1024 * 1024; // 100 MB

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
  /** 已知的媒体 Blob 字节数，若提供则在 fetch 前即可跳过大文件 | Known media blob byte size; enables pre-fetch gate for large files */
  mediaBlobSize?: number;
  /** 终止信号 | Abort signal */
  signal?: AbortSignal;
  /** 测试注入用后端，生产环境通过 registerVadMediaBackend 注册 | Injected backend for testing; production uses registerVadMediaBackend */
  backend?: VadMediaBackend;
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

export async function ensureVadCacheForMedia(options: EnsureVadCacheForMediaOptions): Promise<VadCacheEntry | null> {
  const { mediaId, mediaUrl } = options;
  if (!mediaId || !mediaUrl) return null;

  const cached = vadCache.get(mediaId);
  if (cached) return cached;

  const inflight = inflightByMediaId.get(mediaId);
  if (inflight) return inflight;

  const backend = options.backend ?? getVadMediaBackend();
  if (!backend) {
    log.warn('No VAD media backend registered, skipping VAD warming', { mediaId });
    return null;
  }

  const ref: VadMediaRef = { mediaId, mediaUrl, ...(options.mediaBlobSize !== undefined && { byteSize: options.mediaBlobSize }) };
  if (!backend.canProcess(ref)) {
    log.info('VAD backend cannot process media (size/format gate)', { mediaId, byteSize: options.mediaBlobSize });
    return null;
  }

  const now = options.now ?? Date.now;

  const task = (async () => {
    try {
      setWarmupStatus(mediaId, {
        state: 'warming',
        progressRatio: 0,
        processedFrames: 0,
        totalFrames: 0,
      });

      const result = await backend.run(ref, {
        ...(options.signal !== undefined && { signal: options.signal }),
        onProgress: (progress) => {
          setWarmupStatus(mediaId, {
            state: 'warming',
            ...(progress.engine !== undefined ? { engine: progress.engine } : {}),
            progressRatio: progress.ratio,
            processedFrames: progress.processedFrames,
            totalFrames: progress.totalFrames,
          });
        },
      });

      const entry: VadCacheEntry = {
        engine: result.engine,
        segments: result.segments,
        durationSec: result.durationSec,
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
    }
  })();

  inflightByMediaId.set(mediaId, task);
  return task;
}
