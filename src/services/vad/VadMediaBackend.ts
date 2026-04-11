/**
 * VadMediaBackend — VAD 媒体加载平台抽象接口
 * Platform abstraction interface for loading media PCM data for VAD processing.
 *
 * 浏览器端：fetch + decodeAudioData 一次性全量解码
 * 桌面端（未来）：fs.read / FFmpeg 管道分块解码
 *
 * Browser: fetch + decodeAudioData full decode in one shot.
 * Desktop (future): fs.read / FFmpeg pipe chunked decode.
 */

import type { SpeechSegment } from './WhisperXVadService';

// ── 媒体引用 | Media reference ───────────────────────────────────────────────

/**
 * 平台无关的媒体引用。
 * Platform-agnostic media reference.
 *
 * 浏览器端通常是 blob URL / http URL；桌面端通常是文件路径。
 * On browser this is typically a blob/http URL; on desktop a file path.
 */
export interface VadMediaRef {
  /** 媒体唯一标识 | Unique media identifier */
  mediaId: string;
  /** 媒体地址（URL 或文件路径）| Media address (URL or file path) */
  mediaUrl: string;
  /** 已知的字节大小（若可用）| Known byte size if available */
  byteSize?: number;
}

// ── 推理结果 | Inference result ──────────────────────────────────────────────

/**
 * 后端返回的 VAD 推理结果。
 * VAD inference result returned by a backend.
 */
export interface VadMediaBackendResult {
  /** 推理引擎 | Inference engine used */
  engine: 'silero' | 'energy';
  /** 检测到的语音段 | Detected speech segments */
  segments: SpeechSegment[];
  /** 音频总时长（秒）| Total audio duration in seconds */
  durationSec: number;
}

// ── 进度回调 | Progress callback ─────────────────────────────────────────────

export interface VadMediaBackendProgress {
  engine?: 'silero' | 'energy';
  processedFrames: number;
  totalFrames: number;
  ratio: number;
}

// ── 选项 | Options ───────────────────────────────────────────────────────────

export interface VadMediaBackendRunOptions {
  /** 进度回调 | Progress callback */
  onProgress?: (progress: VadMediaBackendProgress) => void;
  /** 终止信号 | Abort signal */
  signal?: AbortSignal;
}

// ── 接口 | Interface ─────────────────────────────────────────────────────────

/**
 * VAD 媒体加载后端接口。
 * 每个平台（浏览器/桌面）实现此接口，VadMediaCacheService 统一调用。
 *
 * VAD media loading backend interface.
 * Each platform (browser/desktop) implements this; VadMediaCacheService delegates uniformly.
 */
export interface VadMediaBackend {
  /**
   * 判断该后端是否能处理指定媒体（大小/格式门控）。
   * Whether this backend can handle the given media (size/format gate).
   *
   * 返回 false 时 VadMediaCacheService 将跳过 VAD 预热。
   * When false, VadMediaCacheService skips VAD warming entirely.
   */
  canProcess(ref: VadMediaRef): boolean;

  /**
   * 加载媒体并运行 VAD 推理，返回结果。
   * Load media and run VAD inference, returning the result.
   */
  run(ref: VadMediaRef, options?: VadMediaBackendRunOptions): Promise<VadMediaBackendResult>;

  /**
   * 释放后端持有的资源（Worker、文件句柄等）。
   * Release backend-held resources (workers, file handles, etc.).
   */
  dispose?: () => void;
}

// ── 注册 | Registry ──────────────────────────────────────────────────────────

let activeBackend: VadMediaBackend | null = null;

/**
 * 注册平台 VAD 后端。桌面端 main 启动时调用；浏览器端在模块加载时自动注册默认后端。
 * Register a platform VAD backend. Desktop calls this at startup; browser auto-registers a default.
 */
export function registerVadMediaBackend(backend: VadMediaBackend): void {
  activeBackend = backend;
}

/**
 * 获取当前活跃的 VAD 后端。未注册时返回 null。
 * Get the currently active VAD backend. Returns null if none registered.
 */
export function getVadMediaBackend(): VadMediaBackend | null {
  return activeBackend;
}
