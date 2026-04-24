/**
 * WhisperXVadService — WhisperX Cut & Merge VAD 高级服务层
 * High-level VAD service based on WhisperX Cut & Merge strategy.
 *
 * 通过 Worker 消息协议与 vadWorker 通信，将 Silero VAD ONNX 推理的结果
 * 暴露为简洁的 async API：`detectSpeechSegments(audioBuffer)`。
 *
 * Communicates with vadWorker via a Worker message protocol, exposing
 * Silero VAD ONNX inference as a clean async API.
 *
 * 架构说明 | Architecture note:
 *   - 主服务实例持有 Worker 引用，管理生命周期
 *   - 每次 `detectSpeechSegments` 发送一个带 UUID 的消息，等待对应 `result`
 *   - Worker 未加载时回退到基于能量的 VadService
 */

import { detectVadSegments } from '../VadService';
import type { VadWorkerSegment } from '../../workers/vadWorker';
import { createLogger } from '../../observability/logger';
import { nextPhysicalWorkerId } from '../../observability/managedWorkerRegistry';
import { trackBrowserWorkerLifecycle } from '../../observability/trackBrowserWorkerLifecycle';
import { PendingWorkerRequestStore } from '../PendingWorkerRequestStore';

const log = createLogger('WhisperXVadService');

export interface SpeechSegment {
  /** 语音段起始时间（秒）| Speech segment start in seconds */
  start: number;
  /** 语音段结束时间（秒）| Speech segment end in seconds */
  end: number;
  /** 置信度 [0, 1]，能量降级时为 undefined | Confidence [0, 1]; undefined when using energy fallback */
  confidence?: number;
}

export interface WhisperXVadProgress {
  phase: 'detecting' | 'done';
  processedFrames: number;
  totalFrames: number;
  ratio: number;
}

export interface WhisperXVadOptions {
  /** VAD Worker 模型 URL，默认 '/models/silero_vad.onnx' */
  modelUrl?: string;
  /** 超时毫秒数（等待 Worker 就绪），默认 10 000 ms */
  initTimeoutMs?: number;
}

export interface DetectSpeechSegmentsOptions {
  signal?: AbortSignal;
  onProgress?: (progress: WhisperXVadProgress) => void;
}

/**
 * 流式 VAD 检测会话，调用方按块发送 PCM，结束后一次返回所有语音段。
 * Streaming VAD detection session. Caller sends PCM chunks and gets all segments at the end.
 */
export interface StreamingVadSession {
  /** 发送一块 PCM（将 transfer 底层 ArrayBuffer）| Send a PCM chunk (transfers the underlying ArrayBuffer) */
  sendChunk(pcm: Float32Array): void;
  /** 结束流式推理并返回最终语音段 | Finalize streaming and return final segments */
  finish(): Promise<SpeechSegment[]>;
  /** 取消流式推理 | Cancel streaming detection */
  cancel(): void;
}

function createAbortError(): Error {
  const error = new Error('VAD detect aborted');
  error.name = 'AbortError';
  return error;
}

// ── WhisperXVadService ────────────────────────────────────────────────────────

export class WhisperXVadService {
  private worker: Worker | null = null;
  private vadWorkerTrackingRelease: (() => void) | null = null;
  private ready = false;
  private readonly pendingRequests = new PendingWorkerRequestStore<SpeechSegment[], WhisperXVadProgress>();

  constructor(private readonly options: WhisperXVadOptions = {}) {}

