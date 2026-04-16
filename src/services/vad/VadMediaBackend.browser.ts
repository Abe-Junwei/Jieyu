/**
 * VadMediaBackend.browser — 浏览器端 VAD 媒体加载后端
 * Browser VAD media loading backend.
 *
 * 策略：fetch → arrayBuffer → decodeAudioData → 全量 PCM → Silero/能量 VAD
 * Strategy: fetch → arrayBuffer → decodeAudioData → full PCM → Silero/energy VAD
 *
 * 大文件（>100MB）在 canProcess 阶段即被拒绝，避免 OOM。
 * Large files (>100MB) are rejected at canProcess to prevent OOM.
 */

import { createLogger } from '../../observability/logger';
import { VAD_AUTO_WARM_MAX_BYTES } from './VadMediaCacheService';
import { WhisperXVadService } from './WhisperXVadService';
import { registerVadMediaBackend } from './VadMediaBackend';
import type { VadMediaBackend, VadMediaBackendResult, VadMediaBackendRunOptions, VadMediaRef } from './VadMediaBackend';

const log = createLogger('VadMediaBackend.browser');

// ── AudioContext 工具 | AudioContext helpers ─────────────────────────────────

interface AudioContextLike {
  decodeAudioData: (audioData: ArrayBuffer) => Promise<AudioBuffer>;
  close?: () => Promise<void> | void;
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
    log.warn('Failed to close AudioContext', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ── 浏览器后端实现 | Browser backend implementation ─────────────────────────

export class BrowserVadMediaBackend implements VadMediaBackend {
  private vadRuntime: WhisperXVadService | null = null;

  canProcess(ref: VadMediaRef): boolean {
    // 已知字节大小时用前置门控 | Pre-gate when byte size is known
    if (ref.byteSize !== undefined && ref.byteSize > VAD_AUTO_WARM_MAX_BYTES) {
      return false;
    }
    return true;
  }

  async run(ref: VadMediaRef, options?: VadMediaBackendRunOptions): Promise<VadMediaBackendResult> {
    let audioContext: AudioContextLike | null = null;
    // 复用已有实例，避免每次 run 都创建/销毁 Worker | Reuse existing instance to avoid Worker churn per run
    if (!this.vadRuntime) {
      this.vadRuntime = new WhisperXVadService();
    }
    const vadRuntime = this.vadRuntime;
    try {
      // 初始化 VAD 运行时（幂等）| Initialize VAD runtime (idempotent)
      try {
        await vadRuntime.init();
      } catch (error) {
        log.warn('VAD runtime init failed, continuing with fallback engine', {
          mediaId: ref.mediaId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // 获取音频数据 | Fetch audio data
      const response = await fetch(ref.mediaUrl, {
        ...(options?.signal !== undefined && { signal: options.signal }),
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch media for VAD: ${response.status}`);
      }

      // Content-Length 门控 | Content-Length gate
      const contentLength = Number(response.headers?.get('content-length') ?? 0);
      if (contentLength > VAD_AUTO_WARM_MAX_BYTES) {
        throw new VadMediaTooLargeError(ref.mediaId, contentLength);
      }

      const audioData = await response.arrayBuffer();
      // blob URL 的 Content-Length 可能为 0，用实际大小兜底 | Blob URLs may have Content-Length 0, fallback to actual size
      if (audioData.byteLength > VAD_AUTO_WARM_MAX_BYTES) {
        throw new VadMediaTooLargeError(ref.mediaId, audioData.byteLength);
      }

      // 解码 + VAD 推理 | Decode + VAD inference
      audioContext = createBrowserAudioContext();
      const audioBuffer = await audioContext.decodeAudioData(audioData);
      const segments = await vadRuntime.detectSpeechSegments(audioBuffer, {
        ...(options?.signal !== undefined && { signal: options.signal }),
        ...(options?.onProgress !== undefined && {
          onProgress: (progress: import('./WhisperXVadService').WhisperXVadProgress) => {
            options.onProgress!({
              engine: vadRuntime.getRuntimeEngine?.(),
              processedFrames: progress.processedFrames,
              totalFrames: progress.totalFrames,
              ratio: progress.ratio,
            });
          },
        }),
      });

      return {
        engine: vadRuntime.getRuntimeEngine?.() ?? 'energy',
        segments,
        durationSec: audioBuffer.duration,
      };
    } finally {
      await closeAudioContext(audioContext);
      // 不销毁 vadRuntime：复用 Worker 实例 | Don't dispose vadRuntime: reuse Worker instance
    }
  }

  dispose(): void {
    this.vadRuntime?.dispose();
    this.vadRuntime = null;
  }
}

/**
 * 媒体文件过大，浏览器端无法安全处理。
 * Media file too large for safe browser-side processing.
 */
export class VadMediaTooLargeError extends Error {
  readonly mediaId: string;
  readonly byteSize: number;

  constructor(mediaId: string, byteSize: number) {
    super(`Media ${mediaId} is too large for browser VAD (${byteSize} bytes)`);
    this.name = 'VadMediaTooLargeError';
    this.mediaId = mediaId;
    this.byteSize = byteSize;
  }
}

// ── 自动注册 | Auto-register ────────────────────────────────────────────────
registerVadMediaBackend(new BrowserVadMediaBackend());