  /**
   * 初始化 Worker 并等待模型加载完成。
   * Initialises the Worker and waits for the model to load.
   */
  async init(): Promise<void> {
    if (this.ready) return;

    return new Promise((resolve, reject) => {
      const timeoutMs = this.options.initTimeoutMs ?? 10_000;
      const timer = setTimeout(() => {
        const error = new Error(`WhisperXVadService: Worker init timed out after ${timeoutMs}ms`);
        this.resetWorker(error);
        reject(error);
      }, timeoutMs);

      try {
        this.worker = new Worker(
          new URL('../../workers/vadWorker.ts', import.meta.url),
          { type: 'module' },
        );
        this.vadWorkerTrackingRelease?.();
        this.vadWorkerTrackingRelease = trackBrowserWorkerLifecycle(this.worker, {
          id: nextPhysicalWorkerId('vadWhisperX'),
          source: 'WhisperXVadService',
        });
      } catch (err) {
        clearTimeout(timer);
        reject(new Error(`WhisperXVadService: Failed to create Worker — ${err instanceof Error ? err.message : String(err)}`));
        return;
      }

      this.worker.onmessage = (event: MessageEvent) => {
        const msg = event.data as { type: string; id?: string; segments?: VadWorkerSegment[]; message?: string; processedFrames?: number; totalFrames?: number; ratio?: number };

        if (msg.type === 'ready') {
          clearTimeout(timer);
          this.ready = true;
          resolve();
          return;
        }

        if (msg.type === 'progress' && msg.id) {
          this.pendingRequests.notifyProgress(msg.id, {
            phase: (msg.ratio ?? 0) >= 1 ? 'done' : 'detecting',
            processedFrames: msg.processedFrames ?? 0,
            totalFrames: msg.totalFrames ?? 0,
            ratio: msg.ratio ?? 0,
          });
          return;
        }

        if (msg.type === 'result' && msg.id) {
          this.pendingRequests.resolve(msg.id, (msg.segments ?? []).map((s) => ({
            start: s.start,
            end: s.end,
            confidence: s.confidence,
          })));
          return;
        }

        if (msg.type === 'error') {
          log.warn('VAD Worker error', { message: msg.message });
          if (msg.id) {
            this.pendingRequests.reject(msg.id, new Error(msg.message ?? 'VAD worker error'));
          } else if (!this.ready) {
            clearTimeout(timer);
            const error = new Error(msg.message ?? 'VAD worker error');
            this.resetWorker(error);
            reject(error);
          } else {
            this.resetWorker(new Error(msg.message ?? 'VAD worker error'));
          }
        }
      };

      this.worker.onerror = (err) => {
        log.warn('VAD Worker onerror', { message: err.message });
        clearTimeout(timer);
        const error = new Error(`VAD Worker error: ${err.message}`);
        this.resetWorker(error);
        if (!this.ready) reject(error);
      };

      this.worker.onmessageerror = () => {
        clearTimeout(timer);
        const error = new Error('VAD Worker message decode error');
        this.resetWorker(error);
        if (!this.ready) reject(error);
      };

      this.worker.postMessage({
        type: 'init',
        modelUrl: this.options.modelUrl ?? '/models/silero_vad.onnx',
      });
    });
  }

  /**
   * 对 AudioBuffer 执行 VAD，返回语音段列表。
   * 若 Worker 未初始化或不可用，自动回退到基于能量的 detectVadSegments。
   *
   * Detects speech segments in an AudioBuffer.
   * Falls back to energy-based detection if the Worker is unavailable.
   */
  async detectSpeechSegments(buffer: AudioBuffer, options: DetectSpeechSegmentsOptions = {}): Promise<SpeechSegment[]> {
    if (!this.ready || !this.worker) {
      log.debug('VAD Worker not ready, falling back to energy-based VAD');
      return detectVadSegments(buffer).map((s) => ({ start: s.start, end: s.end }));
    }

    if (options.signal?.aborted) {
      throw createAbortError();
    }

    // 提取单声道 PCM | Extract mono PCM
    const pcm = extractMonoPcm(buffer);

    const id = generateId();
    const abortListener = () => {
      this.pendingRequests.reject(id, createAbortError());
      this.worker?.postMessage({ type: 'cancel', id });
    };
    options.signal?.addEventListener('abort', abortListener, { once: true });

    try {
      return await this.pendingRequests.track(id, () => {
        this.worker!.postMessage(
          { type: 'detect', id, pcm, sampleRate: buffer.sampleRate },
          [pcm.buffer],
        );
      }, {
        ...(options.onProgress !== undefined ? { onProgress: options.onProgress } : {}),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }
      const workerUnavailable = !this.ready || !this.worker;
      if (!workerUnavailable) {
        throw error instanceof Error ? error : new Error(String(error));
      }
      log.warn('VAD Worker detect failed, falling back to energy-based VAD', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.resetWorker();
      return detectVadSegments(buffer).map((s) => ({ start: s.start, end: s.end }));
    } finally {
      options.signal?.removeEventListener('abort', abortListener);
    }
  }

  /** 返回当前实际运行引擎 | Report the currently active runtime engine */
  getRuntimeEngine(): 'silero' | 'energy' {
    return this.ready && this.worker ? 'silero' : 'energy';
  }

  /**
   * 启动流式 VAD 检测会话。调用方按块发送 PCM，最终一次返回所有语音段。
   * Worker 未初始化时抛出异常（流式模式不支持能量降级）。
   *
   * Start a streaming VAD detection session. Caller sends PCM chunks, gets all segments at the end.
   * Throws if Worker is not initialized (streaming mode doesn't support energy fallback).
   */
  startStreamingDetection(sampleRate: number, options?: DetectSpeechSegmentsOptions): StreamingVadSession {
    if (!this.ready || !this.worker) {
      throw new Error('WhisperXVadService: Worker not ready for streaming detection');
    }

    const id = generateId();
    const worker = this.worker;
    const pendingRequests = this.pendingRequests;

    const resultPromise = pendingRequests.track(id, () => {
      worker.postMessage({ type: 'detect-stream-start', id, sampleRate });
    }, {
      ...(options?.onProgress !== undefined ? { onProgress: options.onProgress } : {}),
    });

    const abortListener = options?.signal ? () => {
      pendingRequests.reject(id, createAbortError());
      worker.postMessage({ type: 'cancel', id });
    } : undefined;

    if (abortListener && options?.signal) {
      options.signal.addEventListener('abort', abortListener, { once: true });
    }

    const cleanup = (): void => {
      if (abortListener && options?.signal) {
        options.signal.removeEventListener('abort', abortListener);
      }
    };

    let cancelled = false; // 取消标志，防止 cancel 后继续发送消息 | Cancelled flag to prevent sending messages after cancel

    return {
      sendChunk(pcm: Float32Array): void {
        if (cancelled) return;
        worker.postMessage(
          { type: 'detect-stream-chunk', id, pcm },
          [pcm.buffer],
        );
      },
      async finish(): Promise<SpeechSegment[]> {
        if (cancelled) {
          cleanup();
          throw createAbortError();
        }
        worker.postMessage({ type: 'detect-stream-end', id });
        try {
          return await resultPromise;
        } finally {
          cleanup();
        }
      },
      cancel(): void {
        if (cancelled) return;
        cancelled = true;
        pendingRequests.reject(id, createAbortError());
        resultPromise.catch(() => {}); // 抑制未处理拒绝 | Suppress unhandled rejection
        worker.postMessage({ type: 'cancel', id });
        cleanup();
      },
    };
  }

  /** 重置 Silero 隐藏状态（切换音频文件时调用）| Reset Silero hidden state (call on audio file switch) */
  resetState(): void {
    if (this.worker && this.ready) {
      this.worker.postMessage({ type: 'reset' });
    }
  }

  /** 销毁 Worker | Terminate the Worker */
  dispose(): void {
    this.resetWorker(new Error('WhisperXVadService disposed'));
  }

  private resetWorker(error?: Error): void {
    if (this.worker) {
      this.vadWorkerTrackingRelease?.();
      this.vadWorkerTrackingRelease = null;
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.onmessageerror = null;
      this.worker.terminate();
      this.worker = null;
    }
    this.ready = false;
    if (error) {
      this.pendingRequests.rejectAll(error);
    }
  }
}

// ── 工具函数 | Utility functions ─────────────────────────────────────────────

/**
 * 将 AudioBuffer 混音为单声道 Float32Array。
 * Downmix AudioBuffer to mono Float32Array.
 */
function extractMonoPcm(buffer: AudioBuffer): Float32Array {
  const len = buffer.length;
  const mono = new Float32Array(len);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const chData = buffer.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      mono[i]! += chData[i]!;
    }
  }
  if (buffer.numberOfChannels > 1) {
    const inv = 1 / buffer.numberOfChannels;
    for (let i = 0; i < len; i++) {
      mono[i]! *= inv;
    }
  }
  return mono;
}

/**
 * 生成轻量唯一 ID（取代 crypto.randomUUID 以避免 Worker 环境兼容性问题）。
 * Generates a lightweight unique ID.
 */
function generateId(): string {
  return `vad-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
